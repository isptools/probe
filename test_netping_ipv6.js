import netPing from 'net-ping';

console.log('Verificando suporte IPv6 do net-ping...');
console.log('NetworkProtocol:', netPing.NetworkProtocol);
console.log('IPv6 disponível:', !!netPing.NetworkProtocol?.IPv6);

// Testar criação de sessão IPv6
try {
    const sessionOptions = {
        timeout: 1000,
        retries: 0,
        ttl: 1
    };
    
    if (netPing.NetworkProtocol?.IPv6) {
        sessionOptions.networkProtocol = netPing.NetworkProtocol.IPv6;
        console.log('Tentando criar sessão IPv6...');
        const session = netPing.createSession(sessionOptions);
        console.log('Sessão IPv6 criada com sucesso');
        session.close();
    } else {
        console.log('IPv6 não suportado pelo net-ping');
    }
} catch (error) {
    console.log('Erro ao criar sessão IPv6:', error.message);
}
