import axios from 'axios';

// Configuração
const REGISTER_TIMEOUT = 60000;
const REGISTRATION_INTERVAL = 30 * 60 * 1000; // 30 minutos

let registrationIntervalId = null;

const REGISTER_URL = 'https://scripts.isp.tools/register';

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
        // Detectar suporte de rede primeiro
        const { ipv4Result, ipv6Result } = await detectNetworkSupport();
        
        // Preparar dados de registro no novo formato
        const registrationData = {
            type: "registration",
            version: "2.1.4",
            port: global.serverPort || 8000,
            modules: [
                "dns",
                "http", 
                "mtu",
                "ping",
                "portscan",
                "ssl",
                "traceroute"
            ],
            ipv4: ipv4Result,
            ipv6: ipv6Result
        };
        
        const response = await axios.post(REGISTER_URL, registrationData, {
            timeout: REGISTER_TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `ISP.Tools-Probe/${global.version || '2.1.4'}`,
                'X-Probe-Version': global.version || '2.1.4',
                'X-Probe-PID': process.pid.toString()
            }
        });
        
        if (response.status === 200 && response.data) {
            // Verificar se a resposta tem o formato esperado
            if (response.data.status === 'success' && response.data.probeID) {
                global.probeID = response.data.probeID;
                
                console.log(`✓ [${global.sID || process.pid}] Registration successful - Probe ID: ${global.probeID}`);
                
                // Habilitar métricas quando probeID é definido e diferente de 0
                if (global.probeID !== 0 && global.enableMetrics) {
                    global.enableMetrics();
                    console.log(`📊 [${global.sID || process.pid}] Metrics enabled for probe ID: ${global.probeID}`);
                }
                
                return true;
            } else {
                throw new Error(`Invalid response format: ${JSON.stringify(response.data)}`);
            }
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
    const success = await performRegistration();
    
    if (success) {
        console.log(`✓ [${global.sID || process.pid}] Initial registration completed successfully`);
    } else {
        console.log(`✗ [${global.sID || process.pid}] Initial registration failed, will retry in 30 minutes`);
    }
    
    // Configurar registro periódico a cada 30 minutos
    registrationIntervalId = setInterval(async () => {
        const retrySuccess = await performRegistration();
        if (retrySuccess) {
            console.log(`✓ [${global.sID || process.pid}] Periodic registration successful`);
        } else {
            console.log(`✗ [${global.sID || process.pid}] Periodic registration failed, will retry in 30 minutes`);
        }
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
