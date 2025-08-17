import { promises as dns } from 'dns';
import net from 'net';
import netPing from 'net-ping';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração específica do módulo TRACEROUTE
const TRACEROUTE_TIMEOUT = 500; // Reduzido para 500ms por hop
const MAX_CONSECUTIVE_TIMEOUTS = 5; // Parar após 5 timeouts consecutivos

// Função auxiliar trim
const trim = (s) => {
	if (typeof s !== 'string') return '';
	return s.trim();
};

// Função para fazer traceroute usando net-ping
async function performTraceroute(targetIP, maxHops = 30, timeout = TRACEROUTE_TIMEOUT) {
	console.log('[TRACEROUTE DEBUG] performTraceroute iniciado - IP:', targetIP, 'maxHops:', maxHops, 'timeout:', timeout);
	const hops = [];
	let reachedDestination = false;
	let timeouts = 0;
	let consecutiveTimeouts = 0; // Contador para timeouts consecutivos
	const isIPv6 = net.isIPv6(targetIP);
	console.log('[TRACEROUTE DEBUG] É IPv6:', isIPv6);
	
	for (let ttl = 1; ttl <= maxHops; ttl++) {
		console.log('[TRACEROUTE DEBUG] Hop', ttl, 'de', maxHops);
		try {
			// Fazer apenas 1 tentativa por hop para ser mais rápido
			const attempts = [];
			
			for (let attempt = 0; attempt < 1; attempt++) {
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
				} catch (protocolError) { 
					console.log('[TRACEROUTE DEBUG] Erro ao configurar protocolo:', protocolError.message);
				}
				
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
				consecutiveTimeouts = 0; // Reset contador
			} else if (bestAttempt.ip) {
				finalResult = {
					hop: ttl,
					ip: bestAttempt.ip,
					hostname: bestAttempt.ip,
					responseTime: bestAttempt.responseTime,
					status: 'reply'
				};
				consecutiveTimeouts = 0; // Reset contador
			} else if (bestAttempt.type === 'timeout') {
				finalResult = {
					hop: ttl,
					ip: null,
					hostname: null,
					responseTime: null,
					status: 'timeout'
				};
				timeouts++;
				consecutiveTimeouts++;
			} else {
				finalResult = {
					hop: ttl,
					ip: null,
					hostname: null,
					responseTime: null,
					status: 'no_reply'
				};
				consecutiveTimeouts++; // Também conta como timeout consecutivo
			}

			hops.push(finalResult);
			
			// Se chegamos ao destino, parar
			if (reachedDestination) {
				console.log('[TRACEROUTE DEBUG] Destino alcançado, parando');
				break;
			}
			
			// Se muitos timeouts consecutivos, parar para economizar tempo
			if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
				console.log('[TRACEROUTE DEBUG] Muitos timeouts consecutivos (', consecutiveTimeouts, '), parando traceroute');
				break;
			}
			
		} catch (sessionError) {
			console.log('[TRACEROUTE DEBUG] Erro na sessão:', sessionError.message);
			hops.push({
				hop: ttl,
				ip: null,
				hostname: null,
				responseTime: null,
				status: 'error',
				error: sessionError.message
			});
			consecutiveTimeouts++; // Erro também conta como timeout consecutivo
		}
		
		// Se muitos timeouts consecutivos, parar para economizar tempo
		if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
			console.log('[TRACEROUTE DEBUG] Muitos timeouts consecutivos após erro, parando traceroute');
			break;
		}
		
		// Delay entre hops removido para ser mais rápido
		// await new Promise(resolve => setTimeout(resolve, 5));
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
			console.log('[TRACEROUTE DEBUG] Iniciando traceroute para:', request.params.id);
			let attrIP = request.params.id.toString();
			const maxHops = request.params.maxhops ? parseInt(trim(request.params.maxhops)) : 30;
			const sessionID = request.query.sessionID;
			console.log('[TRACEROUTE DEBUG] Parâmetros:', { attrIP, maxHops, sessionID });
			
			// Validar maxHops
			if (maxHops < 1 || maxHops > 64) {
				console.log('[TRACEROUTE DEBUG] MaxHops inválido:', maxHops);
				return {
					"timestamp": Date.now(),
					"target": attrIP,
					"err": "invalid max hops (1-64)",
					"sessionID": sessionID,
					"responseTimeMs": Date.now() - startTime
				};
			}

			console.log('[TRACEROUTE DEBUG] Iniciando resolução DNS...');

			let sID = (global.sID >= 65535) ? 0 : global.sID + 1;
			global.sID = sID;

			// Resolver DNS se necessário para IPv4 e IPv6
			let targetIP = attrIP;
			let resolvedIPs = null;
			let ipVersion = 0;
			
		if (!net.isIP(attrIP)) {
			console.log('[TRACEROUTE DEBUG] Resolvendo hostname:', attrIP);
			try {
				// Tentar resolver IPv4 primeiro
				try {
					console.log('[TRACEROUTE DEBUG] Tentando IPv4...');
					const ipv4s = await dns.resolve4(attrIP);
					console.log('[TRACEROUTE DEBUG] IPv4 resolvido:', ipv4s);
					resolvedIPs = ipv4s;
					targetIP = ipv4s[0]; // Usar primeiro IP para traceroute
					ipVersion = 4;
				} catch (ipv4Error) {
					console.log('[TRACEROUTE DEBUG] IPv4 falhou:', ipv4Error.message, 'Tentando IPv6...');
					// Se IPv4 falhar, tentar IPv6 sempre
					const ipv6s = await dns.resolve6(attrIP);
					console.log('[TRACEROUTE DEBUG] IPv6 resolvido:', ipv6s);
					resolvedIPs = ipv6s;
					targetIP = ipv6s[0];
					ipVersion = 6;
				}
			} catch (err) {
				console.log('[TRACEROUTE DEBUG] Erro na resolução DNS:', err.message);
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
			console.log('[TRACEROUTE DEBUG] IP direto fornecido:', attrIP);
			const is6 = net.isIPv6(attrIP);
			ipVersion = is6 ? 6 : 4;
			console.log('[TRACEROUTE DEBUG] Versão IP detectada:', ipVersion);
		}
		
		console.log('[TRACEROUTE DEBUG] Iniciando traceroute para IP:', targetIP, 'versão:', ipVersion);
		
		// Executar traceroute
		const result = await performTraceroute(targetIP, maxHops, TRACEROUTE_TIMEOUT);
		console.log('[TRACEROUTE DEBUG] Traceroute concluído:', result.totalHops, 'hops');

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
			console.log('[TRACEROUTE DEBUG] ERRO CRÍTICO:', error.message);
			console.log('[TRACEROUTE DEBUG] Stack trace:', error.stack);
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
