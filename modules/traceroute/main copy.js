import { promises as dns } from 'dns';
import net from 'net';
import raw from 'raw-socket';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração para traceroute via raw-socket
const RAW_TIMEOUT_PER_HOP = 700; // ms
const MAX_CONSECUTIVE_TIMEOUTS = 8;
const DEFAULT_PAYLOAD_SIZE = 32;

function debugLog(...args) { console.log('[TRACEROUTE RAW]', ...args); }

function checksum(buf) {
	let sum = 0;
	for (let i = 0; i < buf.length; i += 2) {
		sum += buf.readUInt16BE(i);
		while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
	}
	return (~sum) & 0xffff;
}

function buildIcmpEcho(isIPv6, identifier, seq) {
	// IPv4 ICMP Echo: Type 8, Code 0
	// IPv6 ICMPv6 Echo Request: Type 128, Code 0
	const type = isIPv6 ? 128 : 8;
	const code = 0;
	const headerLen = 8;
	const payload = Buffer.alloc(DEFAULT_PAYLOAD_SIZE, 0x61); // 'a'
	const buf = Buffer.alloc(headerLen + payload.length);
	buf.writeUInt8(type, 0);
	buf.writeUInt8(code, 1);
	buf.writeUInt16BE(0, 2); // checksum placeholder
	buf.writeUInt16BE(identifier & 0xffff, 4);
	buf.writeUInt16BE(seq & 0xffff, 6);
	payload.copy(buf, 8);
	const csum = checksum(buf);
	buf.writeUInt16BE(csum, 2);
	return buf;
}

function parseIcmpv4(packet) {
	// packet contém IP header + ICMP
	if (packet.length < 28) return null; // IP (20) + ICMP (8)
	const ihl = (packet[0] & 0x0f) * 4;
	if (packet.length < ihl + 8) return null;
	const type = packet[ihl];
	const code = packet[ihl + 1];
	const icmpOffset = ihl;
	return { type, code, icmpOffset };
}

function parseIcmpv6(packet) {
	// raw-socket (IPv6) normalmente entrega só o payload (sem IPv6 header) ou depende da plataforma.
	// Assumimos que recebemos ICMPv6 direto.
	if (packet.length < 8) return null;
	const type = packet[0];
	const code = packet[1];
	return { type, code, icmpOffset: 0 };
}

async function rawTraceroute(targetIP, maxHops) {
	const isIPv6 = net.isIPv6(targetIP);
	const hops = [];
	let reachedDestination = false;
	let consecutiveTimeouts = 0;
	const family = isIPv6 ? raw.AddressFamily.IPv6 : raw.AddressFamily.IPv4;
	const protocol = isIPv6 ? raw.Protocol.ICMPv6 : raw.Protocol.ICMP;
	const identifier = Math.floor(Math.random() * 0xffff);
	debugLog('Iniciando raw traceroute', { targetIP, maxHops, isIPv6 });

	for (let ttl = 1; ttl <= maxHops; ttl++) {
		const startHop = Date.now();
		let hopInfo = { hop: ttl, ip: null, hostname: null, responseTime: null, status: 'timeout' };
		let socket;
		try {
			socket = raw.createSocket({ addressFamily: family, protocol });
			// Ajustar TTL / Hop Limit
			try {
				if (isIPv6) {
					socket.setOption(raw.SocketLevel.IPPROTO_IPV6, raw.SocketOption.IPV6_UNICAST_HOPS, ttl);
				} else {
					socket.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, ttl);
				}
			} catch (optErr) {
				debugLog('Falha setOption TTL/HopLimit', optErr.message);
			}

			const echo = buildIcmpEcho(isIPv6, identifier, ttl);
			const recvPromise = new Promise((resolve) => {
				const onMessage = (buf, src) => {
					const rtt = Date.now() - startHop;
					if (isIPv6) {
						const parsed = parseIcmpv6(buf);
						if (!parsed) return; // ignorar
						if (parsed.type === 129) { // Echo Reply
							hopInfo = { hop: ttl, ip: src, hostname: src, responseTime: rtt, status: 'reached' };
							reachedDestination = true;
							resolve();
							return;
						}
						if (parsed.type === 3) { // Time Exceeded
							hopInfo = { hop: ttl, ip: src, hostname: src, responseTime: rtt, status: 'intermediate' };
							resolve();
							return;
						}
					} else {
						const parsed = parseIcmpv4(buf);
						if (!parsed) return;
						if (parsed.type === 0) { // Echo Reply
							hopInfo = { hop: ttl, ip: src, hostname: src, responseTime: rtt, status: 'reached' };
							reachedDestination = true;
							resolve();
							return;
						}
						if (parsed.type === 11) { // Time Exceeded
							hopInfo = { hop: ttl, ip: src, hostname: src, responseTime: rtt, status: 'intermediate' };
							resolve();
							return;
						}
					}
				};
				socket.on('message', onMessage);
				socket.on('error', (e) => { debugLog('Socket erro hop', ttl, e.message); });
				// Timeout
				setTimeout(() => resolve(), RAW_TIMEOUT_PER_HOP);
			});

			socket.send(echo, 0, echo.length, targetIP, (err) => {
				if (err) debugLog('Erro send hop', ttl, err.message);
			});
			await recvPromise;
		} catch (err) {
			debugLog('Erro geral hop', ttl, err.message);
			hopInfo.status = 'error';
			hopInfo.error = err.message;
		} finally {
			try { socket && socket.close(); } catch (_) {}
		}

		if (hopInfo.status === 'timeout') {
			consecutiveTimeouts++;
		} else {
			consecutiveTimeouts = 0;
		}
		hops.push(hopInfo);

		if (reachedDestination) break;
		if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) break;
	}

	return {
		hops,
		reachedDestination,
		totalHops: hops.length,
		timeouts: hops.filter(h => h.status === 'timeout').length,
		method: 'raw-socket-icmp'
	};
}

