import { promises as dns } from 'dns';
import net from 'net';
import netPing from 'net-ping';
import { execFile } from 'child_process';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração específica do módulo TRACEROUTE
const TRACEROUTE_TIMEOUT = 500; // 500ms por hop (net-ping)
const MAX_CONSECUTIVE_TIMEOUTS = 5; // Parar após 5 timeouts consecutivos
const FALLBACK_CMD_TIMEOUT_MS = 8000; // Timeout total para fallback externo
const FALLBACK_ENABLED = true; // Pode futuramente virar env

function debugLog(...args) {
	// Centraliza logs para poder desligar fácil depois
	console.log('[TRACEROUTE DEBUG]', ...args);
}

async function fallbackSystemTraceroute(targetIP, ipVersion, maxHops) {
	// Usa comando do sistema para tentar obter hops (melhor para IPv6)
	// Preferir traceroute -n (sem reverse DNS) para performance
	return new Promise((resolve) => {
		if (process.platform !== 'linux') {
			return resolve({ success: false, reason: 'platform_not_linux' });
		}

		const args = [];
		// -n: não faz reverse DNS, -w 1: timeout resposta, -q 1: 1 probe, -m maxHops
		if (ipVersion === 6) args.push('-6');
		args.push('-n', '-w', '1', '-q', '1', '-m', String(maxHops), targetIP);

		debugLog('Executando fallback traceroute externo:', 'traceroute', args.join(' '));

		const child = execFile('traceroute', args, { timeout: FALLBACK_CMD_TIMEOUT_MS }, (err, stdout, stderr) => {
			if (err) {
				debugLog('Fallback traceroute erro:', err.message);
				return resolve({ success: false, error: err.message, stderr });
			}
			try {
				const lines = stdout.split('\n').slice(1); // pula cabeçalho
				const hops = [];
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					const hopMatch = /^\s*(\d+)\s+(.+)$/.exec(line);
					if (!hopMatch) continue;
					const hopNum = parseInt(hopMatch[1]);
					// Identificar se timeout total (linha cheia de * )
					if (trimmed.includes('* * *') || /^\d+\s+\* /.test(trimmed)) {
						hops.push({ hop: hopNum, ip: null, hostname: null, responseTime: null, status: 'timeout' });
						continue;
					}
					// Extrair primeiro token IP
					const parts = hopMatch[2].split(/\s+/);
					let ip = null;
					for (const p of parts) {
						if (/^[0-9a-fA-F:.]+$/.test(p) && p !== 'ms') { ip = p; break; }
					}
					// Extrair tempo (primeiro número antes de ms)
					let ms = null;
					const timeMatch = /([0-9]+(?:\.[0-9]+)?)\s*ms/.exec(line);
					if (timeMatch) ms = parseFloat(timeMatch[1]);
					hops.push({ hop: hopNum, ip: ip, hostname: ip, responseTime: ms, status: ip ? 'reply' : 'timeout' });
				}
				if (!hops.length) {
					return resolve({ success: false, error: 'empty_output' });
				}
				const reachedDestination = hops.some(h => h.ip === targetIP);
				resolve({
					success: true,
					hops,
					reachedDestination,
					totalHops: hops.length
				});
			} catch (parseErr) {
				resolve({ success: false, error: 'parse_error: ' + parseErr.message });
			}
		});
		// Segurança: se processo travar
		child.on('error', (procErr) => {
			debugLog('Erro ao spawn fallback traceroute:', procErr.message);
			resolve({ success: false, error: procErr.message });
		});
	});
}

// Função auxiliar trim
const trim = (s) => {
	if (typeof s !== 'string') return '';
	return s.trim();
};

