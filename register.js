// Registro inicial da probe e keepalive.
//
// - Executar registro ao iniciar o servidor
// - Após primeiro sucesso, mudar para keepalive a cada 5 minutos
// - Requisição POST para https://scripts.isp.tools/register repassando o campo version com a versão do probe
// - Considerar sucesso se retornar 200 OK
// - Considerar falha se retornar 500 ou outro erro, e exibir mensagem de erro
// - Exibir mensagem de erro no console
// - Exibir mensagem de sucesso no console somente se for a primeira vez
//

import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import cluster from 'cluster';

// Configuração específica do módulo REGISTER
const REGISTER_TIMEOUT = 60000; // 60 segundos para requisições de registro

let isRegistered = false;
const REGISTER_INTERVAL = 5 * 60 * 1000; // 5 minutos em millisegundos

let url_prod = 'https://auto.isp.tools/webhook/probe';
let url_dev = 'https://auto.isp.tools/webhook-test/probe';

const REGISTER_URL =  process.env.NODE_ENV === 'development' ? url_dev : url_prod;
console.log(`Using registration URL: ${REGISTER_URL}`);

const RETRY_BASE_INTERVAL = 10 * 1000; // 10 segundos base para retry
const MAX_RETRY_INTERVAL = 5 * 60 * 1000; // Máximo de 5 minutos entre tentativas

let retryAttempt = 0;
let retryTimeoutId = null;
let isMasterInitialization = false; // Flag para controlar logs durante init do master
let hadPreviousError = false; // Flag para controlar quando mostrar sucesso após erro

// Sistema de gerenciamento de chaves de autenticação
let authKeys = new Map(); // Map<key, validUntil>

/**
 * Detecta quais módulos estão instalados
 */
async function getInstalledModules() {
    try {
        const modulesPath = path.join(process.cwd(), 'modules');
        const moduleDirectories = await fs.readdir(modulesPath, { withFileTypes: true });
        
        const installedModules = [];
        
        for (const dir of moduleDirectories) {
            if (dir.isDirectory()) {
                const mainFilePath = path.join(modulesPath, dir.name, 'main.js');
                try {
                    await fs.access(mainFilePath);
                    installedModules.push(dir.name);
                } catch (error) {
                    // Módulo não tem main.js válido, ignora
                }
            }
        }
        
        return installedModules;
    } catch (error) {
        console.warn('Warning: Could not detect installed modules:', error.message);
        return [];
    }
}

/**
 * Testa conectividade IPv4
 */
