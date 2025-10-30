import { promises as dns } from 'dns';
import net from 'net';
import pingus from 'pingus';
import raw from 'raw-socket';
import { optionalAuthMiddleware } from '../../auth.js';
import { recordApiRequest } from '../../metrics.js';

// Constantes
const PING_TIMEOUT = 1000;      		// ms (padrão; pode ser sobrescrito por query ?timeout=ms)
const DNS_CACHE_TTL = 60_000;   		// ms
const DEFAULT_PING_COUNT = 20;  		// Número padrão de pings para o smokeping
const MAX_PING_COUNT = 100;      		// Máximo de pings permitidos
// Intervalo mínimo entre pings para garantir fechamento do socket e evitar captura de replies pelo socket anterior
// Mantemos pequeno para não alongar muito a duração total, mas suficiente para dar tempo ao 'close' do pingus.
const INTERVAL_BETWEEN_PINGS = 100; 	// ms

// Cache DNS (somente sucessos)
const dnsCache = new Map(); // host -> { ips:[], version:4|6, expires }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Logger de debug condicional (ativado com SHOW_REQUEST_LOGS)
const DBG_ENABLED = !!process.env.SHOW_REQUEST_LOGS;
// Não logar casos de sucesso por padrão; para reativar, defina SHOW_SUCCESS_LOGS=true
const LOG_SUCCESS = !!process.env.SHOW_SUCCESS_LOGS;
const dbg = (...args) => { if (DBG_ENABLED) console.log('[smokeping]', ...args); };

function ttlNormalize(v) {
	if (isNaN(v)) return 128;
	if (v < 1) return 1;
	if (v > 255) return 255;
	return v;
}

function getCached(host) {
	const e = dnsCache.get(host);
	if (!e) return null;
	if (Date.now() > e.expires) { dnsCache.delete(host); return null; }
	return e;
}

async function resolveHost(host) {
	if (net.isIP(host)) return { ips: [host], version: net.isIPv6(host) ? 6 : 4 };
	const c = getCached(host); if (c) return c;
	try {
		const v4 = await dns.resolve4(host);
		if (v4?.length) { const e = { ips: v4, version: 4, expires: Date.now() + DNS_CACHE_TTL }; dnsCache.set(host, e); return e; }
	} catch (_) {}
	try {
		const v6 = await dns.resolve6(host);
		if (v6?.length) { const e = { ips: v6, version: 6, expires: Date.now() + DNS_CACHE_TTL }; dnsCache.set(host, e); return e; }
	} catch (_) {}
	return { ips: [], version: 0, error: 'host not found' };
}

// Utilitário para fechar/limpar o objeto do ping de forma segura (diferenças entre versões do pingus)
function safeClosePing(p) {
	try {
		if (!p) return;
		if (typeof p.removeAllListeners === 'function') p.removeAllListeners();
		if (typeof p.close === 'function') { dbg('safeClose: close()'); p.close(); }
		else if (typeof p.stop === 'function') { dbg('safeClose: stop()'); p.stop(); }
		else if (typeof p.destroy === 'function') { dbg('safeClose: destroy()'); p.destroy(); }
	} catch (_) { /* noop */ }
}

// --------------------------------------------------
// ICMP utilitários (raw-socket)
// --------------------------------------------------
function icmpChecksum(buf) {
	let sum = 0;
	for (let i = 0; i < buf.length; i += 2) {
		sum += buf.readUInt16BE(i);
		while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
	}
	return (~sum) & 0xffff;
}

const DEFAULT_ECHO_PAYLOAD = 32; // bytes

function buildIcmpEchoPacket(isIPv6, identifier, seq) {
	const type = isIPv6 ? 128 : 8; // Echo Request
	const buf = Buffer.alloc(8 + DEFAULT_ECHO_PAYLOAD, 0x61);
	buf.writeUInt8(type, 0);
	buf.writeUInt8(0, 1); // code
	buf.writeUInt16BE(0, 2); // checksum placeholder
	buf.writeUInt16BE(identifier & 0xffff, 4);
	buf.writeUInt16BE(seq & 0xffff, 6);
	buf.writeUInt16BE(icmpChecksum(buf), 2);
	return buf;
}

