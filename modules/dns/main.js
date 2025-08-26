import dns from 'dns';
import net from 'net';
import fs from 'fs';
import DNS2 from 'dns2';
import { optionalAuthMiddleware } from '../../auth.js';

const DNS_TIMEOUT = 5000;
const dnsCache = new Map();

// Clean up expired cache entries every 60 seconds
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of dnsCache.entries()) {
        if (now - entry.timestamp > 60000) {
            dnsCache.delete(key);
        }
    }
}, 60000);

/**
 * Get system DNS servers from /etc/resolv.conf or use fallback
 */
function getSystemDNSServers() {
    try {
        const resolvConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
        const nameservers = [];
        
        for (const line of resolvConf.split('\n')) {
            const match = line.match(/^nameserver\s+([^\s]+)/);
            if (match) {
                const ip = match[1];
                // Skip localhost/loopback as they don't support DNSSEC validation
                if (ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('127.')) {
                    nameservers.push(ip);
                }
            }
        }
        
        return nameservers;
    } catch (error) {
        console.warn(`[${global.sID}] Could not read /etc/resolv.conf: ${error.message}`);
        return [];
    }
}

/**
 * Enhanced DNSSEC validation using dns2 library
 */
async function performDNSSECQuery(domain, recordType = 'A') {
    try {
        const cacheKey = `dnssec_${domain}_${recordType}`;
        const cached = dnsCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < 60000)) {
            return cached.data;
        }

        // Try system DNS servers first, then fallback to public ones
        const systemDNS = getSystemDNSServers();
        const publicDNS = [
            '8.8.8.8',      // Google DNS (supports DNSSEC)
            '1.1.1.1',      // Cloudflare DNS (supports DNSSEC)
            '9.9.9.9'       // Quad9 DNS (supports DNSSEC)
        ];
        
        const nameServers = systemDNS.length > 0 ? [...systemDNS, ...publicDNS] : publicDNS;
        
        // Log DNS servers being used (only in development or first time)
        if (process.env.NODE_ENV === 'development' || !global.dnsServersLogged) {
            console.log(`[${global.sID}] DNS servers for DNSSEC: ${nameServers.join(', ')}`);
            if (systemDNS.length > 0) {
                console.log(`[${global.sID}] Using system DNS: ${systemDNS.join(', ')}`);
            }
            global.dnsServersLogged = true;
        }

        const resolver = new DNS2({
            nameServers,
            timeout: DNS_TIMEOUT,
            retries: 2
        });

        // Query for the main record type
        const response = await resolver.query(domain, recordType);
        
        // Initialize DNSSEC info
        let dnssecRecords = {};
        let dnssecEnabled = false;
        let dnssecStatus = 'insecure';
        let trustChain = [];

        // Check for RRSIG records (signature records)
        try {
            const rrsigResponse = await resolver.query(domain, 'RRSIG');
            if (rrsigResponse.answers && rrsigResponse.answers.length > 0) {
                dnssecRecords.rrsig = rrsigResponse.answers.map(record => ({
                    typeCovered: record.typeCovered || 'Unknown',
                    algorithm: record.algorithm || 0,
                    labels: record.labels || 0,
                    originalTTL: record.originalTTL || 0,
                    signatureExpiration: record.signatureExpiration ? 
                        new Date(record.signatureExpiration * 1000).toISOString() : 'Unknown',
                    signatureInception: record.signatureInception ? 
                        new Date(record.signatureInception * 1000).toISOString() : 'Unknown',
                    keyTag: record.keyTag || 0,
                    signerName: record.signerName || 'Unknown',
                    signature: record.signature ? `${record.signature.toString('base64').substring(0, 32)}...` : 'N/A'
                }));
                dnssecEnabled = true;
                dnssecStatus = 'secure';
            }
        } catch (rrsigError) {
            // RRSIG not found is normal for non-DNSSEC domains
        }

        // Check for DNSKEY records
        try {
            const dnskeyResponse = await resolver.query(domain, 'DNSKEY');
            if (dnskeyResponse.answers && dnskeyResponse.answers.length > 0) {
                dnssecRecords.dnskey = dnskeyResponse.answers.map(record => ({
                    flags: record.flags || 0,
                    protocol: record.protocol || 3,
                    algorithm: record.algorithm || 0,
                    publicKey: record.publicKey ? 
                        `${record.publicKey.toString('base64').substring(0, 64)}...` : 'N/A',
                    isZSK: (record.flags & 0x0100) === 0x0100, // Zone Signing Key
                    isKSK: (record.flags & 0x0101) === 0x0101  // Key Signing Key
                }));
                dnssecEnabled = true;
                if (dnssecStatus !== 'secure') dnssecStatus = 'secure';
            }
        } catch (dnskeyError) {
            // DNSKEY not found is normal for non-DNSSEC domains
        }

        // Check for DS records (delegation signer)
        try {
            const dsResponse = await resolver.query(domain, 'DS');
            if (dsResponse.answers && dsResponse.answers.length > 0) {
                dnssecRecords.ds = dsResponse.answers.map(record => ({
                    keyTag: record.keyTag || 0,
                    algorithm: record.algorithm || 0,
                    digestType: record.digestType || 0,
                    digest: record.digest ? 
                        `${record.digest.toString('hex').substring(0, 32)}...` : 'N/A'
                }));
                dnssecEnabled = true;
                trustChain.push(`DS record found for ${domain}`);
            }
        } catch (dsError) {
            // DS not found is normal for some domains
        }

        // Check for NSEC/NSEC3 records (proof of non-existence)
        try {
            const nsecResponse = await resolver.query(domain, 'NSEC');
            if (nsecResponse.answers && nsecResponse.answers.length > 0) {
                dnssecRecords.nsec = nsecResponse.answers.map(record => ({
                    nextDomainName: record.nextDomainName || 'Unknown',
                    types: record.types || []
                }));
            }
        } catch (nsecError) {
            // NSEC not found is normal
        }

        // Parse main records
        const records = response.answers ? response.answers.map(record => {
            switch (recordType.toUpperCase()) {
                case 'A':
                    return record.address;
                case 'AAAA':
                    return record.address;
                case 'MX':
                    return `${record.priority} ${record.exchange}`;
                case 'TXT':
                    return Array.isArray(record.data) ? record.data.join('') : record.data;
                case 'CNAME':
                    return record.data;
                case 'NS':
                    return record.data;
                case 'PTR':
                    return record.data;
                case 'SOA':
                    return `${record.primary} ${record.admin} ${record.serial} ${record.refresh} ${record.retry} ${record.expiration} ${record.minimum}`;
                case 'SRV':
                    return `${record.priority} ${record.weight} ${record.port} ${record.target}`;
                default:
                    return record.data || record.address || 'Unknown';
            }
        }) : [];

        // Build trust chain information
        if (dnssecEnabled) {
            if (dnssecRecords.rrsig && dnssecRecords.rrsig.length > 0) {
                trustChain.push(`RRSIG records found (${dnssecRecords.rrsig.length})`);
            }
            if (dnssecRecords.dnskey && dnssecRecords.dnskey.length > 0) {
                trustChain.push(`DNSKEY records found (${dnssecRecords.dnskey.length})`);
            }
        }

        const result = {
            domain,
            recordType,
            records,
            dnssecEnabled,
            dnssecStatus,
            dnssecRecords,
            trustChain,
            queryInfo: {
                authority: response.authorities ? response.authorities.length : 0,
                additional: response.additionals ? response.additionals.length : 0,
                flags: {
                    authoritative: response.header ? response.header.aa : false,
                    truncated: response.header ? response.header.tc : false,
                    recursionDesired: response.header ? response.header.rd : false,
                    recursionAvailable: response.header ? response.header.ra : false,
                    authenticatedData: response.header ? response.header.ad : false,
                    checkingDisabled: response.header ? response.header.cd : false
                }
            }
        };

        dnsCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;

    } catch (error) {
        return {
            domain,
            recordType,
            records: [],
            dnssecEnabled: false,
            dnssecStatus: 'bogus',
            dnssecRecords: {},
            trustChain: [],
            error: error.message,
            queryInfo: null
        };
    }
}
export const dnsModule = {
    route: '/dns/:method/:id',
    method: 'get',
    middleware: [optionalAuthMiddleware],
    handler: async (request, reply) => {
        const startTime = Date.now();
        
        try {
            const hostname = request.params.id.toString();
            const method = request.params.method.toString().toUpperCase();
            const enableDNSSEC = request.query.dnssec === 'true' || request.query.dnssec === '1';
            
            // Determine IP version if hostname is already an IP
            let ipVersion = 0;
            if (net.isIP(hostname)) {
                ipVersion = net.isIPv6(hostname) ? 6 : 4;
            }
            
            // PTR queries require an IP address
            if (method === "PTR" && !net.isIP(hostname)) {
                return {
                    "timestamp": Date.now(),
                    "method": method,
                    "host": hostname,
                    "result": null,
                    "err": { code: 'BADFAMILY', message: 'PTR queries require an IP address' },
                    "ipVersion": 0,
                    "responseTimeMs": Date.now() - startTime,
                    "dnssec": null
                };
            }

            // Cache key
            const cacheKey = `${method}:${hostname}:${enableDNSSEC}`;
            const cached = dnsCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 60000) {
                return {
                    ...cached.result,
                    "responseTimeMs": Date.now() - startTime,
                    "cached": true
                };
            }

            let result;
            let dnssecInfo = null;

            // If DNSSEC is enabled and it's not an IP, perform DNSSEC query
            if (enableDNSSEC && !net.isIP(hostname)) {
                const dnssecResult = await performDNSSECQuery(hostname, method);
                
                if (dnssecResult.error) {
                    dnssecInfo = {
                        enabled: true,
                        status: 'bogus',
                        error: dnssecResult.error,
                        records: {}
                    };
                } else {
                    dnssecInfo = {
                        enabled: true,
                        status: dnssecResult.dnssecStatus,
                        hasDNSSEC: dnssecResult.dnssecEnabled,
                        records: dnssecResult.dnssecRecords,
                        trustChain: dnssecResult.trustChain,
                        queryInfo: dnssecResult.queryInfo
                    };
                    
                    // Use DNSSEC query results if available
                    if (dnssecResult.records && dnssecResult.records.length > 0) {
                        result = dnssecResult.records;
                    }
                }
            }

            // If we don't have results yet, use standard DNS queries
            if (!result) {
                const dnsPromises = dns.promises || dns;
                
                switch (method) {
                    case 'A':
                        result = await dnsPromises.resolve4(hostname);
                        if (result && result.length > 0) {
                            ipVersion = 4;
                        }
                        break;
                    case 'AAAA':
                        result = await dnsPromises.resolve6(hostname);
                        if (result && result.length > 0) {
                            ipVersion = 6;
                        }
                        break;
                    case 'MX':
                        result = await dnsPromises.resolveMx(hostname);
                        result = result.map(mx => `${mx.priority} ${mx.exchange}`);
                        break;
                    case 'TXT':
                        result = await dnsPromises.resolveTxt(hostname);
                        result = result.map(txt => Array.isArray(txt) ? txt.join('') : txt);
                        break;
                    case 'NS':
                        result = await dnsPromises.resolveNs(hostname);
                        break;
                    case 'CNAME':
                        result = await dnsPromises.resolveCname(hostname);
                        break;
                    case 'PTR':
                        result = await dnsPromises.reverse(hostname);
                        break;
                    case 'SOA':
                        const soa = await dnsPromises.resolveSoa(hostname);
                        result = [`${soa.nsname} ${soa.hostmaster} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minttl}`];
                        break;
                    case 'SRV':
                        result = await dnsPromises.resolveSrv(hostname);
                        result = result.map(srv => `${srv.priority} ${srv.weight} ${srv.port} ${srv.name}`);
                        break;
                    default:
                        // For DNSSEC-specific records, try with dns2 if DNSSEC is enabled
                        if (enableDNSSEC && ['DS', 'DNSKEY', 'RRSIG', 'NSEC', 'NSEC3'].includes(method)) {
                            const dnssecResult = await performDNSSECQuery(hostname, method);
                            result = dnssecResult.records;
                            if (!dnssecInfo) {
                                dnssecInfo = {
                                    enabled: true,
                                    status: dnssecResult.dnssecStatus,
                                    hasDNSSEC: dnssecResult.dnssecEnabled,
                                    records: dnssecResult.dnssecRecords,
                                    trustChain: dnssecResult.trustChain,
                                    queryInfo: dnssecResult.queryInfo
                                };
                            }
                        } else {
                            throw new Error(`Unsupported DNS record type: ${method}`);
                        }
                }
            }

            const response = {
                "timestamp": Date.now(),
                "method": method,
                "host": hostname,
                "result": result,
                "err": null,
                "ipVersion": ipVersion,
                "responseTimeMs": Date.now() - startTime,
                "dnssec": dnssecInfo,
                "cached": false
            };

            // Cache the response
            dnsCache.set(cacheKey, {
                result: response,
                timestamp: Date.now()
            });

            return response;

        } catch (err) {
            const errorResponse = {
                "timestamp": Date.now(),
                "method": request.params.method.toString().toUpperCase(),
                "host": request.params.id.toString(),
                "result": null,
                "err": {
                    code: err.code || 'UNKNOWN',
                    message: err.message
                },
                "ipVersion": 0,
                "responseTimeMs": Date.now() - startTime,
                "dnssec": null,
                "cached": false
            };

            return errorResponse;
        }
    }
};
