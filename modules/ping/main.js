
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
			let attrTTL = request.params.ttl ? parseInt(trim(request.params.ttl)) : 128;
			if (isNaN(attrTTL)) attrTTL = 128;
			if (attrTTL < 1) attrTTL = 1; else if (attrTTL > 255) attrTTL = 255;
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
							"datetime": new Date().toString(),
							"target": attrIP,
							"ms": null,
							"ttl": attrTTL,
							"err": {
								"name": "IPv6NotSupportedError",
								"message": "IPv6 not supported on this probe"
							},
							"sID": sID,
							"query": request.query || {}
						};
					}
					return {
						"datetime": new Date().toString(),
						"target": attrIP,
						"ms": null,
						"ttl": attrTTL,
						"err": {
							"name": "HostNotFoundError",
							"message": resolution.error
						},
						"sID": sID,
						"query": request.query || {}
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
					"datetime": new Date().toString(),
					"target": targetIP || attrIP,
					"ms": null,
					"ttl": attrTTL,
					"err": {
						"name": "HostNotFoundError",
						"message": "host not found"
					},
					"sID": sID,
					"query": request.query || {}
				};
			}

			// Implementação de ping via raw-socket
			// Agora com suporte a IPv4 e IPv6 (ICMPv6) mantendo controle de TTL / Hop Limit

			// Utilidades IPv6
			const parseIPv6 = (addr) => {
				// Lida com endereços encurtados ::
				if (addr.includes('%')) addr = addr.split('%')[0]; // remove zone index
				let parts = addr.split('::');
				let head = parts[0] ? parts[0].split(':').filter(Boolean) : [];
				let tail = parts[1] ? parts[1].split(':').filter(Boolean) : [];
				if (parts.length === 1) {
					if (head.length !== 8) return null;
				} else {
					// Preenche zeros
					const fill = 8 - (head.length + tail.length);
					for (let i = 0; i < fill; i++) head.push('0');
					head = head.concat(tail);
				}
				if (head.length !== 8) return null;
				const buf = Buffer.alloc(16);
				for (let i = 0; i < 8; i++) {
					const word = parseInt(head[i], 16) & 0xFFFF;
					buf.writeUInt16BE(word, i * 2);
				}
				return buf;
			};

			const buildICMPv6Checksum = (srcBuf, dstBuf, icmpBuf) => {
				const pseudo = Buffer.alloc(40 + icmpBuf.length);
				srcBuf.copy(pseudo, 0);
				dstBuf.copy(pseudo, 16);
				pseudo.writeUInt32BE(icmpBuf.length, 32); // Upper-Layer Packet Length
				// bytes 36,37,38 = 0
				pseudo.writeUInt8(58, 39); // Next Header ICMPv6
				icmpBuf.copy(pseudo, 40);
				const sum = raw.createChecksum(pseudo);
				return sum;
			};

			// Descobrir endereço local adequado para IPv6 (para pseudo-header) usando socket UDP6
			const discoverLocalIPv6 = (dest) => new Promise((resolve) => {
				import('dgram').then(({ default: dgram }) => {
					const s = dgram.createSocket('udp6');
					let done = false;
					s.on('error', () => { if (!done) { done = true; try { s.close(); } catch (_) { } resolve(null); } });
					s.connect(33434, dest, () => {
						if (done) return; done = true;
						const a = s.address();
						try { s.close(); } catch (_) { }
						resolve(a && a.address ? a.address : null);
					});
				}).catch(() => resolve(null));
			});

			// Estratégia: escolher implementação conforme versão
			const isIPv6 = ipVersion === 6;

			const pingWithRawSocketV4 = async (target, ttl) => {
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
						} catch (eTTL1) {
							try { socket.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, Buffer.from([ttl])); } catch (eTTL2) { /* ignora */ }
						}

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
							// Time Exceeded (TTL expirado) type 11
							if (type === 11) {
								finished = true;
								const rtt = Date.now() - startedAt;
								try { socket.close(); } catch (_) { }
								return resolve({ alive: false, time: rtt, error: 'ttlExpired', hopIP: source });
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

			const pingWithRawSocketV6 = async (target, hopLimit) => {
				return new Promise(async (resolve) => {
					let socket; let finished = false; const startedAt = Date.now();
					const mapErr = (msg) => {
						if (!msg) return msg;
						if (/operation not permitted/i.test(msg)) return 'raw socket permission denied (need CAP_NET_RAW)';
						return msg;
					};
					try {
						socket = raw.createSocket({ protocol: raw.Protocol.ICMPv6 });
						try { socket.setOption(raw.SocketLevel.IPPROTO_IPV6, raw.SocketOption.IPV6_UNICAST_HOPS, hopLimit); } catch (eH1) { try { socket.setOption(raw.SocketLevel.IPPROTO_IPV6, raw.SocketOption.IPV6_UNICAST_HOPS, Buffer.from([hopLimit])); } catch (eH2) { /* ignore */ } }
						// Monta Echo Request (Tipo 128, Code 0)
						const payload = Buffer.from('ISPTOOLS');
						const icmp = Buffer.alloc(8 + payload.length);
						const TYPE_ECHO_REQUEST_V6 = 128;
						const CODE = 0;
						const identifier = (process.pid + sID) & 0xFFFF;
						const sequence = sID & 0xFFFF;
						icmp.writeUInt8(TYPE_ECHO_REQUEST_V6, 0);
						icmp.writeUInt8(CODE, 1);
						icmp.writeUInt16BE(0, 2); // checksum placeholder
						icmp.writeUInt16BE(identifier, 4);
						icmp.writeUInt16BE(sequence, 6);
						payload.copy(icmp, 8);

						// Pseudo-header checksum
						const dstBuf = parseIPv6(target);
						let srcAddr = await discoverLocalIPv6(target);
						const srcBuf = parseIPv6(srcAddr || '::1');
						if (dstBuf && srcBuf) {
							const checksum = buildICMPv6Checksum(srcBuf, dstBuf, icmp);
							icmp.writeUInt16BE(checksum, 2);
						}

						socket.on('message', (buffer, source) => {
							if (finished) return;
							// Em muitos sistemas a mensagem já vem iniciando no ICMPv6
							let offset = 0;
							const type = buffer[offset];
							const code = buffer[offset + 1];
							if (type === 129 && code === 0) { // Echo Reply
								const rIdentifier = buffer.readUInt16BE(offset + 4);
								const rSequence = buffer.readUInt16BE(offset + 6);
								if (rIdentifier === identifier && rSequence === sequence && source === target) {
									finished = true;
									const rtt = Date.now() - startedAt;
									try { socket.close(); } catch (_) { }
									return resolve({ alive: true, time: rtt });
								}
							}
							// ICMPv6 Time Exceeded type 3
							if (type === 3) {
								finished = true;
								const rtt = Date.now() - startedAt;
								try { socket.close(); } catch (_) { }
								return resolve({ alive: false, time: rtt, error: 'ttlExpired', hopIP: source });
							}
						});

						socket.on('error', (err) => {
							if (finished) return;
							finished = true; try { socket.close(); } catch (_) { }
							return resolve({ alive: false, error: mapErr(err.message) });
						});

						socket.send(icmp, 0, icmp.length, target, (err) => {
							if (err && !finished) { finished = true; try { socket.close(); } catch (_) { } return resolve({ alive: false, error: err.message }); }
						});

						setTimeout(() => { if (finished) return; finished = true; try { socket.close(); } catch (_) { } return resolve({ alive: false, error: 'timeout' }); }, PING_TIMEOUT);

					} catch (err) {
						if (!finished) { finished = true; try { if (socket) socket.close(); } catch (_) { } return resolve({ alive: false, error: mapErr(err.message) }); }
					}
				});
			};

			const result = isIPv6 ? await pingWithRawSocketV6(targetIP, attrTTL) : await pingWithRawSocketV4(targetIP, attrTTL);

			// Formatar resposta no formato esperado
			let errorObj = null;
			if (!result.alive) {
				if (result.error === 'ttlExpired') {
					errorObj = {
						"name": "TimeExceededError",
						"message": `Time exceeded (source=${result.hopIP})`,
						"source": result.hopIP
					};
				} else {
					errorObj = {
						"name": "RequestTimedOutError",
						"message": result.error || 'timeout'
					};
				}
			}

			return {
				"datetime": new Date().toString(),
				"target": targetIP,
				"ms": result.alive ? Math.round(result.time) : null,
				"ttl": attrTTL,
				"err": errorObj,
				"sID": sID,
				"query": request.query || {}
			};

		} catch (error) {
			return {
				"datetime": new Date().toString(),
				"target": request.params.id,
				"ms": null,
				"ttl": attrTTL || 128,
				"err": {
					"name": "InternalError", 
					"message": error.message
				},
				"sID": global.sID,
				"query": request.query || {}
			};
		}
	}
};
