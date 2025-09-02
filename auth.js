// Middleware de autenticação baseado em IP para endpoints da probe
//
// Verifica se a requisição provém de IPs autorizados (isp.tools, localhost, bogons)
//

import { promises as dns } from 'dns';
import net from 'net';

// Array global de IPs autorizados
let authorizedIPs = [];
let initialized = false;

// Hostnames cujos IPs devem ser autorizados automaticamente
const AUTH_HOSTNAMES = ['api.isp.tools', 'auto.isp.tools', 'scripts.isp.tools', 'proxy.isp.tools'];

/**
 * Função para obter informações de IP externo
 */
async function fetchExternalIP(url) {
    try {
        const response = await fetch(url);
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
        // Para IPv6, pegamos os primeiros 48 bits (3 grupos de 16 bits)
        const parts = ip.split(':');
        const network = parts.slice(0, 3).join(':');
        return `${network}::/48`;
    }
    return null;
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
        // Simplificação para /48 - compara os primeiros 3 grupos
        const ipParts = ip.split(':');
        const networkParts = networkAddr.split(':');
        const groupsToCompare = Math.floor(prefix / 16);
        
        for (let i = 0; i < groupsToCompare; i++) {
            if (ipParts[i] !== networkParts[i]) return false;
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
 * Inicializa o sistema de autenticação
 */
export async function initializeAuth() {
    if (initialized) return;
    
    try {
        // 1. Obter IPv4 externo
        const ipv4Info = await fetchExternalIP('https://ipv4.isp.tools/json');
        if (ipv4Info && ipv4Info.ip) {
            const ipv4Network = ipToNetwork(ipv4Info.ip);
            if (ipv4Network) {
                authorizedIPs.push(ipv4Network);
            }
        }

        // 2. Obter IPv6 externo
        const ipv6Info = await fetchExternalIP('https://ipv6.isp.tools/json');
        if (ipv6Info && ipv6Info.ip) {
            const ipv6Network = ipToNetwork(ipv6Info.ip);
            if (ipv6Network) {
                authorizedIPs.push(ipv6Network);
            }
        }

        // 4-5. Resolver DNS dos hostnames autorizados
        for (const host of AUTH_HOSTNAMES) {
            try {
                const ipv4s = await dns.resolve4(host);
                for (const ip of ipv4s) {
                    const network = ipToNetwork(ip);
                    if (network && !authorizedIPs.includes(network)) {
                        authorizedIPs.push(network);
                    }
                }
            } catch (error) {
                // DNS resolution failed for IPv4, continue
            }

            try {
                const ipv6s = await dns.resolve6(host);
                for (const ip of ipv6s) {
                    const network = ipToNetwork(ip);
                    if (network && !authorizedIPs.includes(network)) {
                        authorizedIPs.push(network);
                    }
                }
            } catch (error) {
                // DNS resolution failed for IPv6, continue
            }
        }

        // 6. Adicionar IPs bogons e localhost
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
            
            // Loopback IPv6
            '::1/128'
        ];

        for (const ip of staticIPs) {
            if (!authorizedIPs.includes(ip)) {
                authorizedIPs.push(ip);
            }
        }

        initialized = true;

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