function parseIcmpEchoReply(isIPv6, packet) {
	try {
		if (isIPv6) {
			if (packet.length < 8) return null;
			const type = packet[0];
			const code = packet[1];
			const id = packet.readUInt16BE(4);
			const seq = packet.readUInt16BE(6);
			return { type, code, id, seq };
		} else {
			if (packet.length < 28) return null; // IPv4 header + ICMP
			const ihl = (packet[0] & 0x0f) * 4;
			if (packet.length < ihl + 8) return null;
			const type = packet[ihl];
			const code = packet[ihl + 1];
			const id = packet.readUInt16BE(ihl + 4);
			const seq = packet.readUInt16BE(ihl + 6);
			return { type, code, id, seq };
		}
	} catch (_) { return null; }
}

async function sendRawEchoAndWait(socket, isIPv6, target, identifier, seq, timeoutMs) {
	return new Promise((resolve) => {
		const start = Date.now();
		let finished = false;

		const finish = (res, reason) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			try {
				if (typeof socket.off === 'function') {
					socket.off('message', onMessage);
					socket.off('error', onError);
				} else if (typeof socket.removeListener === 'function') {
					socket.removeListener('message', onMessage);
					socket.removeListener('error', onError);
				}
			} catch (_) { /* noop */ }
			if (!res?.alive || LOG_SUCCESS) {
				dbg('finish(', reason || 'unknown', '):', { sequence: seq, ttl: undefined, target, alive: !!res?.alive, error: res?.error, hopIP: res?.hopIP, time: res?.time });
			}
			resolve(res);
		};

		const onMessage = (buf, src) => {
			// Ignorar se não veio do target (evita NA, etc.)
			if (src !== target) return;
			const parsed = parseIcmpEchoReply(isIPv6, buf);
			if (!parsed) return;
			const isReply = (isIPv6 && parsed.type === 129) || (!isIPv6 && parsed.type === 0);
			if (!isReply) return; // ignorar outros tipos
			if (parsed.id !== (identifier & 0xffff) || parsed.seq !== (seq & 0xffff)) return; // não é nossa resposta
			const rtt = Date.now() - start;
			finish({ alive: true, time: rtt, target }, 'alive');
		};

		const onError = (err) => {
			const rtt = Date.now() - start;
			let errorMsg = err?.message || 'unknown error';
			if (/operation not permitted/i.test(errorMsg)) errorMsg = 'raw socket permission denied (need CAP_NET_RAW)';
			dbg('event:error', { errorMsg, rtt });
			finish({ alive: false, time: rtt, error: errorMsg, hopIP: null }, 'error-event');
		};

		if (typeof socket.on === 'function') {
			socket.on('message', onMessage);
			socket.on('error', onError);
		}

		const timer = setTimeout(() => finish({ alive: false, hopIP: null, error: 'timeout' }, 'guard-timeout'), timeoutMs + 50);

		try {
			const echo = buildIcmpEchoPacket(isIPv6, identifier, seq);
			if (LOG_SUCCESS) dbg('send()', { target, seq, timeoutMs, id: identifier & 0xffff });
			socket.send(echo, 0, echo.length, target, (err) => {
				if (err) onError(err);
			});
		} catch (error) {
			dbg('send() throw', { message: error.message });
			finish({ alive: false, error: error.message || 'send failed' }, 'send-throw');
		}
	});
}

