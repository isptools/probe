
import { promises as dns } from 'dns';
import net from 'net';
import netPing from 'net-ping';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração específica do módulo PING
const PING_TIMEOUT = 1000; // 1 segundo para ping

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

			// Resolver DNS se necessário para IPv4 e IPv6
			let targetIP = attrIP;
			let resolvedIPs = null;
			let ipVersion = 0;

			if (!net.isIP(attrIP)) {
				const tryResolve = async () => {
					// Primeiro IPv4
					try {
						const ipv4s = await dns.resolve4(attrIP);
						if (Array.isArray(ipv4s) && ipv4s.length > 0) {
							return { ips: ipv4s, version: 4 };
						}
					} catch (_) { /* ignora e tenta IPv6 */ }
					// Depois IPv6
					try {
						const ipv6s = await dns.resolve6(attrIP);
						if (Array.isArray(ipv6s) && ipv6s.length > 0) {
							return { ips: ipv6s, version: 6 };
						}
					} catch (_) { /* sem registros */ }
					return null;
				};

				const resolved = await tryResolve();
				if (!resolved) {
					return {
						"timestamp": Date.now(),
						"target": attrIP,
						"err": 'host not found',
						"sessionID": sessionID,
						"ipVersion": 0,
						"responseTimeMs": Date.now() - startTime
					};
				}
				resolvedIPs = resolved.ips;
				ipVersion = resolved.version;
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