async function testIPv4Connectivity() {
    try {
        const response = await axios.get('https://ipv4.isp.tools/json', {
            timeout: 5000,
            headers: {
                'User-Agent': `ISPTools-Probe/${global.version}`
            }
        });
        
        if (response.status === 200 && response.data && response.data.ip && response.data.type === 'ipv4') {
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
 * Testa conectividade IPv6
 */
async function testIPv6Connectivity() {
    try {
        const response = await axios.get('https://ipv6.isp.tools/json', {
            timeout: 5000,
            headers: {
                'User-Agent': `ISPTools-Probe/${global.version}`
            }
        });
        
        if (response.status === 200 && response.data && response.data.ip && response.data.type === 'ipv6') {
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
 * Adiciona uma nova chave de autenticação
 */
function addAuthKey(key, validUntil) {
    authKeys.set(key, validUntil);
    // console.log(`🔑 New authentication key added (expires: ${new Date(validUntil * 1000).toISOString()})`);
    cleanExpiredKeys();
}

/**
 * Remove chaves expiradas
 */
function cleanExpiredKeys() {
    const now = Math.floor(Date.now() / 1000);
    const keysToRemove = [];
    
    for (const [key, validUntil] of authKeys.entries()) {
        if (validUntil <= now) {
            keysToRemove.push(key);
        }
    }
    
    keysToRemove.forEach(key => {
        authKeys.delete(key);
        // Só exibe no worker 1 ou se não estiver em cluster
        if (!cluster.worker || cluster.worker.id === 1) {
            // console.log(`🔑 Expired authentication key removed`);
        }
    });
}

/**
 * Retorna uma chave válida para autenticação
 */
function getValidAuthKey() {
    cleanExpiredKeys();
    
    if (authKeys.size === 0) {
        return null;
    }
    
    // Retorna a primeira chave válida
    return authKeys.keys().next().value;
}

/**
 * Verifica se uma chave é válida
 */
function isValidAuthKey(key) {
    cleanExpiredKeys();
    return authKeys.has(key);
}

/**
 * Retorna todas as chaves válidas
 */
function getValidAuthKeys() {
    cleanExpiredKeys();
    return Array.from(authKeys.keys());
}

/**
 * Calcula o intervalo de retry usando log₂(tentativa)
 */
function calculateRetryInterval(attempt) {
    if (attempt <= 1) return RETRY_BASE_INTERVAL;
    
    const logValue = Math.log2(attempt);
    const interval = RETRY_BASE_INTERVAL * logValue;
    
    // Limita ao máximo configurado
    return Math.min(interval, MAX_RETRY_INTERVAL);
}

/**
 * Função para registrar a probe no servidor central ou enviar keepalive
 */
async function registerProbe(isRetry = false) {
    const operationType = isRegistered ? 'keepalive' : 'registration';
    const actionText = isRegistered ? 'sending keepalive' : 'registering probe';

    try {
        // Coleta informações sobre módulos e conectividade (apenas no primeiro registro)
        let moduleInfo = {};
        if (!isRegistered) {
            const [installedModules, ipv4Test, ipv6Test, systemId] = await Promise.all([
                getInstalledModules(),
                testIPv4Connectivity(),
                testIPv6Connectivity()
            ]);
            
            moduleInfo = {
                modules: installedModules,
                ipv4: ipv4Test,
                ipv6: ipv6Test
            };
        }

        const requestData = {
            type: operationType, // 'registration' ou 'keepalive'
            version: global.version,
            port: global.serverPort,
            ...moduleInfo
        };

        const response = await axios.post(REGISTER_URL, requestData, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `ISPTools-Probe/${global.version}`
            },
            timeout: REGISTER_TIMEOUT
        });

        if (response.status === 200) {
            // Processa chave de autenticação se fornecida
            if (response.data && response.data.key && response.data.validUntil) {
                addAuthKey(response.data.key, response.data.validUntil);
            }
            
            // Se houve erro anterior e agora obteve sucesso, mostrar mensagem de recuperação
            if (hadPreviousError && retryAttempt > 0) {
                const successText = isRegistered ? 'Keepalive successful after retry' : 'Probe registration successful after retry';
                // Só exibe no worker 1 ou se não estiver em cluster
                if (!cluster.worker || cluster.worker.id === 1) {
                    console.log(`✅ ${successText}`);
                }
            }
            
            // Reset flags on success
            retryAttempt = 0;
            hadPreviousError = false;
            
            // Clear any pending retry timeout
            if (retryTimeoutId) {
                clearTimeout(retryTimeoutId);
                retryTimeoutId = null;
            }
            
            if (!isRegistered) {
                // Marca como registrada após primeiro sucesso
                isRegistered = true;
                
                // Armazena informações de conectividade globalmente
                global.ipv4Support = moduleInfo.ipv4?.supported || false;
                global.ipv6Support = moduleInfo.ipv6?.supported || false;

                // Para initializeRegistrationSync (master), não mostrar logs detalhados aqui
                // pois já será mostrado pela função que chama
                const shouldShowLogs = (!cluster.worker || cluster.worker.id === 1) && !isMasterInitialization;
                
                if (shouldShowLogs) {
                    console.log('- Probe version:', global.version);
                    console.log('- Request Logs:', global.showRequestLogs ? 'ENABLED' : 'DISABLED');
                    
                    // Exibe informações de conectividade
                    if (moduleInfo.ipv4?.supported) {
                        console.log('- IPv4 Support: ✓ ENABLED -', `${moduleInfo.ipv4.ip}:${moduleInfo.ipv4.port}`);
                    } else {
                        console.log('- IPv4 Support: ✗ DISABLED');
                    }
                    
                    if (moduleInfo.ipv6?.supported) {
                        console.log('- IPv6 Support: ✓ ENABLED -', `[${moduleInfo.ipv6.ip}]:${moduleInfo.ipv6.port}`);
                    } else {
                        console.log('- IPv6 Support: ✗ DISABLED');
                    }

                    if (global.isDev) {
                        console.log('- Running in Development Mode');
                    }
                    
                    console.log('-------------------------------------------------------');                
                    console.log('- ✓ Probe registered successfully!');
                    console.log('-\n-  🌐 Dashboard: https://www.isp.tools');
                    console.log('------------------------------------------------------');
                    console.log('    ___ ___ ___ _____         _    ');
                    console.log('   |_ _/ __| _ \\_   _|__  ___| |___');
                    console.log('    | |\\__ \\  _/ | |/ _ \\/ _ \\ (_-<');
                    console.log('   |___|___/_|   |_|\\___/\\___/_/__/');
                    console.log('                                    ');
                    console.log('Copyright © 2025 Giovane Heleno\n');
                }
            }
            
            return true;
        } else {
            throw new Error(`Server returned status ${response.status}`);
        }
    } catch (error) {
        const errorMessage = error.response?.status 
            ? `Status ${error.response.status}: ${error.response.statusText}`
            : error.message;
        
        const errorText = isRegistered ? 'sending keepalive' : 'registering probe';
        
        // Só exibe no worker 1 ou se não estiver em cluster
        if (!cluster.worker || cluster.worker.id === 1) {
            console.error(`✗ Error ${errorText}:`, errorMessage);
        }
        
        // Marca que houve erro para mostrar sucesso na próxima tentativa bem-sucedida
        hadPreviousError = true;
        
        // Implementa retry com backoff log₂
        retryAttempt++;
        const retryInterval = calculateRetryInterval(retryAttempt);
        
        // Só exibe no worker 1 ou se não estiver em cluster
        if (!cluster.worker || cluster.worker.id === 1) {
            console.log(`🔄 Scheduling retry #${retryAttempt} in ${Math.round(retryInterval / 1000)}s`);
        }
        
        // Clear any existing retry timeout
        if (retryTimeoutId) {
            clearTimeout(retryTimeoutId);
        }
        
        // Schedule retry
        retryTimeoutId = setTimeout(() => {
            registerProbe(true);
        }, retryInterval);
        
        return false;
    }
}

/**
 * Inicializa o sistema de registro e keepalive
 */
export function initializeRegistration() {
    // Só exibe no worker 1 ou se não estiver em cluster
    if (!cluster.worker || cluster.worker.id === 1) {
        console.log('Registering probe...');
    }
    
    // Executa o primeiro registro imediatamente
    registerProbe();
    
    // Configura o intervalo de 5 minutos para keepalive
    setInterval(registerProbe, REGISTER_INTERVAL);
}

/**
 * Versão assíncrona para uso no master process que aguarda o sucesso do registro
 */
export async function initializeRegistrationSync() {
    console.log('🔗 Probe registration...');
    isMasterInitialization = true; // Sinalizar que é init do master
    
    try {
        // Aguarda até que o registro seja bem-sucedido
        await new Promise((resolve, reject) => {
            // Primeira tentativa
            registerProbe().then(success => {
                if (success) {
                    resolve(true);
                }
                // Se não teve sucesso, o retry já foi agendado dentro do registerProbe
                // Continua monitorando através da flag isRegistered
            }).catch(error => {
                // Se houve erro, o retry já foi agendado dentro do registerProbe
                // Continua monitorando através da flag isRegistered
            });

            // Monitora se o registro foi bem-sucedido através da flag isRegistered
            const checkRegistrationStatus = () => {
                if (isRegistered) {
                    resolve(true);
                } else {
                    setTimeout(checkRegistrationStatus, 500); // Verifica a cada 500ms
                }
            };
            
            // Inicia o monitoramento após um pequeno delay
            setTimeout(checkRegistrationStatus, 500);
        });

        console.log('✅ Probe registered successfully');
        
        // Configura o intervalo de 5 minutos para keepalive
        setInterval(registerProbe, REGISTER_INTERVAL);
        
        return true;
        
    } catch (error) {
        console.error('❌ Failed to register probe:', error.message);
        return false;
    } finally {
        isMasterInitialization = false; // Reset flag
    }
}

/**
 * Retorna informações sobre as chaves de autenticação para debug
 */
function getAuthKeysInfo() {
    cleanExpiredKeys();
    
    if (authKeys.size === 0) {
        return {
            count: 0,
            keys: [],
            message: 'No authentication keys available'
        };
    }
    
    const keysInfo = [];
    for (const [key, validUntil] of authKeys.entries()) {
        const expiresAt = new Date(validUntil * 1000);
        const timeLeft = validUntil - Math.floor(Date.now() / 1000);
        
        keysInfo.push({
            key: key.substring(0, 8) + '...' + key.substring(key.length - 8), // Mascarar a chave
            expiresAt: expiresAt.toISOString(),
            timeLeftSeconds: timeLeft,
            timeLeftFormatted: timeLeft > 0 ? `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s` : 'EXPIRED'
        });
    }
    
    return {
        count: authKeys.size,
        keys: keysInfo,
        message: `${authKeys.size} authentication key(s) available`
    };
}

/**
 * Exporta funções para uso em outros módulos
 */
export { getValidAuthKey, isValidAuthKey, getValidAuthKeys, getAuthKeysInfo };
