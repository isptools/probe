// Registro simplificado da probe para PM2
import axios from 'axios';

// Configuração
const REGISTER_TIMEOUT = 60000;
const REGISTRATION_INTERVAL = 30 * 60 * 1000; // 30 minutos

let registrationIntervalId = null;

const REGISTER_URL = process.env.NODE_ENV === 'development' 
    ? 'https://auto.isp.tools/webhook-test/probe'
    : 'https://auto.isp.tools/webhook/probe';

/**
 * Testa suporte IPv4 ou IPv6
 * @param {string} version - 'ipv4' ou 'ipv6'
 */
async function testIPSupport(version) {
    try {
        const config = {
            timeout: version === 'ipv4' ? 10000 : 15000,
            family: version === 'ipv4' ? 4 : 6
        };
        
        const response = await axios.get(`http://${version}.isp.tools/json`, config);
        
        if (response.status === 200 && response.data && response.data.ip && response.data.type === version) {
            return {
                supported: true,
                ip: response.data.ip,
                port: global.serverPort
            };
        }
        
        return { supported: false };
    } catch (error) {
        return { supported: false };
    }
}

/**
 * Detecta suporte IPv4 e IPv6 e atualiza as configurações globais
 */
export async function detectNetworkSupport() {
    // Testar conectividade em paralelo
    const [ipv4Result, ipv6Result] = await Promise.all([
        testIPSupport('ipv4'),
        testIPSupport('ipv6')
    ]);
    
    // Atualizar configurações globais
    global.ipv4Support = ipv4Result.supported;
    global.ipv6Support = ipv6Result.supported;
    
    return { ipv4Result, ipv6Result };
}

/**
 * Executa o registro da probe
 */
async function performRegistration() {
    try {
        // Usar as configurações globais já detectadas
        const registrationData = {
            version: global.version,
            pid: process.pid,
            port: global.serverPort,
            ipv4: { supported: global.ipv4Support },
            ipv6: { supported: global.ipv6Support },
            timestamp: Date.now()
        };
        
        const response = await axios.post(REGISTER_URL, registrationData, {
            timeout: REGISTER_TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `ISP.Tools-Probe/${global.version}`,
                'X-Probe-Version': global.version,
                'X-Probe-PID': process.pid.toString()
            }
        });
        
        if (response.status === 200) {
            // Atualizar systemID (IPv4/IPv6 já foram atualizados na detectNetworkSupport)
            global.systemID = response.data.systemID;
            
            return true;
        }
        
        throw new Error(`Registration failed with status ${response.status}`);
        
    } catch (error) {
        if (error.response) {
            console.error(`✗ Registration failed: Status ${error.response.status}: ${error.response.data || error.response.statusText}`);
        } else if (error.code === 'ECONNREFUSED') {
            console.error('✗ Registration failed: Connection refused (service may be down)');
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            console.error('✗ Registration failed: Network timeout or DNS resolution failed');
        } else {
            console.error(`✗ Registration failed: ${error.message}`);
        }
        
        return false;
    }
}

/**
 * Verifica se esta instância deve executar o registro
 */
function shouldRunRegistration() {
    // PM2 fornece NODE_APP_INSTANCE ou PM2_INSTANCE_ID
    const instanceId = process.env.NODE_APP_INSTANCE || process.env.PM2_INSTANCE_ID || '0';
    
    // Apenas a primeira instância (0) executa o registro
    return instanceId === '0';
}

/**
 * Inicializa o sistema de registro periódico
 */
export async function initializeRegistration() {
    // Verificar se esta instância deve executar o registro
    if (!shouldRunRegistration()) {
        return;
    }
    
    // Executar registro inicial
    await performRegistration();
    
    // Configurar registro periódico a cada 30 minutos
    registrationIntervalId = setInterval(async () => {
        await performRegistration();
    }, REGISTRATION_INTERVAL);
}

/**
 * Para o sistema de registro periódico
 */
export function stopRegistration() {
    if (registrationIntervalId) {
        clearInterval(registrationIntervalId);
        registrationIntervalId = null;
    }
}
