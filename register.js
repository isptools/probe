import axios from 'axios';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Configuração
const REGISTER_TIMEOUT = 60000;
const REGISTRATION_INTERVAL = 30 * 60 * 1000; // 30 minutos

let registrationIntervalId = null;

const REGISTER_URL = 'https://scripts.isp.tools/register';

// Caminho para arquivo de persistência do hash
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROBE_HASH_FILE = join(__dirname, '.probe-hash');

// Cache do hash em memória
let cachedProbeHash = null;

/**
 * Lê o machine-id do sistema operacional Linux
 * @returns {string|null} Machine ID ou null se não disponível
 */
function getMachineId() {
    const machineIdPaths = [
        '/etc/machine-id',
        '/var/lib/dbus/machine-id'
    ];
    
    for (const path of machineIdPaths) {
        try {
            if (existsSync(path)) {
                const machineId = readFileSync(path, 'utf8').trim();
                if (machineId && machineId.length > 0) {
                    return machineId;
                }
            }
        } catch (error) {
            // Continua para o próximo caminho
        }
    }
    
    // Fallback: usar hostname + pid como identificador único
    return `fallback-${process.env.HOSTNAME || 'unknown'}-${process.pid}`;
}

/**
 * Gera ou recupera o hash único da probe
 * Na primeira execução, cria um hash baseado no machine-id + timestamp
 * Nas execuções seguintes, recupera o hash persistido
 * @returns {string} Hash único da probe
 */
function getOrCreateProbeHash() {
    // Retorna do cache se disponível
    if (cachedProbeHash) {
        return cachedProbeHash;
    }
    
    // Tenta carregar hash existente
    try {
        if (existsSync(PROBE_HASH_FILE)) {
            const savedData = JSON.parse(readFileSync(PROBE_HASH_FILE, 'utf8'));
            if (savedData.hash && savedData.createdAt) {
                cachedProbeHash = savedData.hash;
                console.log(`✓ [${global.sID || process.pid}] Probe hash loaded (created: ${savedData.createdAt})`);
                return cachedProbeHash;
            }
        }
    } catch (error) {
        console.warn(`⚠ [${global.sID || process.pid}] Failed to load probe hash: ${error.message}`);
    }
    
    // Gera novo hash na primeira execução
    const machineId = getMachineId();
    const createdAt = new Date().toISOString();
    const timestamp = Date.now();
    
    // Combina machine-id + timestamp para criar hash único
    const dataToHash = `${machineId}:${timestamp}:${createdAt}`;
    const hash = createHash('sha256').update(dataToHash).digest('hex');
    
    // Persistir hash para uso futuro
    try {
        const hashData = {
            hash,
            machineId: machineId.substring(0, 8) + '...', // Salva parcialmente por privacidade
            createdAt,
            timestamp
        };
        writeFileSync(PROBE_HASH_FILE, JSON.stringify(hashData, null, 2), 'utf8');
        console.log(`✓ [${global.sID || process.pid}] New probe hash generated and saved`);
    } catch (error) {
        console.warn(`⚠ [${global.sID || process.pid}] Failed to save probe hash: ${error.message}`);
    }
    
    cachedProbeHash = hash;
    return hash;
}

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
    
    // Atualizar IPs detectados
    global.probeIPs = {
        ipv4: ipv4Result.ip || null,
        ipv6: ipv6Result.ip || null
    };
    
    // Inicializar probeHash cedo (antes do servidor iniciar)
    global.probeHash = getOrCreateProbeHash();
    
    return { ipv4Result, ipv6Result };
}

/**
 * Executa o registro da probe
 */
async function performRegistration() {
    try {
        // Detectar suporte de rede primeiro
        const { ipv4Result, ipv6Result } = await detectNetworkSupport();
        
        // Obter ou criar hash único da probe
        const probeHash = getOrCreateProbeHash();
        global.probeHash = probeHash;
        
        // Preparar dados de registro no novo formato
        const registrationData = {
            type: "registration",
            version: global.version,
            port: global.serverPort || 8000,
            probeHash: probeHash,
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
                global.isRegistered = true;
                
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
            // Serializar response.data como JSON para mostrar o motivo completo do erro
            const errorDetails = typeof error.response.data === 'object' 
                ? JSON.stringify(error.response.data, null, 2)
                : error.response.data || error.response.statusText;
            
            console.error(`✗ Registration failed: Status ${error.response.status}:`);
            console.error(errorDetails);
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
