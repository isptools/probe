import { promises as dns } from 'dns';
import net from 'net';

console.log('=== Teste completo do código de traceroute ===');
const attrIP = 'api6.ipify.org';

async function testTracerouteLogic() {
    try {
        // Simular exatamente o que o código do traceroute faz
        let targetIP = attrIP;
        let resolvedIPs = null;
        let ipVersion = 0;
        
        if (!net.isIP(attrIP)) {
            try {
                // Tentar resolver IPv4 primeiro
                console.log('Tentando IPv4...');
                try {
                    const ipv4s = await dns.resolve4(attrIP);
                    console.log('IPv4 resolvido:', ipv4s);
                    resolvedIPs = ipv4s;
                    targetIP = ipv4s[0];
                    ipVersion = 4;
                } catch (ipv4Error) {
                    console.log('IPv4 falhou:', ipv4Error.message);
                    // Tentar IPv6 sempre (nova lógica)
                    console.log('Tentando IPv6...');
                    const ipv6s = await dns.resolve6(attrIP);
                    console.log('IPv6 resolvido:', ipv6s);
                    resolvedIPs = ipv6s;
                    targetIP = ipv6s[0];
                    ipVersion = 6;
                }
            } catch (err) {
                console.log('Erro final de DNS:', err.message);
                throw new Error('host not found');
            }
        }
        
        console.log('Resultado:');
        console.log('- targetIP:', targetIP);
        console.log('- resolvedIPs:', resolvedIPs);
        console.log('- ipVersion:', ipVersion);
        console.log('- isIPv6:', net.isIPv6(targetIP));
        
        return { targetIP, resolvedIPs, ipVersion };
        
    } catch (error) {
        console.log('ERRO:', error.message);
        throw error;
    }
}

testTracerouteLogic().catch(console.error);