// Envia um único ping usando uma instância já criada (serial), com listeners one-shot
async function pingOnceSerial(pinger, target, ttl, sequence, timeoutMs) {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const isIPv6 = net.isIPv6(target);
		let finished = false;

		const finish = (result, reason) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			try {
				// Limpar listeners dessa iteração
				if (typeof pinger.off === 'function') {
					pinger.off('result', onResult);
					pinger.off('error', onError);
				} else if (typeof pinger.removeListener === 'function') {
					pinger.removeListener('result', onResult);
					pinger.removeListener('error', onError);
				}
			} catch (_) { /* noop */ }
			if (!result?.alive || LOG_SUCCESS) {
				dbg('finish(', reason || 'unknown', '):', { sequence, ttl, target, alive: !!result?.alive, error: result?.error, hopIP: result?.hopIP, time: result?.time });
			}
			resolve({ ...result, sequence });
		};

		const onResult = (result) => {
			const data = result.toPrimitiveJSON();
			const rtt = Date.now() - startTime;

			const isEchoReply = (data?.status === 'reply' || data?.status === 'alive');
			const isExceptionEchoReply = (data?.status === 'exception' && data?.reply && ((isIPv6 && data.reply.type === 129) || (!isIPv6 && data.reply.type === 0)));
			const isSuccess = isEchoReply || isExceptionEchoReply;
			if (!isSuccess || LOG_SUCCESS) {
				dbg('event:result', {
					status: data?.status,
					replyType: data?.reply?.type,
					replyCode: data?.reply?.code,
					replySource: data?.reply?.source,
					ip: data?.ip,
					dataTime: data?.time,
					rtt
				});
			}

			if (data.status === 'alive' || data.status === 'reply') {
				finish({ alive: true, time: rtt, target: data.ip || target }, 'alive');
			} else if (data.status === 'exception' && data.reply) {
				const hopIP = data.reply.source;
				if ((isIPv6 && data.reply.type === 129) || (!isIPv6 && data.reply.type === 0)) {
					finish({ alive: true, time: rtt, target: hopIP || target }, 'exception-echo-reply');
				} else {
					let errorType = 'timeout';
					if (isIPv6) {
						if (data.reply.type === 3) errorType = 'ttlExpired';
						else if (data.reply.type === 1) errorType = (ttl < 64 && hopIP && hopIP !== target) ? 'ttlExpired' : 'unreachable';
					} else {
						if (data.reply.type === 11) errorType = 'ttlExpired';
						else if (data.reply.type === 3) errorType = 'unreachable';
					}
					if (ttl < 64 && hopIP && hopIP !== target && errorType === 'timeout') errorType = 'ttlExpired';

					// Somente finalizar se for um erro definitivo (ttlExpired/unreachable).
					// Para outras mensagens ICMP (ex.: ICMPv6 NA type 136), continuar aguardando até timeout.
					if (errorType === 'ttlExpired' || errorType === 'unreachable') {
						finish({ alive: false, time: data.time || rtt, error: errorType, hopIP }, 'exception');
					} else {
						dbg('event:spurious-icmp', {
							type: data?.reply?.type,
							code: data?.reply?.code,
							source: hopIP,
							note: 'ignored; waiting for echo-reply until timeout'
						});
						// não finaliza aqui; segue aguardando
					}
				}
			} else if (data.status === 'timeout') {
				finish({ alive: false, time: rtt, error: 'timeout', hopIP: null }, 'timeout-event');
			} else {
				let hopIP = null;
				if (data.reply && data.reply.source) hopIP = data.reply.source;
				else if (data.ip && data.ip !== target) hopIP = data.ip;
				finish({ alive: false, time: rtt, error: data.status || 'timeout', hopIP }, 'other-status');
			}
		};

		const onError = (err, result) => {
			const rtt = Date.now() - startTime;
			let errorMsg = err.message || 'unknown error';
			if (/operation not permitted/i.test(errorMsg)) errorMsg = 'raw socket permission denied (need CAP_NET_RAW)';
			let hopIP = null;
			if (result && result.toPrimitiveJSON) {
				const errData = result.toPrimitiveJSON();
				if (errData.reply && errData.reply.source) hopIP = errData.reply.source;
			}
			dbg('event:error', { errorMsg, hopIP, rtt });
			finish({ alive: false, time: rtt, error: errorMsg, hopIP }, 'error-event');
		};

		if (typeof pinger.on === 'function') {
			pinger.on('result', onResult);
			pinger.on('error', onError);
		}

		const timer = setTimeout(() => {
			finish({ alive: false, hopIP: null, error: 'timeout' }, 'guard-timeout');
		}, timeoutMs + 200);

		try {
			if (LOG_SUCCESS) dbg('send()', { target, ttl, sequence, timeoutMs });
			pinger.send();
		} catch (error) {
			dbg('send() throw', { message: error.message });
			finish({ alive: false, error: error.message || 'send failed' }, 'send-throw');
		}
	});
}

