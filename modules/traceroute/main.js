import { promises as dns } from 'dns';
import net from 'net';
import netPing from 'net-ping';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração específica do módulo TRACEROUTE
const TRACEROUTE_TIMEOUT = 1000; // 1 segundo por hop para traceroute

// Função auxiliar trim
const trim = (s) => {
	if (typeof s !== 'string') return '';
	return s.trim();
};

// Função para fazer traceroute usando net-ping
async function performTraceroute(targetIP, maxHops = 30, timeout = TRACEROUTE_TIMEOUT) {
	const hops = [];
	let reachedDestination = false;
	let timeouts = 0;
	const isIPv6 = net.isIPv6(targetIP);
	
	for (let ttl = 1; ttl <= maxHops; ttl++) {
		try {
			// Fazer múltiplas tentativas por hop para melhor precisão
			const attempts = [];
			
			for (let attempt = 0; attempt < 2; attempt++) {
				const sessionOptions = {
					timeout: timeout,
					retries: 0,
					ttl: ttl
				};
				try {
					if (isIPv6 && netPing.NetworkProtocol?.IPv6) {
						sessionOptions.networkProtocol = netPing.NetworkProtocol.IPv6;
					} else if (!isIPv6 && netPing.NetworkProtocol?.IPv4) {
						sessionOptions.networkProtocol = netPing.NetworkProtocol.IPv4;
					}
				} catch (_) { /* ignore */ }
				const session = netPing.createSession(sessionOptions);

				const hopResult = await new Promise((resolve) => {
					const startTime = Date.now();
					
					session.pingHost(targetIP, (error, target, sent, rcvd) => {
						const responseTime = Date.now() - startTime;
						session.close();
						
						if (error) {
							if (error.code === 'RequestTimedOut' || responseTime >= timeout) {
								resolve({
									success: false,
									type: 'timeout',
									responseTime: null,
									ip: null
								});
							} else {
								// Outros erros podem indicar TTL exceeded de hop intermediário
								resolve({
									success: false,
									type: 'no_reply',
									responseTime: null,
									ip: error.source || null
								});
							}
						} else {
							// Chegamos ao destino
							resolve({
								success: true,
								type: 'destination',
								responseTime: Math.round(responseTime),
								ip: target
							});
						}
					});
				});
				
				attempts.push(hopResult);
				
				// Se conseguiu resposta, não precisa tentar novamente
				if (hopResult.success || hopResult.ip) {
					break;
				}
			}

			// Escolher melhor resultado das tentativas
			const bestAttempt = attempts.find(a => a.success) || 
							  attempts.find(a => a.ip) || 
							  attempts[0];
			
			let finalResult;
			
			if (bestAttempt.success && bestAttempt.type === 'destination') {
				finalResult = {
					hop: ttl,
					ip: bestAttempt.ip,
					hostname: bestAttempt.ip,
					responseTime: bestAttempt.responseTime,
					status: 'reached'
				};
				reachedDestination = true;
			} else if (bestAttempt.ip) {
				finalResult = {
					hop: ttl,
					ip: bestAttempt.ip,
					hostname: bestAttempt.ip,
					responseTime: bestAttempt.responseTime,
					status: 'reply'
				};
			} else if (bestAttempt.type === 'timeout') {
				finalResult = {
					hop: ttl,
					ip: null,
					hostname: null,
					responseTime: null,
					status: 'timeout'
				};
				timeouts++;
			} else {
				finalResult = {
					hop: ttl,
					ip: null,
					hostname: null,
					responseTime: null,
					status: 'no_reply'
				};
			}

			hops.push(finalResult);
			
			// Se chegamos ao destino, parar
			if (reachedDestination) {
				break;
			}
			
		} catch (sessionError) {
			hops.push({
				hop: ttl,
				ip: null,
				hostname: null,
				responseTime: null,
				status: 'error',
				error: sessionError.message
			});
		}
		
		// Delay entre hops (reduzido para melhor performance)
		await new Promise(resolve => setTimeout(resolve, 5));
	}
	
	return {
		hops: hops,
		reachedDestination: reachedDestination,
		totalHops: hops.length,
		timeouts: timeouts
	};
}

export const tracerouteModule = {
	route: '/traceroute/:id/:maxhops?',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			let attrIP = request.params.id.toString();
			const maxHops = request.params.maxhops ? parseInt(trim(request.params.maxhops)) : 30;
			const sessionID = request.query.sessionID;
			
			// Validar maxHops
			if (maxHops < 1 || maxHops > 64) {
				return {
					"timestamp": Date.now(),
					"target": attrIP,
					"err": "invalid max hops (1-64)",
					"sessionID": sessionID,
					"responseTimeMs": Date.now() - startTime
				};
			}

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
						targetIP = ipv4s[0]; // Usar primeiro IP para traceroute
						ipVersion = 4;
					} catch (ipv4Error) {
						// Se IPv4 falhar, tentar IPv6 sempre (independente de global.ipv6Support)
						try {
							const ipv6s = await dns.resolve6(attrIP);
							resolvedIPs = ipv6s;
							targetIP = ipv6s[0];
							ipVersion = 6;
							
							// Verificar se IPv6 é realmente suportado só na hora de usar
							if (!global.ipv6Support) {
								return {
									"timestamp": Date.now(),
									"target": attrIP,
									"err": 'host has IPv6 only but IPv6 not supported on this probe',
									"sessionID": sessionID,
									"ipVersion": 6,
									"responseTimeMs": Date.now() - startTime
								};
							}
						} catch (ipv6Error) {
							// Se ambos falharam, usar erro mais específico
							throw ipv4Error; // Mantém erro IPv4 original
						}
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
				const is6 = net.isIPv6(attrIP);
				if (is6 && !global.ipv6Support) {
					return {
						"timestamp": Date.now(),
						"target": attrIP,
						"err": 'IPv6 not supported on this probe',
						"sessionID": sessionID,
						"ipVersion": 6,
						"responseTimeMs": Date.now() - startTime
					};
				}
				ipVersion = is6 ? 6 : 4;
			}

			// Executar traceroute
			const result = await performTraceroute(targetIP, maxHops, TRACEROUTE_TIMEOUT);

			return {
				"timestamp": Date.now(),
				"target": attrIP,
				"targetIP": targetIP,
				"resolvedIPs": resolvedIPs,
				"maxHops": maxHops,
				"totalHops": result.totalHops,
				"reachedDestination": result.reachedDestination,
				"timeouts": result.timeouts,
				"hops": result.hops,
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