const trim = (s) => (typeof s === 'string' ? s.trim() : '');

export const tracerouteModule = {
	route: '/traceroute/:id/:maxhops?',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			debugLog('Start handler target=', request.params.id);
			let attrIP = request.params.id.toString();
			const maxHops = request.params.maxhops ? parseInt(trim(request.params.maxhops)) : 30;
			const sessionID = request.query.sessionID;
			debugLog('Params', { attrIP, maxHops, sessionID });
			
			// Validar maxHops
			if (maxHops < 1 || maxHops > 64) {
				debugLog('MaxHops inválido', maxHops);
				return {
					"timestamp": Date.now(),
					"target": attrIP,
					"err": "invalid max hops (1-64)",
					"sessionID": sessionID,
					"responseTimeMs": Date.now() - startTime
				};
			}

			debugLog('Resolvendo DNS (se necessário)');

			let sID = (global.sID >= 65535) ? 0 : global.sID + 1;
			global.sID = sID;

			// Resolver DNS se necessário para IPv4 e IPv6
			let targetIP = attrIP;
			let resolvedIPs = null;
			let ipVersion = 0;
			
		if (!net.isIP(attrIP)) {
			debugLog('Hostname detectado', attrIP);
			try {
				// Tentar resolver IPv4 primeiro
				try {
					debugLog('Tentando IPv4');
					const ipv4s = await dns.resolve4(attrIP);
					debugLog('IPv4 ok', ipv4s);
					resolvedIPs = ipv4s;
					targetIP = ipv4s[0]; // Usar primeiro IP para traceroute
					ipVersion = 4;
				} catch (ipv4Error) {
					debugLog('IPv4 falhou', ipv4Error.message, 'fallback IPv6');
					// Se IPv4 falhar, tentar IPv6 sempre
					const ipv6s = await dns.resolve6(attrIP);
					debugLog('IPv6 ok', ipv6s);
					resolvedIPs = ipv6s;
					targetIP = ipv6s[0];
					ipVersion = 6;
				}
			} catch (err) {
				debugLog('Falha DNS', err.message);
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
			debugLog('IP direto', attrIP);
			const is6 = net.isIPv6(attrIP);
			ipVersion = is6 ? 6 : 4;
			debugLog('ipVersion', ipVersion);
		}
		
		debugLog('Executando rawTraceroute', { targetIP, ipVersion });
		let finalResult;
		try {
			finalResult = await rawTraceroute(targetIP, maxHops);
		} catch (rtErr) {
			return {
				"timestamp": Date.now(),
				"target": attrIP,
				"err": 'raw traceroute failed: ' + rtErr.message,
				"ipVersion": ipVersion,
				"responseTimeMs": Date.now() - startTime
			};
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
				"method": finalResult.method,
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
