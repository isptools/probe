const axios = require('axios');

// Função que faz a requisição e retorna o estado de sucesso
const registro = async () => {
    try {
        const dados = { chave1: 'valor1', chave2: 'valor2' }; // Seus dados JSON
        const resposta = await axios.post('https://ip.isp.tools', dados);
        console.info('ISP.Tools reachable.');
    } catch (erro) {
        console.error('ISP.Tools unreachable.');
        console.error('Check your firewall rules and/or DNS configuration.\nThis service needs to access the internet freely using both TCP and UDP, and receive TCP on port '+process.env.SERVER_PORT+'.');
        console.error('See the documentation on the website www.isp.tools');
        process.exit(1);
    }
};

// Funções para colorir mensagens
const colorize = (message, color) => {
    const colors = {
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        reset: '\x1b[0m',
    };
    return `${colors[color]}${message}${colors.reset}`;
};

// Funções de modificação do console
const customizeConsole = () => {
    // Salve a função original do console.log
    const originalConsoleLog = console.log;

    // Defina a nova função personalizada para o console.log
    console.log = (...args) => {
        const timestamp = new Date().toLocaleString(); // Obtém o timestamp atual
        const messageWithTimestamp = `[${timestamp}] ${args.join(' ')}`; // Acrescenta o timestamp à mensagem

        // Chama o console.log original com a mensagem atualizada
        originalConsoleLog.apply(console, [messageWithTimestamp]);
    };

    console.error = (message) => {
        originalConsoleLog(colorize(message, 'red')); // Mensagens de erro em vermelho
    };

    console.warn = (message) => {
        originalConsoleLog(colorize(message, 'yellow')); // Mensagens de aviso em amarelo
    };

    console.info = (message) => {
        originalConsoleLog(colorize(message, 'blue')); // Mensagens de informação em azul
    };
};


module.exports = {
    customizeConsole,
    registro
};