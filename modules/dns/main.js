import dns from 'dns';
import net from 'net';
import fs from 'fs';
import { createRequire } from 'module';
import { optionalAuthMiddleware } from '../../auth.js';

// Import da biblioteca DNSSEC
const require = createRequire(import.meta.url);
const nativeDNS = require('native-dnssec-dns');

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
 * Enhanced DNSSEC validation using native-dnssec-dns library
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

        // Function to query with native-dnssec-dns
        function queryWithNativeDNS(domain, recordType, server) {
            return new Promise((resolve, reject) => {
                const question = nativeDNS.Question({
                    name: domain,
                    type: recordType
                });

                const req = nativeDNS.Request({
                    question: question,
                    server: { address: server, port: 53, type: 'udp' },
                    timeout: DNS_TIMEOUT,
                    try_edns: true  // Important for DNSSEC
                });

                let response = null;

                req.on('timeout', () => {
                    reject(new Error(`Timeout querying ${recordType} ${domain} from ${server}`));
                });

                req.on('message', (err, answer) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    response = answer;
                });

                req.on('end', () => {
                    if (response) {
                        resolve(response);
                    } else {
                        reject(new Error(`No response for ${recordType} ${domain} from ${server}`));
                    }
                });

                req.send();
            });
        }

        // Try to query the main record type
        let mainResponse = null;
        let lastError = null;
        
        for (const server of nameServers) {
            try {
                mainResponse = await queryWithNativeDNS(domain, recordType, server);
                break;
            } catch (error) {
                lastError = error;
                continue;
            }
        }

        if (!mainResponse) {
            throw new Error(`Failed to query ${recordType} ${domain}: ${lastError?.message || 'Unknown error'}`);
        }

        // Initialize DNSSEC info
        let dnssecRecords = {};
        let dnssecEnabled = false;
        let dnssecStatus = 'insecure';
        let trustChain = [];

        // Only query DNSSEC records if we're looking for A/AAAA or specific DNSSEC types
        if (['A', 'AAAA', 'DNSKEY', 'DS', 'RRSIG'].includes(recordType.toUpperCase())) {
            
            // Check for DNSKEY records
            try {
                let dnskeyResponse = null;
                for (const server of nameServers) {
                    try {
                        dnskeyResponse = await queryWithNativeDNS(domain, 'DNSKEY', server);
                        break;
                    } catch (error) {
                        continue;
                    }
                }
                
                if (dnskeyResponse && dnskeyResponse.answer && dnskeyResponse.answer.length > 0) {
                    dnssecRecords.dnskey = dnskeyResponse.answer.map(record => {
                        let publicKeyBase64 = 'N/A';
                        
                        if (record.publicKey) {
                            if (Buffer.isBuffer(record.publicKey)) {
                                publicKeyBase64 = record.publicKey.toString('base64');
                            } else if (record.publicKey.buffer && Buffer.isBuffer(record.publicKey.buffer)) {
                                publicKeyBase64 = record.publicKey.buffer.toString('base64');
                            } else if (typeof record.publicKey === 'string' && record.publicKey.length > 50) {
                                publicKeyBase64 = record.publicKey;
                            } else if (typeof record.publicKey === 'object' && record.publicKey.data) {
                                publicKeyBase64 = Buffer.isBuffer(record.publicKey.data) ? 
                                    record.publicKey.data.toString('base64') : 'N/A';
                            } else {
                                try {
                                    publicKeyBase64 = Buffer.from(record.publicKey).toString('base64');
                                } catch (e) {
                                    publicKeyBase64 = 'N/A';
                                }
                            }
                        }
                        
                        return {
                            flags: record.flags || 0,
                            protocol: record.protocol || 3,
                            algorithm: record.algorithm || 0,
                            publicKey: publicKeyBase64,
                            isZSK: (record.flags & 0x0100) === 0x0100, // Zone Signing Key
                            isKSK: (record.flags & 0x0101) === 0x0101  // Key Signing Key
                        };
                    });
                    dnssecEnabled = true;
                    dnssecStatus = 'secure';
                    trustChain.push(`DNSKEY records found (${dnskeyResponse.answer.length})`);
                }
            } catch (error) {
                // DNSKEY not found is normal for non-DNSSEC domains
            }

            // Check for DS records (delegation signer)
            try {
                let dsResponse = null;
                for (const server of nameServers) {
                    try {
                        dsResponse = await queryWithNativeDNS(domain, 'DS', server);
                        break;
                    } catch (error) {
                        continue;
                    }
                }
                
                if (dsResponse && dsResponse.answer && dsResponse.answer.length > 0) {
                    dnssecRecords.ds = dsResponse.answer.map(record => {
                        let digestHex = 'N/A';
                        if (record.digest) {
                            if (Buffer.isBuffer(record.digest)) {
                                digestHex = record.digest.toString('hex');
                            } else if (record.digest.buffer && Buffer.isBuffer(record.digest.buffer)) {
                                digestHex = record.digest.buffer.toString('hex');
                            } else if (typeof record.digest === 'string') {
                                digestHex = record.digest;
                            } else {
                                try {
                                    digestHex = Buffer.from(record.digest).toString('hex');
                                } catch (e) {
                                    digestHex = 'N/A';
                                }
                            }
                        }
                        
                        return {
                            keyTag: record.keytag || 0,
                            algorithm: record.algorithm || 0,
                            digestType: record.digestType || 0,
                            digest: digestHex
                        };
                    });
                    dnssecEnabled = true;
                    if (dnssecStatus !== 'secure') dnssecStatus = 'secure';
                    trustChain.push(`DS record found for ${domain}`);
                }
            } catch (error) {
                // DS not found is normal for some domains
            }

            // Check for RRSIG records (signature records)
            try {
                let rrsigResponse = null;
                for (const server of nameServers) {
                    try {
                        rrsigResponse = await queryWithNativeDNS(domain, 'RRSIG', server);
                        break;
                    } catch (error) {
                        continue;
                    }
                }
                
                if (rrsigResponse && rrsigResponse.answer && rrsigResponse.answer.length > 0) {
                    dnssecRecords.rrsig = rrsigResponse.answer.map(record => {
                        let signatureBase64 = 'N/A';
                        if (record.signature) {
                            if (Buffer.isBuffer(record.signature)) {
                                signatureBase64 = record.signature.toString('base64');
                            } else if (record.signature.buffer && Buffer.isBuffer(record.signature.buffer)) {
                                signatureBase64 = record.signature.buffer.toString('base64');
                            } else if (record.signature.data && Buffer.isBuffer(record.signature.data)) {
                                signatureBase64 = record.signature.data.toString('base64');
                            } else if (typeof record.signature === 'string') {
                                signatureBase64 = record.signature;
                            } else {
                                try {
                                    signatureBase64 = Buffer.from(record.signature).toString('base64');
                                } catch (e) {
                                    signatureBase64 = 'N/A';
                                }
                            }
                        }
                        
                        return {
                            typeCovered: record.typeCovered || 'Unknown',
                            algorithm: record.algorithm || 0,
                            labels: record.labels || 0,
                            originalTTL: record.originalTtl || 0,
                            signatureExpiration: record.signatureExpiration ? 
                                (record.signatureExpiration > 2147483647 ? 
                                    new Date(record.signatureExpiration).toISOString() : 
                                    new Date(record.signatureExpiration * 1000).toISOString()) : 'Unknown',
                            signatureInception: record.signatureInception ? 
                                (record.signatureInception > 2147483647 ? 
                                    new Date(record.signatureInception).toISOString() : 
                                    new Date(record.signatureInception * 1000).toISOString()) : 'Unknown',
                            keyTag: record.keytag || 0,
                            signerName: record.signerName || 'Unknown',
                            signature: signatureBase64
                        };
                    });
                    dnssecEnabled = true;
                    dnssecStatus = 'secure';
                    trustChain.push(`RRSIG records found (${rrsigResponse.answer.length})`);
                }
            } catch (error) {
                // RRSIG not found might be normal depending on query
            }
        }

        // Parse main records based on type
        const records = mainResponse.answer ? mainResponse.answer.map(record => {
            switch (recordType.toUpperCase()) {
                case 'A':
                    return record.address;
                case 'AAAA':
                    return record.address;
                case 'MX':
                    return {
                        priority: record.priority,
                        exchange: record.exchange
                    };
                case 'TXT':
                    return Array.isArray(record.data) ? record.data.join('') : record.data;
                case 'CNAME':
                    return record.data;
                case 'NS':
                    return record.data;
                case 'PTR':
                    return record.data;
                case 'SOA':
                    return {
                        primary: record.primary || record.nsname,
                        admin: record.admin || record.hostmaster,
                        serial: record.serial,
                        refresh: record.refresh,
                        retry: record.retry,
                        expiration: record.expiration || record.expire,
                        minimum: record.minimum || record.minttl
                    };
                case 'SRV':
                    return {
                        priority: record.priority,
                        weight: record.weight,
                        port: record.port,
                        target: record.target || record.name
                    };
                case 'DNSKEY':
                    const pubKey = record.publicKey;
                    let keyStr = 'N/A';
                    
                    if (pubKey) {
                        if (Buffer.isBuffer(pubKey)) {
                            keyStr = pubKey.toString('base64');
                        } else if (pubKey.buffer && Buffer.isBuffer(pubKey.buffer)) {
                            keyStr = pubKey.buffer.toString('base64');
                        } else if (typeof pubKey === 'string' && pubKey.length > 50) {
                            // Already base64 encoded
                            keyStr = pubKey;
                        } else if (typeof pubKey === 'object' && pubKey.data) {
                            // Handle object with data property
                            keyStr = Buffer.isBuffer(pubKey.data) ? pubKey.data.toString('base64') : 'N/A';
                        } else {
                            // Try to convert anything else to base64
                            try {
                                keyStr = Buffer.from(pubKey).toString('base64');
                            } catch (e) {
                                keyStr = 'N/A';
                            }
                        }
                    }
                    
                    return `${record.flags} ${record.protocol} ${record.algorithm} ${keyStr}`;
                case 'DS':
                    const digest = record.digest;
                    let digestStr = 'N/A';
                    
                    if (digest) {
                        if (Buffer.isBuffer(digest)) {
                            digestStr = digest.toString('hex');
                        } else if (digest.buffer && Buffer.isBuffer(digest.buffer)) {
                            digestStr = digest.buffer.toString('hex');
                        } else if (digest.data && Buffer.isBuffer(digest.data)) {
                            digestStr = digest.data.toString('hex');
                        } else if (typeof digest === 'string') {
                            digestStr = digest;
                        } else {
                            try {
                                digestStr = Buffer.from(digest).toString('hex');
                            } catch (e) {
                                digestStr = digest.toString ? digest.toString() : 'N/A';
                            }
                        }
                    }
                    
                    return `${record.keytag} ${record.algorithm} ${record.digestType} ${digestStr}`;
                case 'RRSIG':
                    return `${record.typeCovered} ${record.algorithm} ${record.labels} ${record.originalTtl} ${record.signatureExpiration} ${record.signatureInception} ${record.keytag} ${record.signerName}`;
                case 'NSEC':
                    return `${record.nextDomainName || record.nextDomain || 'N/A'} ${(record.types || []).join(' ')}`;
                case 'NSEC3':
                    return `${record.hashAlgorithm || 0} ${record.flags || 0} ${record.iterations || 0} ${record.salt || '-'} ${record.nextHashedOwnerName || record.nextDomain || 'N/A'} ${(record.types || []).join(' ')}`;
                case 'CAA':
                    return `${record.flags || 0} ${record.tag || 'unknown'} "${record.value || record.data || 'N/A'}"`;
                case 'TLSA':
                    const certData = record.certificateAssociationData;
                    const certStr = Buffer.isBuffer(certData) ? certData.toString('hex').substring(0, 32) + '...' : (certData || 'N/A');
                    return `${record.certificateUsage || 0} ${record.selector || 0} ${record.matchingType || 0} ${certStr}`;
                default:
                    return record.data || record.address || 'Unknown';
            }
        }) : [];

        const result = {
            domain,
            recordType,
            records,
            dnssecEnabled,
            dnssecStatus,
            dnssecRecords,
            trustChain,
            queryInfo: {
                authority: mainResponse.authority ? mainResponse.authority.length : 0,
                additional: mainResponse.additional ? mainResponse.additional.length : 0,
                flags: {
                    authoritative: mainResponse.header ? mainResponse.header.aa : false,
                    truncated: mainResponse.header ? mainResponse.header.tc : false,
                    recursionDesired: mainResponse.header ? mainResponse.header.rd : false,
                    recursionAvailable: mainResponse.header ? mainResponse.header.ra : false,
                    authenticatedData: mainResponse.header ? mainResponse.header.ad : false,
                    checkingDisabled: mainResponse.header ? mainResponse.header.cd : false
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
                        result = result.map(mx => ({
                            priority: mx.priority,
                            exchange: mx.exchange
                        }));
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
                        result = [{
                            primary: soa.nsname,
                            admin: soa.hostmaster,
                            serial: soa.serial,
                            refresh: soa.refresh,
                            retry: soa.retry,
                            expiration: soa.expire,
                            minimum: soa.minttl
                        }];
                        break;
                    case 'SRV':
                        result = await dnsPromises.resolveSrv(hostname);
                        result = result.map(srv => ({
                            priority: srv.priority,
                            weight: srv.weight,
                            port: srv.port,
                            target: srv.name
                        }));
                        break;
                    case 'CAA':
                        try {
                            result = await dnsPromises.resolveCaa(hostname);
                            result = result.map(caa => ({
                                flags: caa.critical ? 128 : 0,
                                tag: caa.issue || caa.issuewild || caa.iodef || 'unknown',
                                value: caa.value || 'N/A'
                            }));
                        } catch (error) {
                            // If native CAA fails, try manual lookup
                            if (enableDNSSEC) {
                                const caaResult = await performDNSSECQuery(hostname, 'CAA');
                                result = caaResult.records;
                            } else {
                                throw error;
                            }
                        }
                        break;
                    default:
                        // For DNSSEC-specific records, try with native-dnssec-dns if DNSSEC is enabled
                        if (enableDNSSEC && ['DS', 'DNSKEY', 'RRSIG', 'NSEC', 'NSEC3', 'CAA', 'TLSA'].includes(method)) {
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

// DNSSEC Validation Endpoint - Comprehensive analysis
export const dnssecValidate = {
    route: '/dns/validate/:domain',
    method: 'get',
    middleware: [optionalAuthMiddleware],
    handler: async (request, reply) => {
        const startTime = Date.now();
        
        try {
            const domain = request.params.domain.toString().toLowerCase();
            
            // Cache key for complete validation
            const cacheKey = `validate_${domain}`;
            const cached = dnsCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 60000) {
                return {
                    ...cached.data,
                    "responseTimeMs": Date.now() - startTime,
                    "cached": true
                };
            }

            // Perform comprehensive DNSSEC analysis
            const results = {};
            const warnings = [];
            const errors = [];
            let overallStatus = 'secure';

            // 1. Check for DNSKEY records
            try {
                const dnskeyResult = await performDNSSECQuery(domain, 'DNSKEY');
                results.dnskey = dnskeyResult;
                
                if (dnskeyResult.records && dnskeyResult.records.length > 0) {
                    results.hasKeys = true;
                    results.keyCount = dnskeyResult.records.length;
                    
                    // Analyze key types
                    const kskCount = dnskeyResult.dnssecRecords.dnskey ? 
                        dnskeyResult.dnssecRecords.dnskey.filter(k => k.isKSK).length : 0;
                    const zskCount = dnskeyResult.dnssecRecords.dnskey ? 
                        dnskeyResult.dnssecRecords.dnskey.filter(k => k.isZSK).length : 0;
                    
                    results.keyAnalysis = {
                        kskCount,
                        zskCount,
                        totalKeys: kskCount + zskCount
                    };
                    
                    if (kskCount === 0) warnings.push('No Key Signing Key (KSK) found');
                    if (zskCount === 0) warnings.push('No Zone Signing Key (ZSK) found');
                } else {
                    results.hasKeys = false;
                    overallStatus = 'insecure';
                    errors.push('No DNSKEY records found - domain is not signed');
                }
            } catch (error) {
                results.dnskey = { error: error.message };
                overallStatus = 'bogus';
                errors.push(`DNSKEY query failed: ${error.message}`);
            }

            // 2. Check for DS records
            try {
                const dsResult = await performDNSSECQuery(domain, 'DS');
                results.ds = dsResult;
                
                if (dsResult.records && dsResult.records.length > 0) {
                    results.hasDS = true;
                    results.dsCount = dsResult.records.length;
                } else {
                    results.hasDS = false;
                    if (results.hasKeys) {
                        warnings.push('Domain has DNSKEY but no DS record in parent zone');
                    }
                }
            } catch (error) {
                results.ds = { error: error.message };
                warnings.push(`DS query failed: ${error.message}`);
            }

            // 3. Check RRSIG records
            try {
                const rrsigResult = await performDNSSECQuery(domain, 'RRSIG');
                results.rrsig = rrsigResult;
                
                if (rrsigResult.records && rrsigResult.records.length > 0) {
                    results.hasSigs = true;
                    results.sigCount = rrsigResult.records.length;
                    
                    // Check signature expiration
                    const now = new Date();
                    const expiredSigs = [];
                    const expiringEoon = [];
                    
                    if (rrsigResult.dnssecRecords.rrsig) {
                        rrsigResult.dnssecRecords.rrsig.forEach((sig, index) => {
                            if (sig.signatureExpiration && sig.signatureExpiration !== 'Unknown') {
                                const expDate = new Date(sig.signatureExpiration);
                                const timeDiff = expDate.getTime() - now.getTime();
                                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                                
                                if (daysDiff < 0) {
                                    expiredSigs.push(index);
                                } else if (daysDiff < 7) {
                                    expiringEoon.push({ index, daysLeft: daysDiff });
                                }
                            }
                        });
                    }
                    
                    if (expiredSigs.length > 0) {
                        overallStatus = 'bogus';
                        errors.push(`${expiredSigs.length} signature(s) have expired`);
                    }
                    
                    if (expiringEoon.length > 0) {
                        warnings.push(`${expiringEoon.length} signature(s) expiring within 7 days`);
                    }
                    
                    results.signatureStatus = {
                        total: rrsigResult.records.length,
                        expired: expiredSigs.length,
                        expiringSoon: expiringEoon.length
                    };
                } else {
                    results.hasSigs = false;
                    if (results.hasKeys) {
                        overallStatus = 'bogus';
                        errors.push('DNSKEY found but no RRSIG records - signatures missing');
                    }
                }
            } catch (error) {
                results.rrsig = { error: error.message };
                if (results.hasKeys) {
                    warnings.push(`RRSIG query failed: ${error.message}`);
                }
            }

            // 4. Test A record with DNSSEC
            try {
                const aResult = await performDNSSECQuery(domain, 'A');
                results.aRecord = {
                    hasRecords: aResult.records && aResult.records.length > 0,
                    dnssecStatus: aResult.dnssecStatus,
                    ipCount: aResult.records ? aResult.records.length : 0
                };
            } catch (error) {
                results.aRecord = { error: error.message };
            }

            // Final status determination
            if (errors.length > 0) {
                overallStatus = 'bogus';
            } else if (!results.hasKeys) {
                overallStatus = 'insecure';
            } else if (warnings.length > 2) {
                overallStatus = 'warning';
            }

            const response = {
                timestamp: Date.now(),
                domain,
                overallStatus,
                summary: {
                    hasDNSSEC: results.hasKeys || false,
                    hasDS: results.hasDS || false,
                    hasValidSignatures: results.hasSigs || false,
                    keyCount: results.keyCount || 0,
                    signatureCount: results.sigCount || 0
                },
                analysis: results,
                warnings,
                errors,
                responseTimeMs: Date.now() - startTime
            };

            // Cache the response
            dnsCache.set(cacheKey, {
                data: response,
                timestamp: Date.now()
            });

            return response;

        } catch (err) {
            return {
                timestamp: Date.now(),
                domain: request.params.domain.toString(),
                overallStatus: 'error',
                error: err.message,
                responseTimeMs: Date.now() - startTime
            };
        }
    }
};

// DNSSEC Chain of Trust Endpoint
export const dnssecChain = {
    route: '/dns/chain/:domain',
    method: 'get',
    middleware: [optionalAuthMiddleware],
    handler: async (request, reply) => {
        const startTime = Date.now();
        
        try {
            const domain = request.params.domain.toString().toLowerCase();
            
            const cacheKey = `chain_${domain}`;
            const cached = dnsCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 300000) { // 5min cache
                return {
                    ...cached.data,
                    "responseTimeMs": Date.now() - startTime,
                    "cached": true
                };
            }

            const chain = [];
            const errors = [];
            let currentDomain = domain;

            // Build chain from domain to TLD
            while (currentDomain && currentDomain.includes('.')) {
                try {
                    const dsResult = await performDNSSECQuery(currentDomain, 'DS');
                    const dnskeyResult = await performDNSSECQuery(currentDomain, 'DNSKEY');
                    
                    chain.push({
                        domain: currentDomain,
                        hasDS: dsResult.records && dsResult.records.length > 0,
                        hasDNSKEY: dnskeyResult.records && dnskeyResult.records.length > 0,
                        dsCount: dsResult.records ? dsResult.records.length : 0,
                        keyCount: dnskeyResult.records ? dnskeyResult.records.length : 0,
                        status: (dsResult.records && dsResult.records.length > 0 && 
                               dnskeyResult.records && dnskeyResult.records.length > 0) ? 'secure' : 'insecure'
                    });
                } catch (error) {
                    chain.push({
                        domain: currentDomain,
                        error: error.message,
                        status: 'error'
                    });
                    errors.push(`${currentDomain}: ${error.message}`);
                }
                
                // Move to parent domain
                const parts = currentDomain.split('.');
                if (parts.length <= 2) break; // Stop at TLD
                currentDomain = parts.slice(1).join('.');
            }

            const response = {
                timestamp: Date.now(),
                domain,
                chain,
                chainLength: chain.length,
                isFullySecure: chain.every(link => link.status === 'secure'),
                hasErrors: errors.length > 0,
                errors,
                responseTimeMs: Date.now() - startTime
            };

            dnsCache.set(cacheKey, {
                data: response,
                timestamp: Date.now()
            });

            return response;

        } catch (err) {
            return {
                timestamp: Date.now(),
                domain: request.params.domain.toString(),
                error: err.message,
                responseTimeMs: Date.now() - startTime
            };
        }
    }
};

// DNSSEC Algorithms Analysis
export const dnssecAlgorithms = {
    route: '/dns/algorithms/:domain',
    method: 'get',
    middleware: [optionalAuthMiddleware],
    handler: async (request, reply) => {
        const startTime = Date.now();
        
        try {
            const domain = request.params.domain.toString().toLowerCase();
            
            // Algorithm mappings
            const algorithms = {
                1: { name: 'RSAMD5', status: 'deprecated', security: 'weak' },
                3: { name: 'DSA', status: 'deprecated', security: 'weak' },
                5: { name: 'RSASHA1', status: 'legacy', security: 'moderate' },
                6: { name: 'DSA-NSEC3-SHA1', status: 'deprecated', security: 'weak' },
                7: { name: 'RSASHA1-NSEC3-SHA1', status: 'legacy', security: 'moderate' },
                8: { name: 'RSASHA256', status: 'recommended', security: 'strong' },
                10: { name: 'RSASHA512', status: 'recommended', security: 'strong' },
                13: { name: 'ECDSA-P256-SHA256', status: 'recommended', security: 'strong' },
                14: { name: 'ECDSA-P384-SHA384', status: 'recommended', security: 'strong' },
                15: { name: 'ED25519', status: 'modern', security: 'excellent' },
                16: { name: 'ED448', status: 'modern', security: 'excellent' }
            };

            // Get DNSKEY records
            const dnskeyResult = await performDNSSECQuery(domain, 'DNSKEY');
            const dsResult = await performDNSSECQuery(domain, 'DS');
            
            const analysis = {
                dnskeyAlgorithms: [],
                dsAlgorithms: [],
                recommendations: [],
                warnings: [],
                securityLevel: 'unknown'
            };

            // Analyze DNSKEY algorithms
            if (dnskeyResult.dnssecRecords && dnskeyResult.dnssecRecords.dnskey) {
                dnskeyResult.dnssecRecords.dnskey.forEach(key => {
                    const alg = algorithms[key.algorithm] || { 
                        name: `Unknown-${key.algorithm}`, 
                        status: 'unknown', 
                        security: 'unknown' 
                    };
                    
                    analysis.dnskeyAlgorithms.push({
                        algorithm: key.algorithm,
                        name: alg.name,
                        status: alg.status,
                        security: alg.security,
                        keyType: key.isKSK ? 'KSK' : (key.isZSK ? 'ZSK' : 'Unknown')
                    });
                    
                    // Generate warnings and recommendations
                    if (alg.status === 'deprecated' || alg.security === 'weak') {
                        analysis.warnings.push(`${alg.name} is deprecated and should be upgraded`);
                    }
                    
                    if (alg.status === 'legacy') {
                        analysis.recommendations.push(`Consider upgrading from ${alg.name} to a modern algorithm like ECDSA or ED25519`);
                    }
                });
            }

            // Analyze DS algorithms
            if (dsResult.dnssecRecords && dsResult.dnssecRecords.ds) {
                dsResult.dnssecRecords.ds.forEach(ds => {
                    const alg = algorithms[ds.algorithm] || { 
                        name: `Unknown-${ds.algorithm}`, 
                        status: 'unknown', 
                        security: 'unknown' 
                    };
                    
                    analysis.dsAlgorithms.push({
                        algorithm: ds.algorithm,
                        name: alg.name,
                        status: alg.status,
                        security: alg.security,
                        digestType: ds.digestType
                    });
                });
            }

            // Determine overall security level
            const allAlgorithms = [...analysis.dnskeyAlgorithms, ...analysis.dsAlgorithms];
            if (allAlgorithms.some(alg => alg.security === 'excellent')) {
                analysis.securityLevel = 'excellent';
            } else if (allAlgorithms.some(alg => alg.security === 'strong')) {
                analysis.securityLevel = 'strong';
            } else if (allAlgorithms.some(alg => alg.security === 'moderate')) {
                analysis.securityLevel = 'moderate';
            } else if (allAlgorithms.some(alg => alg.security === 'weak')) {
                analysis.securityLevel = 'weak';
            }

            // General recommendations
            if (analysis.securityLevel !== 'excellent' && analysis.securityLevel !== 'strong') {
                analysis.recommendations.push('Consider upgrading to modern algorithms like ECDSA P-256 or ED25519');
            }

            return {
                timestamp: Date.now(),
                domain,
                analysis,
                responseTimeMs: Date.now() - startTime
            };

        } catch (err) {
            return {
                timestamp: Date.now(),
                domain: request.params.domain.toString(),
                error: err.message,
                responseTimeMs: Date.now() - startTime
            };
        }
    }
};

// DNSSEC Health Check Endpoint
export const dnssecHealth = {
    route: '/dns/health/:domain',
    method: 'get',
    middleware: [optionalAuthMiddleware],
    handler: async (request, reply) => {
        const startTime = Date.now();
        
        try {
            const domain = request.params.domain.toString().toLowerCase();
            
            // Comprehensive health check
            const health = {
                score: 100,
                grade: 'A+',
                issues: [],
                recommendations: [],
                tests: {}
            };

            // Test 1: DNSSEC presence
            try {
                const dnskeyResult = await performDNSSECQuery(domain, 'DNSKEY');
                if (dnskeyResult.records && dnskeyResult.records.length > 0) {
                    health.tests.dnssecEnabled = { status: 'pass', message: 'DNSSEC is enabled' };
                } else {
                    health.tests.dnssecEnabled = { status: 'fail', message: 'DNSSEC is not enabled' };
                    health.score -= 50;
                    health.issues.push('Domain does not have DNSSEC enabled');
                    health.recommendations.push('Enable DNSSEC signing for your domain');
                }
            } catch (error) {
                health.tests.dnssecEnabled = { status: 'error', message: error.message };
                health.score -= 30;
            }

            // Test 2: DS records in parent
            try {
                const dsResult = await performDNSSECQuery(domain, 'DS');
                if (dsResult.records && dsResult.records.length > 0) {
                    health.tests.dsRecords = { status: 'pass', message: 'DS records found in parent zone' };
                } else {
                    health.tests.dsRecords = { status: 'fail', message: 'No DS records in parent zone' };
                    health.score -= 30;
                    health.issues.push('DS records missing in parent zone');
                    health.recommendations.push('Publish DS records to parent zone');
                }
            } catch (error) {
                health.tests.dsRecords = { status: 'error', message: error.message };
            }

            // Test 3: Signature validity
            try {
                const rrsigResult = await performDNSSECQuery(domain, 'RRSIG');
                if (rrsigResult.records && rrsigResult.records.length > 0) {
                    health.tests.signatures = { status: 'pass', message: 'RRSIG records found' };
                    
                    // Check expiration
                    if (rrsigResult.dnssecRecords.rrsig) {
                        const now = new Date();
                        let expiringSoon = 0;
                        
                        rrsigResult.dnssecRecords.rrsig.forEach(sig => {
                            if (sig.signatureExpiration && sig.signatureExpiration !== 'Unknown') {
                                const expDate = new Date(sig.signatureExpiration);
                                const daysDiff = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
                                
                                if (daysDiff < 7) expiringSoon++;
                            }
                        });
                        
                        if (expiringSoon > 0) {
                            health.score -= 15;
                            health.issues.push(`${expiringSoon} signatures expire within 7 days`);
                            health.recommendations.push('Re-sign zone to extend signature validity');
                        }
                    }
                } else {
                    health.tests.signatures = { status: 'fail', message: 'No RRSIG records found' };
                    health.score -= 25;
                    health.issues.push('Zone signatures missing');
                }
            } catch (error) {
                health.tests.signatures = { status: 'error', message: error.message };
            }

            // Test 4: Algorithm strength
            try {
                const dnskeyResult = await performDNSSECQuery(domain, 'DNSKEY');
                if (dnskeyResult.dnssecRecords && dnskeyResult.dnssecRecords.dnskey) {
                    const weakAlgorithms = dnskeyResult.dnssecRecords.dnskey.filter(key => 
                        [1, 3, 5, 6, 7].includes(key.algorithm)
                    );
                    
                    if (weakAlgorithms.length > 0) {
                        health.tests.algorithms = { status: 'warning', message: 'Using legacy/weak algorithms' };
                        health.score -= 10;
                        health.issues.push('Weak cryptographic algorithms detected');
                        health.recommendations.push('Upgrade to modern algorithms (ECDSA, ED25519)');
                    } else {
                        health.tests.algorithms = { status: 'pass', message: 'Using strong algorithms' };
                    }
                }
            } catch (error) {
                health.tests.algorithms = { status: 'error', message: error.message };
            }

            // Calculate grade
            if (health.score >= 90) health.grade = 'A+';
            else if (health.score >= 80) health.grade = 'A';
            else if (health.score >= 70) health.grade = 'B';
            else if (health.score >= 60) health.grade = 'C';
            else if (health.score >= 50) health.grade = 'D';
            else health.grade = 'F';

            return {
                timestamp: Date.now(),
                domain,
                health,
                responseTimeMs: Date.now() - startTime
            };

        } catch (err) {
            return {
                timestamp: Date.now(),
                domain: request.params.domain.toString(),
                error: err.message,
                responseTimeMs: Date.now() - startTime
            };
        }
    }
};
