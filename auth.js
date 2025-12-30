// Middleware de autenticação baseado em IP para endpoints da probe
//
// Verifica se a requisição provém de IPs autorizados (isp.tools, localhost, bogons)
//

import { promises as dns } from 'dns';
import net from 'net';

// Array global de IPs autorizados
let authorizedIPs = [];
let initialized = false;
let refreshInterval = null;

// Intervalo de renovação dos IPs autorizados (5 minutos)
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Timeout para operações de rede (10 segundos)
const NETWORK_TIMEOUT_MS = 10000;

// Hostnames cujos IPs devem ser autorizados automaticamente
const AUTH_HOSTNAMES = ['api.isp.tools', 'auto.isp.tools', 'scripts.isp.tools', 'proxy.isp.tools'];

/**
 * Função para obter informações de IP externo com timeout
 */
async function fetchExternalIP(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        return null;
    }
}

/**
 * Função para converter IP em rede (/24 para IPv4, /48 para IPv6)
 */
function ipToNetwork(ip) {
    if (net.isIPv4(ip)) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    } else if (net.isIPv6(ip)) {
        // Normaliza o IPv6 antes de extrair a rede
        const normalized = normalizeIPv6(ip);
        const parts = normalized.split(':');
        // Para IPv6, pegamos os primeiros 48 bits (3 grupos de 16 bits)
        return `${parts[0]}:${parts[1]}:${parts[2]}::/48`;
    }
    return null;
}

/**
 * Normaliza um endereço IPv6 para formato completo (8 grupos de 4 hex)
 */
function normalizeIPv6(ip) {
    // Remove zona se existir (ex: %eth0)
    ip = ip.split('%')[0];
    
    // Expande :: para zeros
    let parts = ip.split(':');
    
    // Procura por :: e expande
    const emptyIndex = parts.indexOf('');
    if (emptyIndex !== -1) {
        // Conta quantos grupos vazios precisamos adicionar
        const nonEmptyParts = parts.filter(p => p !== '');
        const zerosNeeded = 8 - nonEmptyParts.length;
        
        // Reconstrói o array com os zeros expandidos
        const before = parts.slice(0, emptyIndex).filter(p => p !== '');
        const after = parts.slice(emptyIndex).filter(p => p !== '');
        const zeros = new Array(zerosNeeded).fill('0000');
        
        parts = [...before, ...zeros, ...after];
    }
    
    // Normaliza cada parte para 4 dígitos
    parts = parts.map(p => p.padStart(4, '0').toLowerCase());
    
    // Garante que temos exatamente 8 partes
    while (parts.length < 8) {
        parts.push('0000');
    }
    
    return parts.slice(0, 8).join(':');
}

/**
 * Função para verificar se um IP está dentro de uma rede
 */
function isIPInNetwork(ip, network) {
    const [networkAddr, prefixLength] = network.split('/');
    const prefix = parseInt(prefixLength);
    
    if (net.isIPv4(ip) && net.isIPv4(networkAddr)) {
        const ipInt = ipToInt(ip);
        const networkInt = ipToInt(networkAddr);
        const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
        return (ipInt & mask) === (networkInt & mask);
    } else if (net.isIPv6(ip) && net.isIPv6(networkAddr)) {
        // Normaliza ambos os endereços para comparação correta
        const normalizedIP = normalizeIPv6(ip);
        const normalizedNetwork = normalizeIPv6(networkAddr);
        
        // Compara bit a bit baseado no prefixo
        const ipParts = normalizedIP.split(':').map(p => parseInt(p, 16));
        const networkParts = normalizedNetwork.split(':').map(p => parseInt(p, 16));
        
        let bitsToCompare = prefix;
        for (let i = 0; i < 8 && bitsToCompare > 0; i++) {
            const bitsInThisGroup = Math.min(bitsToCompare, 16);
            const mask = (0xFFFF << (16 - bitsInThisGroup)) & 0xFFFF;
            
            if ((ipParts[i] & mask) !== (networkParts[i] & mask)) {
                return false;
            }
            
            bitsToCompare -= 16;
        }
        return true;
    }
    
    return false;
}

/**
 * Converte IPv4 para inteiro
 */
function ipToInt(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * Resolve DNS com timeout
 */
async function resolveDNSWithTimeout(host, type) {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve([]), NETWORK_TIMEOUT_MS);
        
        const resolver = type === 'A' ? dns.resolve4 : dns.resolve6;
        resolver(host)
            .then(ips => {
                clearTimeout(timeoutId);
                resolve(ips);
            })
            .catch(() => {
                clearTimeout(timeoutId);
                resolve([]);
            });
    });
}

