import { promises as dns } from 'dns';
import net from 'net';

console.log('=== Teste de resolução DNS para api6.ipify.org ===');
const hostname = 'api6.ipify.org';

async function testDNSResolution() {
    console.log('Hostname:', hostname);
    console.log('global.ipv6Support:', global.ipv6Support || false);
    
    let resolvedIPs = null;
    let ipVersion = 0;
    let targetIP = hostname;
    
    if (!net.isIP(hostname)) {
        try {
            // Tentar resolver IPv4 primeiro
            console.log('Tentando IPv4...');
            try {
                const ipv4s = await dns.resolve4(hostname);
                console.log('IPv4 sucesso:', ipv4s);
                resolvedIPs = ipv4s;
                targetIP = ipv4s[0];
                ipVersion = 4;
            } catch (ipv4Error) {
                console.log('IPv4 falhou:', ipv4Error.message);
                console.log('Código do erro IPv4:', ipv4Error.code);
                
                // Se IPv4 falhar e suporte IPv6 habilitado, tentar IPv6
                if (global.ipv6Support || true) { // Forçar true para teste
                    console.log('Tentando IPv6...');
                    try {
                        const ipv6s = await dns.resolve6(hostname);
                        console.log('IPv6 sucesso:', ipv6s);
                        resolvedIPs = ipv6s;
                        targetIP = ipv6s[0];
                        ipVersion = 6;
                    } catch (ipv6Error) {
                        console.log('IPv6 também falhou:', ipv6Error.message);
                        console.log('Código do erro IPv6:', ipv6Error.code);
                        throw ipv6Error;
                    }
                } else {
                    console.log('IPv6 não habilitado, mantendo erro IPv4');
                    throw ipv4Error;
                }
            }
        } catch (err) {
            console.log('Erro final:', err.message);
            console.log('Código do erro final:', err.code);
            return {
                error: 'host not found',
                details: err.message,
                code: err.code
            };
        }
    }
    
    console.log('Resultado final:');
    console.log('- targetIP:', targetIP);
    console.log('- resolvedIPs:', resolvedIPs);
    console.log('- ipVersion:', ipVersion);
    
    return {
        targetIP,
        resolvedIPs,
        ipVersion
    };
}

testDNSResolution().catch(console.error);
