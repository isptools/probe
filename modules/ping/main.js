
import { promises as dns } from 'dns';
import net from 'net';
import netPing from 'net-ping';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração específica do módulo PING
const PING_TIMEOUT = 1000; // 1 segundo para ping
const DNS_CACHE_TTL = 60000; // 60s de cache para resolução

// Cache simples em memória por worker: Map<host, { ips:[], version:4|6, expires:number, error?:string }>
const dnsCache = new Map();

function getCachedResolution(host) {
	const entry = dnsCache.get(host);
	if (!entry) return null;
	if (Date.now() > entry.expires) {
		dnsCache.delete(host);
		return null;
	}
	// Se agora IPv6 foi habilitado e a entrada era ipv6-only desabilitada, descartar para re-resolver
	if (global.ipv6Support && entry.error === 'ipv6-only (disabled)') {
		dnsCache.delete(host);
		return null;
	}
	return entry;
}

async function resolveHostWithCache(host) {
	// Se já é IP literal, retornar direto sem cache
	if (net.isIP(host)) {
		return { ips: [host], version: net.isIPv6(host) ? 6 : 4 };
	}
	const cached = getCachedResolution(host);
	if (cached) return cached;

	// Tentar IPv4 primeiro
	try {
		const ipv4s = await dns.resolve4(host);
		if (Array.isArray(ipv4s) && ipv4s.length) {
			const entry = { ips: ipv4s, version: 4, expires: Date.now() + DNS_CACHE_TTL };
			dnsCache.set(host, entry);
			return entry;
		}
	} catch (e4) {
		if (global.ipv6Support) {
			try {
				const ipv6s = await dns.resolve6(host);
				if (Array.isArray(ipv6s) && ipv6s.length) {
					const entry = { ips: ipv6s, version: 6, expires: Date.now() + DNS_CACHE_TTL };
					dnsCache.set(host, entry);
					return entry;
				}
			} catch (e6) {
				// Só cacheia negativo após registro concluído
				if (global.registrationCompleted) {
					const entry = { ips: [], version: 0, error: 'host not found', expires: Date.now() + DNS_CACHE_TTL };
					dnsCache.set(host, entry);
					return entry;
				}
				return { ips: [], version: 0, error: 'host not found' };
			}
		} else {
			// IPv6 desabilitado: verificar se host é IPv6-only para mensagem mais clara
			try {
				const ipv6s = await dns.resolve6(host);
				if (Array.isArray(ipv6s) && ipv6s.length) {
					// Não cachear antes de registro concluído
					const entry = { ips: ipv6s, version: 6, error: 'ipv6-only (disabled)', expires: Date.now() + DNS_CACHE_TTL };
					if (global.registrationCompleted) dnsCache.set(host, entry);
					return entry;
				}
			} catch (_) { /* ignorar */ }
			if (global.registrationCompleted) {
				const entry = { ips: [], version: 0, error: 'host not found', expires: Date.now() + DNS_CACHE_TTL };
				dnsCache.set(host, entry);
				return entry;
			}
			return { ips: [], version: 0, error: 'host not found' };
		}
	}
	// Se chegou aqui sem retorno, marcar como não encontrado
	if (global.registrationCompleted) {
		const entry = { ips: [], version: 0, error: 'host not found', expires: Date.now() + DNS_CACHE_TTL };
		dnsCache.set(host, entry);
		return entry;
	}
	return { ips: [], version: 0, error: 'host not found' };
}

// Função auxiliar trim
const trim = (s) => {
	if (typeof s !== 'string') return '';
	return s.trim();
};