/**
 * Carrega os IPs autorizados dinamicamente
 */
async function loadAuthorizedIPs() {
    const newAuthorizedIPs = [];

    // 1. Obter IPv4 externo
    const ipv4Info = await fetchExternalIP('https://ipv4.isp.tools/json');
    if (ipv4Info && ipv4Info.ip) {
        const ipv4Network = ipToNetwork(ipv4Info.ip);
        if (ipv4Network) {
            newAuthorizedIPs.push(ipv4Network);
        }
    }

    // 2. Obter IPv6 externo
    const ipv6Info = await fetchExternalIP('https://ipv6.isp.tools/json');
    if (ipv6Info && ipv6Info.ip) {
        const ipv6Network = ipToNetwork(ipv6Info.ip);
        if (ipv6Network) {
            newAuthorizedIPs.push(ipv6Network);
        }
    }

    // 3. Resolver DNS dos hostnames autorizados (IPv4 e IPv6 em paralelo)
    const dnsPromises = AUTH_HOSTNAMES.flatMap(host => [
        resolveDNSWithTimeout(host, 'A'),
        resolveDNSWithTimeout(host, 'AAAA')
    ]);
    
    const dnsResults = await Promise.all(dnsPromises);
    
    for (const ips of dnsResults) {
        for (const ip of ips) {
            const network = ipToNetwork(ip);
            if (network && !newAuthorizedIPs.includes(network)) {
                newAuthorizedIPs.push(network);
            }
        }
    }

    // 4. Adicionar IPs bogons e localhost (sempre presentes)
    const staticIPs = [
        // Localhost
        '127.0.0.0/8',
        '::1/128',
        
        // Private networks (RFC 1918)
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        
        // Link-local
        '169.254.0.0/16',
        'fe80::/10',
    ];

    for (const ip of staticIPs) {
        if (!newAuthorizedIPs.includes(ip)) {
            newAuthorizedIPs.push(ip);
        }
    }

    return newAuthorizedIPs;
}

/**
 * Inicializa o sistema de autenticação
 */
export async function initializeAuth() {
    if (initialized) return;
    
    try {
        authorizedIPs = await loadAuthorizedIPs();
        initialized = true;
        
        // Configura renovação periódica dos IPs
        if (!refreshInterval) {
            refreshInterval = setInterval(async () => {
                const newIPs = await loadAuthorizedIPs();
                if (newIPs.length > 0) {
                    authorizedIPs = newIPs;
                }
            }, REFRESH_INTERVAL_MS);
            
            // Permite que o processo termine mesmo com o interval ativo
            refreshInterval.unref();
        }

    } catch (error) {
        // Em caso de erro, permite apenas localhost
        authorizedIPs = ['127.0.0.0/8', '::1/128'];
        initialized = true;
    }
}

/**
 * Middleware de autenticação baseado em IP
 */
export async function ipAuthMiddleware(request, reply) {
    // Inicializa se ainda não foi feito
    if (!initialized) {
        await initializeAuth();
    }

    // Obtém o IP do cliente
    const clientIP = request.ip || request.socket.remoteAddress;
    
    if (!clientIP) {
        reply.status(401).send({
            error: 'Unable to determine client IP',
            message: 'Could not identify the source IP address'
        });
        return;
    }

    // Verifica se o IP está autorizado
    let authorized = false;
    for (const network of authorizedIPs) {
        if (network.includes('/')) {
            if (isIPInNetwork(clientIP, network)) {
                authorized = true;
                break;
            }
        } else {
            if (clientIP === network) {
                authorized = true;
                break;
            }
        }
    }

    if (!authorized) {
        reply.status(403).send({
            error: 'IP not authorized',
            message: `Access denied for IP: ${clientIP}`,
            clientIP: clientIP
        });
        return;
    }

    // IP autorizado, continua
}

/**
 * Middleware opcional (compatibilidade)
 */
export async function optionalAuthMiddleware(request, reply) {
    return await ipAuthMiddleware(request, reply);
}

/**
 * Middleware de autenticação (compatibilidade)
 */
export async function authMiddleware(request, reply) {
    return await ipAuthMiddleware(request, reply);
}

/**
 * Handler para status da autenticação
 */
export async function authStatusHandler(request, reply) {
    if (!initialized) {
        await initializeAuth();
    }

    const response = {
        authType: 'IP-based',
        authorizedNetworks: authorizedIPs.length,
        networks: authorizedIPs,
        message: 'Authentication is based on authorized IP networks'
    };
    
    // Se não há reply (chamada interna), retorna direto
    if (!reply) {
        return response;
    }
    
    return response;
}