// Pingus ICMP wrapper com suporte a TTL
async function pingWithTTL(target, ttl, sequence, timeoutMs = PING_TIMEOUT) {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const isIPv6 = net.isIPv6(target);
		
		const options = {
			host: target,
			ttl: ttl,
			timeout: timeoutMs,
			resolveDNS: false
		};
		
		const ping = new pingus.PingICMP(options);
		let finished = false;
        
		// Encapsula término + limpeza de recursos
		const finish = (result, reason) => {
			if (finished) return;
			finished = true;
			try {
				if (!result?.alive || LOG_SUCCESS) {
					dbg('finish(', reason || 'unknown', '):', { sequence, ttl, target, alive: !!result?.alive, error: result?.error, hopIP: result?.hopIP, time: result?.time });
				}
				safeClosePing(ping);
			} finally {
				resolve({
					...result,
					sequence
				});
			}
		};
		
	ping.on('result', (result) => {
		const data = result.toPrimitiveJSON();
		const rtt = Date.now() - startTime;
		const isEchoReply = (data?.status === 'reply' || data?.status === 'alive');
		const isExceptionEchoReply = (data?.status === 'exception' && data?.reply && ((isIPv6 && data.reply.type === 129) || (!isIPv6 && data.reply.type === 0)));
		const isSuccess = isEchoReply || isExceptionEchoReply;
		if (!isSuccess || LOG_SUCCESS) {
			dbg('event:result', {
				status: data?.status,
				replyType: data?.reply?.type,
				replyCode: data?.reply?.code,
				replySource: data?.reply?.source,
				ip: data?.ip,
				dataTime: data?.time,
				rtt
			});
		}
		
		if (data.status === 'alive' || data.status === 'reply') {
			finish({
				alive: true,
				time: rtt, // Usar RTT calculado manualmente, não data.time
				target: data.ip || target
			}, 'alive');
		} else if (data.status === 'exception' && data.reply) {
			const hopIP = data.reply.source;
			
			// Verificar se é Echo Reply disfarçado de exception
			if ((isIPv6 && data.reply.type === 129) || (!isIPv6 && data.reply.type === 0)) {
				finish({
					alive: true,
					time: rtt, // Usar RTT calculado manualmente
					target: hopIP || target
				}, 'exception-echo-reply');
			} else {
				let errorType = 'timeout';
				
				if (isIPv6) {
					if (data.reply.type === 3) {
						errorType = 'ttlExpired';
					} else if (data.reply.type === 1) {
						errorType = (ttl < 64 && hopIP && hopIP !== target) ? 'ttlExpired' : 'unreachable';
					}
				} else {
					if (data.reply.type === 11) {
						errorType = 'ttlExpired';
					} else if (data.reply.type === 3) {
						errorType = 'unreachable';
					}
				}
				
				if (ttl < 64 && hopIP && hopIP !== target && errorType === 'timeout') {
					errorType = 'ttlExpired';
				}
				
				finish({
					alive: false,
					time: data.time || rtt,
					error: errorType,
					hopIP: hopIP
				}, 'exception');
			}
		} else if (data.status === 'timeout') {
			// Timeout do pingus - considerar como pacote perdido legítimo
			finish({
				alive: false,
				time: rtt,
				error: 'timeout',
				hopIP: null
			}, 'timeout-event');
		} else {
			let hopIP = null;
			if (data.reply && data.reply.source) {
				hopIP = data.reply.source;
			} else if (data.ip && data.ip !== target) {
				hopIP = data.ip;
			}
			
			finish({
				alive: false,
				time: rtt,
				error: data.status || 'timeout',
				hopIP: hopIP
			}, 'other-status');
		}
	});
	
	ping.on('error', (err, result) => {
		const rtt = Date.now() - startTime;
		let errorMsg = err.message || 'unknown error';
		
		if (/operation not permitted/i.test(errorMsg)) {
			errorMsg = 'raw socket permission denied (need CAP_NET_RAW)';
		}
		
		let hopIP = null;
		if (result && result.toPrimitiveJSON) {
			const errData = result.toPrimitiveJSON();
			if (errData.reply && errData.reply.source) {
				hopIP = errData.reply.source;
			}
		}
		
		dbg('event:error', { errorMsg, hopIP, rtt });
		finish({
			alive: false,
			time: rtt,
			error: errorMsg,
			hopIP: hopIP
		}, 'error-event');
	});
	
	setTimeout(() => {
		finish({
			alive: false,
			hopIP: null,
			error: 'timeout'
		}, 'guard-timeout');
	}, timeoutMs + 200); // margem pequena, já que forçamos o close
		
		try {
			if (LOG_SUCCESS) dbg('send()', { target, ttl, sequence, timeoutMs });
			ping.send();
		} catch (error) {
			dbg('send() throw', { message: error.message });
			finish({
				alive: false,
				error: error.message || 'send failed'
			}, 'send-throw');
		}
	});
}

