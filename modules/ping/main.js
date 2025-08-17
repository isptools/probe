
import { promises as dns } from 'dns';
import net from 'net';
import raw from 'raw-socket';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração específica do módulo PING
const PING_TIMEOUT = 1000; // 1 segundo para ping
const DNS_CACHE_TTL = 60000; // 60s de cache para resolução

// Cache simples em memória por worker: Map<host, { ips:[], version:4|6, expires:number }>
// Estratégia: cache APENAS resoluções positivas. Nunca cacheia negativas ou estados "ipv6-only (disabled)"
// para evitar prender estado quando IPv6 for habilitado depois do primeiro uso.
const dnsCache = new Map();

function getCachedResolution(host) {
	const entry = dnsCache.get(host);
	if (!entry) return null;
	if (Date.now() > entry.expires) {
		dnsCache.delete(host);
		return null;
	}
	return entry; // sempre positivo
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
	} catch (e4) { /* continua para tentativa IPv6 */ }

	// Tentar IPv6 sempre, independente de global.ipv6Support
	try {
		const ipv6s = await dns.resolve6(host);
		if (Array.isArray(ipv6s) && ipv6s.length) {
			const entry = { ips: ipv6s, version: 6, expires: Date.now() + DNS_CACHE_TTL };
			dnsCache.set(host, entry);
			return entry;
		}
	} catch (e6) { /* sem sucesso */ }
	
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
							"ipv6Only": true
						};
					}
					return {
						"timestamp": Date.now(),
						"target": attrIP,
						"err": resolution.error,
						"sessionID": sessionID,
						"ipVersion": 0,
						"responseTimeMs": Date.now() - startTime
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

			// Implementação de ping via raw-socket
			// Suporte atual: IPv4. Para IPv6 retornar mensagem de não suportado (pode ser estendido depois).
			if (ipVersion === 6) {
				return {
					"timestamp": Date.now(),
					"ip": resolvedIPs,
					"target": targetIP,
					"ms": null,
					"ttl": attrTTL,
					"err": 'IPv6 raw ping não suportado ainda',
					"sessionID": sessionID,
					"sID": sID,
					"ipVersion": ipVersion,
					"responseTimeMs": Date.now() - startTime
				};
			}

			const pingWithRawSocket = async (target, ttl) => {
				return new Promise((resolve) => {
					let socket;
					let finished = false;
					const startedAt = Date.now();
					const mapErr = (msg) => {
						if (!msg) return msg;
						if (/operation not permitted/i.test(msg) || /epERM/i.test(msg)) return 'raw socket permission denied (need CAP_NET_RAW)';
						return msg;
					};
					try {
						// Cria socket ICMP
						socket = raw.createSocket({ protocol: raw.Protocol.ICMP });

						// Ajusta TTL
						try {
							socket.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, ttl);
						} catch (eTTL) { /* ignora falha em setar TTL */ }

						// Constrói pacote ICMP Echo Request
						const payload = Buffer.from('ISPTOOLS');
						const icmpHeader = Buffer.alloc(8 + payload.length);
						const TYPE_ECHO = 8; // request
						const CODE = 0;
						const identifier = (process.pid + sID) & 0xFFFF; // ID para correlacionar
						const sequence = sID & 0xFFFF;

						icmpHeader.writeUInt8(TYPE_ECHO, 0);
						icmpHeader.writeUInt8(CODE, 1);
						icmpHeader.writeUInt16BE(0, 2); // checksum placeholder
						icmpHeader.writeUInt16BE(identifier, 4);
						icmpHeader.writeUInt16BE(sequence, 6);
						payload.copy(icmpHeader, 8);

						// Calcula checksum
						const checksum = raw.createChecksum(icmpHeader);
						icmpHeader.writeUInt16BE(checksum, 2);

						// Handler de resposta
						socket.on('message', (buffer, source) => {
							if (finished) return;
							// Detecta se buffer inclui cabeçalho IP
							let offset = 0;
							if (buffer.length >= 20 && (buffer[0] >> 4) === 4) {
								const ihl = buffer[0] & 0x0f;
								offset = ihl * 4;
							}
							// Tipo de resposta echo reply = 0
							const type = buffer[offset];
							const code = buffer[offset + 1];
							const rIdentifier = buffer.readUInt16BE(offset + 4);
							const rSequence = buffer.readUInt16BE(offset + 6);
							if (type === 0 && code === 0 && rIdentifier === identifier && rSequence === sequence && source === target) {
								finished = true;
								const rtt = Date.now() - startedAt;
								try { socket.close(); } catch (_) { }
								return resolve({ alive: true, time: rtt });
							}
						});

						// Trata erros
						socket.on('error', (err) => {
							if (finished) return;
							finished = true;
							try { socket.close(); } catch (_) { }
							return resolve({ alive: false, error: mapErr(err.message) });
						});

						// Envia pacote
						socket.send(icmpHeader, 0, icmpHeader.length, target, (err) => {
							if (err && !finished) {
								finished = true;
								try { socket.close(); } catch (_) { }
								return resolve({ alive: false, error: err.message });
							}
						});

						// Timeout
						setTimeout(() => {
							if (finished) return;
							finished = true;
							try { socket.close(); } catch (_) { }
							return resolve({ alive: false, error: 'timeout' });
						}, PING_TIMEOUT);

					} catch (err) {
						if (!finished) {
							finished = true;
							try { if (socket) socket.close(); } catch (_) { }
							return resolve({ alive: false, error: mapErr(err.message) });
						}
					}
				});
			};

			const result = await pingWithRawSocket(targetIP, attrTTL);

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