export const ping = {
	route: '/ping/:id/:ttl?',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			const attrTTL = request.params.ttl ? parseInt(trim(request.params.ttl)) : 128;
			let attrIP = request.params.id.toString();
			const sessionID = request.query.sessionID;
			
			let sID = (global.sID >= 65535) ? 0 : global.sID + 1;
			global.sID = sID;

			// Resolver DNS (com cache) se necessário
			let targetIP = attrIP;
			let resolvedIPs = null;
			let ipVersion = 0;

			if (!net.isIP(attrIP)) {
				const resolution = await resolveHostWithCache(attrIP);
				if (resolution.error) {
					if (resolution.error === 'ipv6-only (disabled)') {
						return {
							"timestamp": Date.now(),
							"target": attrIP,
							"ip": resolution.ips,
							"err": 'IPv6 not supported on this probe',
							"sessionID": sessionID,
							"ipVersion": 6,
							"responseTimeMs": Date.now() - startTime,
							"cache": true,
							"ipv6Only": true
						};
					}
					return {
						"timestamp": Date.now(),
						"target": attrIP,
						"err": resolution.error,
						"sessionID": sessionID,
						"ipVersion": 0,
						"responseTimeMs": Date.now() - startTime,
						"cache": true
					};
				}
				resolvedIPs = resolution.ips;
				ipVersion = resolution.version;
				targetIP = resolvedIPs[Math.floor(Math.random() * resolvedIPs.length)];
			} else {
				ipVersion = net.isIPv6(attrIP) ? 6 : 4;
			}

			// Segurança extra: evitar undefined
			if (!targetIP || !net.isIP(targetIP)) {
				return {
					"timestamp": Date.now(),
					"ip": resolvedIPs || [],
					"target": targetIP || attrIP,
					"ms": null,
					"ttl": attrTTL,
					"err": 'host not found',
					"sessionID": sessionID,
					"sID": sID,
					"ipVersion": ipVersion || 0,
					"responseTimeMs": Date.now() - startTime
				};
			}

			// Verificar se IPv6 é suportado; se flag global indicar falso, tentar detectar dinamicamente
			if (ipVersion === 6 && !global.ipv6Support) {
				return {
					"timestamp": Date.now(),
					"ip": resolvedIPs,
					"target": targetIP,
					"ms": null,
					"ttl": attrTTL,
					"err": 'IPv6 not supported on this probe',
					"sessionID": sessionID,
					"sID": sID,
					"ipVersion": 6,
					"responseTimeMs": Date.now() - startTime
				};
			}

			// Executar ping usando biblioteca net-ping (seleciona protocolo correto)
			let sessionOptions = {
				timeout: PING_TIMEOUT,
				retries: 1
			};
			try {
				if (ipVersion === 6 && netPing.NetworkProtocol && netPing.NetworkProtocol.IPv6) {
					sessionOptions.networkProtocol = netPing.NetworkProtocol.IPv6;
				}
			} catch (_) { /* fallback silencioso */ }
			const session = netPing.createSession(sessionOptions);

			// Função para executar ping com Promise
			const pingTarget = (target) => {
				return new Promise((resolve, reject) => {
					const startTime = Date.now();
					session.pingHost(target, (error, target, sent, rcvd) => {
						if (error) {
							resolve({
								alive: false,
								time: null,
								error: error.message
							});
						} else {
							const responseTime = Date.now() - startTime;
							resolve({
								alive: true,
								time: responseTime,
								error: null
							});
						}
					});
				});
			};

			const result = await pingTarget(targetIP);

			return {
				"timestamp": Date.now(),
				"ip": resolvedIPs,
				"target": targetIP,
				"ms": result.alive ? Math.round(result.time) : null,
				"ttl": attrTTL,
				"err": result.alive ? null : (result.error || 'timeout'),
				"sessionID": sessionID,
				"sID": sID,
				"ipVersion": ipVersion,
				"responseTimeMs": Date.now() - startTime
			};

		} catch (error) {
			return {
				"timestamp": Date.now(),
				"target": request.params.id,
				"err": error.message,
				"sessionID": request.query.sessionID,
				"sID": global.sID,
				"responseTimeMs": Date.now() - startTime
			};
		}
	}
};
