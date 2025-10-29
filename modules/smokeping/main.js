import { promises as dns } from 'dns';
import net from 'net';
import pingus from 'pingus';
import { optionalAuthMiddleware } from '../../auth.js';
import { recordApiRequest } from '../../metrics.js';

// Constantes
const PING_TIMEOUT = 1000;      // ms
const DNS_CACHE_TTL = 60_000;   // ms
const DEFAULT_PING_COUNT = 20;  // Número padrão de pings para o smokeping
const MAX_PING_COUNT = 100;     // Máximo de pings permitidos

// Cache DNS (somente sucessos)
const dnsCache = new Map(); // host -> { ips:[], version:4|6, expires }

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

// Pingus ICMP wrapper com suporte a TTL
async function pingWithTTL(target, ttl, sID) {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const isIPv6 = net.isIPv6(target);
		
		const options = {
			host: target,
			ttl: ttl,
			timeout: PING_TIMEOUT,
			resolveDNS: false
		};
		
		const ping = new pingus.PingICMP(options);
		let finished = false;
		
		const finish = (result) => {
			if (!finished) {
				finished = true;
				resolve(result);
			}
		};
		
		ping.on('result', (result) => {
			const data = result.toPrimitiveJSON();
			const rtt = Date.now() - startTime;
			
			if (data.status === 'alive' || data.status === 'reply') {
				finish({
					alive: true,
					time: data.time || rtt,
					target: data.ip || target
				});
			} else if (data.status === 'exception' && data.reply) {
				const hopIP = data.reply.source;
				
				// Verificar se é Echo Reply disfarçado de exception
				if ((isIPv6 && data.reply.type === 129) || (!isIPv6 && data.reply.type === 0)) {
					finish({
						alive: true,
						time: data.time || rtt,
						target: hopIP || target
					});
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
					});
				}
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
				});
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
			
			finish({
				alive: false,
				time: rtt,
				error: errorMsg,
				hopIP: hopIP
			});
		});
		
		setTimeout(() => {
			finish({
				alive: false,
				error: 'timeout'
			});
		}, PING_TIMEOUT + 200);
		
		try {
			ping.send();
		} catch (error) {
			finish({
				alive: false,
				error: error.message || 'send failed'
			});
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
async function smokepingTest(target, ttl, sID, count = DEFAULT_PING_COUNT) {
	const results = [];
	
	for (let i = 0; i < count; i++) {
		try {
			const result = await pingWithTTL(target, ttl, sID + i);
			if (result.alive) {
				results.push(result.time);
			} else {
				results.push(-1); // Pacote perdido
			}
		} catch (error) {
			results.push(-1); // Erro = pacote perdido
		}
		
		// Pequeno delay entre pings para evitar sobrecarga
		if (i < count - 1) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}
	
	return results;
}

// Função para processar resultados e calcular estatísticas
function processSmokepingResults(rawResults, target, ttl, count) {
	const validResults = rawResults.filter(ms => ms > 0);
	const lostPackets = rawResults.filter(ms => ms === -1).length;
	const lossPct = (lostPackets / rawResults.length) * 100;
	
	if (validResults.length === 0) {
		return {
			target,
			ttl,
			count,
			timestamp: new Date().toISOString(),
			min_ms: null,
			median_ms: null,
			max_ms: null,
			loss_pct: 100.0,
			raw_results: rawResults
		};
	}
	
	// Ordenar para calcular mediana
	const sorted = [...validResults].sort((a, b) => a - b);
	const min_ms = Math.round(sorted[0] * 10) / 10;
	const max_ms = Math.round(sorted[sorted.length - 1] * 10) / 10;
	
	// Calcular mediana
	let median_ms;
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		median_ms = (sorted[middle - 1] + sorted[middle]) / 2;
	} else {
		median_ms = sorted[middle];
	}
	median_ms = Math.round(median_ms * 10) / 10;
	
	return {
		target,
		ttl,
		count,
		timestamp: new Date().toISOString(),
		min_ms,
		median_ms,
		max_ms,
		loss_pct: Math.round(lossPct * 10) / 10,
		raw_results: rawResults
	};
}

export const smokeping = {
	route: '/smokeping/:id/:ttl?/:count?',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request) => {
		const startTime = Date.now();
		let ttl = ttlNormalize(parseInt(String(request.params.ttl || '')));
		const input = String(request.params.id || '');
		
		// Validar e normalizar count
		let count = parseInt(String(request.params.count || '')) || DEFAULT_PING_COUNT;
		if (count < 1) count = 1;
		if (count > MAX_PING_COUNT) count = MAX_PING_COUNT;
		
		const sID = (global.sID >= 65535) ? 0 : (global.sID + 1 || 0); global.sID = sID;
		
		try {
			const dnsStartTime = Date.now();
			const res = await resolveHost(input);
			const dnsEndTime = Date.now();
			
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
			
			// Executar smokeping com count especificado
			const rawResults = await smokepingTest(target, ttl, sID, count);
			
			// Processar resultados estatísticos
			const smokepingResults = processSmokepingResults(rawResults, target, ttl, count);
			
			const overallStatus = smokepingResults.loss_pct < 100 ? 'success' : 'failure';
			recordApiRequest('smokeping', '/smokeping', Date.now() - startTime, overallStatus);
			
			return {
				...smokepingResults,
				sID,
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
				query: request.query || {} 
			};
		}
	}
};