// Função para fazer traceroute usando net-ping
async function performTraceroute(targetIP, maxHops = 30, timeout = TRACEROUTE_TIMEOUT) {
	debugLog('performTraceroute iniciado - IP:', targetIP, 'maxHops:', maxHops, 'timeout:', timeout);
	const hops = [];
	let reachedDestination = false;
	let timeouts = 0;
	let consecutiveTimeouts = 0; // Contador para timeouts consecutivos
	const isIPv6 = net.isIPv6(targetIP);
	debugLog('É IPv6:', isIPv6);
	
	for (let ttl = 1; ttl <= maxHops; ttl++) {
		debugLog('Hop', ttl, 'de', maxHops);
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
					debugLog('Erro ao configurar protocolo:', protocolError.message);
				}
				
				const session = netPing.createSession(sessionOptions);

				const hopResult = await new Promise((resolve) => {
					const startTime = Date.now();
					
					session.pingHost(targetIP, (error, target, sent, rcvd) => {
						const responseTime = Date.now() - startTime;
						session.close();
						
						if (error) {
							debugLog('Erro raw hop:', { code: error.code, message: error.message, source: error.source });
							// Se a lib retornar source, tratamos como hop intermediário (ICMP Time Exceeded)
							if (error.source) {
								resolve({
									success: false,
									type: 'intermediate',
									responseTime: responseTime,
									ip: error.source,
									rawError: error.code || 'ICMP'
								});
							} else if (error.code === 'RequestTimedOut' || responseTime >= timeout) {
								resolve({
									success: false,
									type: 'timeout',
									responseTime: null,
									ip: null,
									rawError: error.code || null
								});
							} else {
								resolve({
									success: false,
									type: 'no_reply',
									responseTime: null,
									ip: null,
									rawError: error.code || null
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
			} else if (bestAttempt.type === 'intermediate' && bestAttempt.ip) {
				finalResult = {
					hop: ttl,
					ip: bestAttempt.ip,
					hostname: bestAttempt.ip,
					responseTime: bestAttempt.responseTime,
					status: 'intermediate'
				};
				consecutiveTimeouts = 0;
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
				debugLog('Destino alcançado, parando');
				break;
			}
			
			// Se muitos timeouts consecutivos, parar para economizar tempo
			if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
				debugLog('Muitos timeouts consecutivos (', consecutiveTimeouts, '), parando traceroute');
				break;
			}
			
		} catch (sessionError) {
			debugLog('Erro na sessão:', sessionError.message);
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
			debugLog('Muitos timeouts consecutivos após erro, parando traceroute');
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
		
		// Executar traceroute (net-ping)
		const result = await performTraceroute(targetIP, maxHops, TRACEROUTE_TIMEOUT);
		debugLog('Traceroute (net-ping) concluído:', result.totalHops, 'hops');

		let finalResult = result;
		let usedFallback = false;
		if (FALLBACK_ENABLED) {
			const onlyTimeouts = result.hops.length > 0 && result.hops.every(h => !h.ip);
			if (onlyTimeouts) {
				debugLog('Todos hops timeout ou sem IP -> tentando fallback system traceroute');
				try {
					const fallback = await fallbackSystemTraceroute(targetIP, ipVersion, Math.min(maxHops, 20));
					if (fallback.success && fallback.hops.some(h => h.ip)) {
						debugLog('Fallback system traceroute obteve', fallback.hops.length, 'hops');
						finalResult = {
							hops: fallback.hops,
							reachedDestination: fallback.reachedDestination,
							totalHops: fallback.totalHops,
							timeouts: fallback.hops.filter(h => !h.ip).length
						};
						usedFallback = true;
					} else {
						debugLog('Fallback falhou ou sem hops úteis:', fallback.error || fallback.reason);
					}
				} catch (fbErr) {
					debugLog('Erro no fallback system traceroute:', fbErr.message);
				}
			}
		}

		return {
				"timestamp": Date.now(),
				"target": attrIP,
				"targetIP": targetIP,
				"resolvedIPs": resolvedIPs,
				"maxHops": maxHops,
				"totalHops": finalResult.totalHops,
				"reachedDestination": finalResult.reachedDestination,
				"timeouts": finalResult.timeouts,
				"hops": finalResult.hops,
				"fallbackUsed": usedFallback,
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