function buildError(result) {
	if (result.alive) return null;
	if (result.error === 'ttlExpired') return { name: 'TimeExceededError', message: `Time exceeded (source=${result.hopIP})`, source: result.hopIP };
	if (result.error === 'unreachable') return { name: 'DestinationUnreachableError', message: `Destination unreachable (source=${result.hopIP})`, source: result.hopIP };
	return { name: 'RequestTimedOutError', message: result.error || 'timeout' };
}

// Função para executar múltiplos pings (smokeping)
async function smokepingTest(target, ttl, sID, count = DEFAULT_PING_COUNT, timeoutMs = PING_TIMEOUT) {
	const latencies = [];
	dbg('smokepingTest:start', { target, ttl, count, sID, intervalMs: INTERVAL_BETWEEN_PINGS, timeoutMs, mode: 'single-socket' });

	// Criar um único socket ICMP (raw-socket) para todo o lote, com TTL fixo
	const isIPv6 = net.isIPv6(target);
	const family = isIPv6 ? raw.AddressFamily.IPv6 : raw.AddressFamily.IPv4;
	const protocol = isIPv6 ? raw.Protocol.ICMPv6 : raw.Protocol.ICMP;
	const identifier = (sID & 0xffff);
	let pinger;
	try {
		pinger = raw.createSocket({ addressFamily: family, protocol });
		try {
			if (isIPv6) pinger.setOption(raw.SocketLevel.IPPROTO_IPV6, raw.SocketOption.IPV6_UNICAST_HOPS, ttl);
			else pinger.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, ttl);
		} catch (optErr) { dbg('setOption failed', optErr?.message); }
	} catch (sockErr) {
		dbg('raw socket create failed', sockErr?.message);
		return Array(count).fill(-1);
	}
	try {
		for (let i = 0; i < count; i++) {
			const sequence = sID + i;
			const iterStart = Date.now();
			if (LOG_SUCCESS) dbg('iter:start', { i, sequence });

			try {
				const result = await sendRawEchoAndWait(pinger, isIPv6, target, identifier, sequence & 0xffff, timeoutMs);
				if (result?.alive && typeof result.time === 'number' && Number.isFinite(result.time)) {
					latencies.push(result.time);
					if (LOG_SUCCESS) dbg('iter:alive', { i, sequence, time: result.time });
				} else {
					latencies.push(-1);
					dbg('iter:lost', { i, sequence, error: result?.error, hopIP: result?.hopIP });
				}
			} catch (error) {
				latencies.push(-1);
				dbg('iter:exception', { i, sequence, message: error?.message });
			}

			// Pausa mínima entre envios (aqui apenas para dar respiro de CPU/event loop)
			if (i < count - 1) {
				const spent = Date.now() - iterStart;
				const waitMs = Math.max(0, INTERVAL_BETWEEN_PINGS - spent);
				if (LOG_SUCCESS) dbg('iter:sleep', { i, sequence, spentMs: spent, waitMs });
				await sleep(waitMs || INTERVAL_BETWEEN_PINGS);
			}
		}
	} finally {
		// Fechar o socket ao final do lote
		try { pinger && pinger.close && pinger.close(); } catch (_) { /* noop */ }
	}

	dbg('smokepingTest:end', { target, ttl, count, lost: latencies.filter(v=>v===-1).length, timeoutMs, mode: 'single-socket' });
	return latencies;
}
// Função para processar resultados e calcular estatísticas
function processSmokepingResults(rawResults, target, ttl, count) {
	const validResults = rawResults.filter(ms => ms > 0);
	const lostPackets = rawResults.filter(ms => ms === -1).length;
	dbg('process:raw', { sent: rawResults.length, received: validResults.length, lost: lostPackets });
	
	if (validResults.length === 0) {
		return {
			target,
			ttl,
			sent: rawResults.length,
			received: 0,
			timestamp: new Date().toISOString(),
			min_ms: null,
			median_ms: null,
			max_ms: null,
			loss_pct: 100.0,
			raw_results: rawResults
		};
	}
	
	// Ordenar para calcular mediana preliminar
	const sorted = [...validResults].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const prelimMedian = sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
	
	// Filtro estatístico: remover valores que são < 20% da mediana
	// Isso elimina respostas ICMP antigas capturadas incorretamente
	const threshold = prelimMedian * 0.2;
	const filteredResults = validResults.filter(ms => ms >= threshold);
	dbg('process:filter', { prelimMedian, threshold, removed: validResults.length - filteredResults.length });
	
	// Se removeu muitos valores, usar os originais (evitar filtro excessivo)
	const finalResults = filteredResults.length >= (validResults.length * 0.5)
		? filteredResults
		: validResults;
	
	const sortedFinal = [...finalResults].sort((a, b) => a - b);
	const min_ms = Math.round(sortedFinal[0] * 10) / 10;
	const max_ms = Math.round(sortedFinal[sortedFinal.length - 1] * 10) / 10;
	
	// Calcular mediana final
	const middleFinal = Math.floor(sortedFinal.length / 2);
	let median_ms;
	if (sortedFinal.length % 2 === 0) {
		median_ms = (sortedFinal[middleFinal - 1] + sortedFinal[middleFinal]) / 2;
	} else {
		median_ms = sortedFinal[middleFinal];
	}
	median_ms = Math.round(median_ms * 10) / 10;
	
	const totalLost = lostPackets + (validResults.length - finalResults.length);
	const lossPct = (totalLost / rawResults.length) * 100;
	dbg('process:final', { min_ms, median_ms, max_ms, totalLost, lossPct: Math.round(lossPct * 10) / 10 });
	
	return {
		target,
		ttl,
		sent: rawResults.length,
		received: finalResults.length,
		timestamp: new Date().toISOString(),
		min_ms,
		median_ms,
		max_ms,
		loss_pct: Math.round(lossPct * 10) / 10,
		raw_results: rawResults
	};
}

