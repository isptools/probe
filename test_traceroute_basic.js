import { promises as dns } from 'dns';
import net from 'net';

console.log('=== Teste de carregamento do módulo traceroute ===');

// Verificar se net-ping está funcionando
try {
    const netPing = await import('net-ping');
    console.log('net-ping carregado com sucesso');
    console.log('NetworkProtocol disponível:', !!netPing.default.NetworkProtocol);
    console.log('IPv6 suportado:', !!netPing.default.NetworkProtocol?.IPv6);
    
    // Testar criação de sessão básica
    try {
        const session = netPing.default.createSession({ timeout: 1000, retries: 0 });
        console.log('Sessão básica criada com sucesso');
        session.close();
    } catch (sessionError) {
        console.log('Erro ao criar sessão:', sessionError.message);
    }
    
} catch (netPingError) {
    console.log('Erro ao carregar net-ping:', netPingError.message);
}

// Testar resolução DNS básica
try {
    console.log('Testando resolução DNS...');
    const ipv6s = await dns.resolve6('api6.ipify.org');
    console.log('DNS IPv6 funcionando:', ipv6s);
} catch (dnsError) {
    console.log('Erro DNS:', dnsError.message);
}

console.log('Teste concluído.');
