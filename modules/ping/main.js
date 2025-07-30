
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
				try {
					// Tentar resolver IPv4 primeiro
					try {
						const ipv4s = await dns.resolve4(attrIP);
						resolvedIPs = ipv4s;
						targetIP = ipv4s[Math.floor(Math.random() * ipv4s.length)];
						ipVersion = 4;
					} catch (ipv4Error) {
						// Se IPv4 falhar, tentar IPv6
						const ipv6s = await dns.resolve6(attrIP);
						resolvedIPs = ipv6s;
						targetIP = ipv6s[Math.floor(Math.random() * ipv6s.length)];
						ipVersion = 6;
					}
				} catch (err) {
					return {
						"timestamp": Date.now(),
						"target": attrIP,
						"err": 'host not found',
						"sessionID": sessionID,
						"ipVersion": 0,
						"responseTimeMs": Date.now() - startTime
					};
				}
			} else {
				ipVersion = net.isIPv6(attrIP) ? 6 : 4;
			}

			// Verificar se IPv6 é suportado na probe quando necessário
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
					"ipVersion": ipVersion,
					"responseTimeMs": Date.now() - startTime
				};
			}

			// Executar ping usando biblioteca net-ping
			const session = netPing.createSession({
				timeout: PING_TIMEOUT,
				retries: 1
			});

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