export const smokeping = {
	route: '/smokeping/:id',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request) => {
		const startTime = Date.now();
			dbg('handler:start', { params: request.params, query: request.query });
		
	// Pegar parâmetros da query string ao invés da rota
		let ttl = ttlNormalize(parseInt(String(request.query.ttl || '')) || 128);
		const input = String(request.params.id || '');
		
		// Validar e normalizar count
		let count = parseInt(String(request.query.count || '')) || DEFAULT_PING_COUNT;
		if (count < 1) count = 1;
		if (count > MAX_PING_COUNT) count = MAX_PING_COUNT;

	// Timeout opcional por requisição (?timeout=ms)
	let timeoutMs = parseInt(String(request.query.timeout || ''));
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = PING_TIMEOUT;
	if (timeoutMs < 200) timeoutMs = 200; // limite inferior razoável
	if (timeoutMs > 5000) timeoutMs = 5000; // limite superior de segurança
		
		const sID = (global.sID >= 65535) ? 0 : (global.sID + 1 || 0); global.sID = sID;
		
		try {
			const dnsStartTime = Date.now();
			const res = await resolveHost(input);
			const dnsEndTime = Date.now();
			dbg('dns:resolution', { input, durationMs: dnsEndTime - dnsStartTime, version: res.version, ips: res.ips, error: res.error });
			
			if (res.error) {
				const errName = res.error === 'ipv6-only (disabled)' ? 'IPv6NotSupportedError' : 'HostNotFoundError';
				const errMsg = res.error === 'ipv6-only (disabled)' ? 'IPv6 not supported on this probe' : res.error;
				
				recordApiRequest('smokeping', '/smokeping', Date.now() - startTime, 'failure');
				
				return { 
					target: input, 
					ttl,
					count, 
					timestamp: new Date().toISOString(),
					min_ms: null,
					median_ms: null,
					max_ms: null,
					loss_pct: 100.0,
					err: { name: errName, message: errMsg }, 
					sID, 
					query: request.query || {} 
				};
			}
			
			const target = res.version ? res.ips[Math.floor(Math.random() * res.ips.length)] : null;
			dbg('target:selected', { target, version: res.version });
			if (!target || !net.isIP(target)) {
				recordApiRequest('smokeping', '/smokeping', Date.now() - startTime, 'failure');
				return { 
					target: target || input, 
					ttl,
					count, 
					timestamp: new Date().toISOString(),
					min_ms: null,
					median_ms: null,
					max_ms: null,
					loss_pct: 100.0,
					err: { name: 'HostNotFoundError', message: 'host not found' }, 
					sID, 
					query: request.query || {} 
				};
			}
			
			// Executar smokeping respeitando espaçamento fixo entre envios
			const rawResults = await smokepingTest(target, ttl, sID, count, timeoutMs);
			
			// Processar resultados estatísticos
			const smokepingResults = processSmokepingResults(rawResults, target, ttl, count);
			
			const overallStatus = smokepingResults.loss_pct < 100 ? 'success' : 'failure';
			recordApiRequest('smokeping', '/smokeping', Date.now() - startTime, overallStatus);
			
			dbg('handler:end', { durationMs: Date.now() - startTime, overallStatus, summary: { sent: smokepingResults.sent, received: smokepingResults.received, loss_pct: smokepingResults.loss_pct, min_ms: smokepingResults.min_ms, median_ms: smokepingResults.median_ms, max_ms: smokepingResults.max_ms } });
			return {
				...smokepingResults,
				sID,
				timeout_ms: timeoutMs,
				query: request.query || {}
			};
		} catch (e) {
			recordApiRequest('smokeping', '/smokeping', Date.now() - startTime, 'error');
			return { 
				target: input, 
				ttl,
				count, 
				timestamp: new Date().toISOString(),
				min_ms: null,
				median_ms: null,
				max_ms: null,
				loss_pct: 100.0,
				err: { name: 'InternalError', message: e.message }, 
				sID, 
				timeout_ms: timeoutMs,
				query: request.query || {} 
			};
		}
	}
};
