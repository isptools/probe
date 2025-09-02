import { promises as dns } from 'dns';
import net from 'net';
import raw from 'raw-socket';
import { optionalAuthMiddleware } from '../../auth.js';

// Constantes de comportamento (manter mesmas semantics/valores)
const RAW_TIMEOUT_PER_HOP = 700; // ms
const MAX_CONSECUTIVE_TIMEOUTS = 8;
const DEFAULT_PAYLOAD_SIZE = 32;

const debugLog = (...a) => console.log('[TRACEROUTE RAW]', ...a);
const trim = (s) => (typeof s === 'string' ? s.trim() : '');

// --------------------------------------------------
// Utilidades ICMP
// --------------------------------------------------
function checksum(buf) {
	let sum = 0;
	for (let i = 0; i < buf.length; i += 2) {
		sum += buf.readUInt16BE(i);
		while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
	}
	return (~sum) & 0xffff;
}

function buildIcmpEcho(isIPv6, identifier, seq) {
	const type = isIPv6 ? 128 : 8; // Echo Request types
	const buf = Buffer.alloc(8 + DEFAULT_PAYLOAD_SIZE, 0x61);
	buf.writeUInt8(type, 0);
	buf.writeUInt8(0, 1); // code
	buf.writeUInt16BE(0, 2); // checksum placeholder
	buf.writeUInt16BE(identifier & 0xffff, 4);
	buf.writeUInt16BE(seq & 0xffff, 6);
	buf.writeUInt16BE(checksum(buf), 2);
	return buf;
}

function parseIcmpPacket(isIPv6, packet) {
	if (isIPv6) { // Assumindo payload direto ICMPv6
		if (packet.length < 8) return null;
		return { type: packet[0], code: packet[1] };
	}
	if (packet.length < 28) return null; // IPv4 header + ICMP
	const ihl = (packet[0] & 0x0f) * 4;
	if (packet.length < ihl + 8) return null;
	return { type: packet[ihl], code: packet[ihl + 1] };
}

// --------------------------------------------------
// Execução do traceroute via raw-socket
// --------------------------------------------------
async function rawTraceroute(targetIP, maxHops) {
	const isIPv6 = net.isIPv6(targetIP);
	const hops = [];
	let reachedDestination = false;
	let consecutiveTimeouts = 0;
	const family = isIPv6 ? raw.AddressFamily.IPv6 : raw.AddressFamily.IPv4;
	const protocol = isIPv6 ? raw.Protocol.ICMPv6 : raw.Protocol.ICMP;
	const identifier = Math.floor(Math.random() * 0xffff);
	debugLog('Iniciando', { targetIP, maxHops, isIPv6 });

	for (let ttl = 1; ttl <= maxHops; ttl++) {
		const startHop = Date.now();
		let hopInfo = { hop: ttl, ip: null, hostname: null, responseTime: null, status: 'timeout' };
		let socket;
		try {
			socket = raw.createSocket({ addressFamily: family, protocol });
			try {
				if (isIPv6) socket.setOption(raw.SocketLevel.IPPROTO_IPV6, raw.SocketOption.IPV6_UNICAST_HOPS, ttl);
				else socket.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, ttl);
			} catch (optErr) { debugLog('Falha setOption', optErr.message); }

			const echo = buildIcmpEcho(isIPv6, identifier, ttl);
			const recvPromise = new Promise((resolve) => {
				socket.on('message', (buf, src) => {
					const parsed = parseIcmpPacket(isIPv6, buf);
					if (!parsed) return;
					const rtt = Date.now() - startHop;
						// IPv6: Echo Reply(129), Time Exceeded(3); IPv4: Echo Reply(0), Time Exceeded(11)
					const isReply = (isIPv6 && parsed.type === 129) || (!isIPv6 && parsed.type === 0);
					const isTime = (isIPv6 && parsed.type === 3) || (!isIPv6 && parsed.type === 11);
					if (!isReply && !isTime) return; // ignorar outros tipos
					hopInfo = { hop: ttl, ip: src, hostname: src, responseTime: rtt, status: isReply ? 'reached' : 'intermediate' };
					if (isReply) reachedDestination = true;
					resolve();
				});
				socket.on('error', e => debugLog('Socket erro hop', ttl, e.message));
				setTimeout(() => resolve(), RAW_TIMEOUT_PER_HOP);
			});
			socket.send(echo, 0, echo.length, targetIP, (err) => err && debugLog('Erro send', ttl, err.message));
			await recvPromise;
		} catch (err) {
			debugLog('Erro hop', ttl, err.message);
			hopInfo.status = 'error';
			hopInfo.error = err.message;
		} finally { try { socket && socket.close(); } catch { /* noop */ } }

		if (hopInfo.status === 'timeout') consecutiveTimeouts++; else consecutiveTimeouts = 0;
		hops.push(hopInfo);
		if (reachedDestination || consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) break;
	}

	return {
		hops,
		reachedDestination,
		totalHops: hops.length,
		timeouts: hops.filter(h => h.status === 'timeout').length,
		// Heurística: se vários timeouts no final após pelo menos 1 hop responsivo
		suspectedDestination: (() => {
			if (reachedDestination) return null;
			const MIN_TRAILING_TIMEOUTS = 5; // configurável futuramente
			let lastResponsiveIdx = -1;
			for (let i = hops.length - 1; i >= 0; i--) {
				if (hops[i].status !== 'timeout') { lastResponsiveIdx = i; break; }
			}
			if (lastResponsiveIdx === -1) return null; // nenhum hop respondeu
			const trailing = hops.length - 1 - lastResponsiveIdx;
			if (trailing < MIN_TRAILING_TIMEOUTS) return null;
			const hop = hops[lastResponsiveIdx];
			if (hop.status === 'reached') return null; // já seria destino
			const suspected = {
				hop: hop.hop,
				ip: hop.ip,
				hostname: hop.hostname,
				trailingTimeouts: trailing,
				reason: 'consecutive_timeouts_after_last_response'
			};
			debugLog('suspectedDestination heurística', suspected);
			return suspected;
		})(),
		method: 'raw-socket-icmp'
	};
}

// --------------------------------------------------
// Resolução de target (hostname/IP) mantendo mesma lógica de fallback
// --------------------------------------------------
async function resolveTarget(attrIP) {
	if (net.isIP(attrIP)) {
		return { targetIP: attrIP, resolvedIPs: null, ipVersion: net.isIPv6(attrIP) ? 6 : 4 };
	}
	try {
		try { // tentar IPv4 primeiro
			const ipv4s = await dns.resolve4(attrIP);
			return { targetIP: ipv4s[0], resolvedIPs: ipv4s, ipVersion: 4 };
		} catch (v4err) {
			const ipv6s = await dns.resolve6(attrIP); // fallback IPv6
			return { targetIP: ipv6s[0], resolvedIPs: ipv6s, ipVersion: 6 };
		}
	} catch (e) {
		return { err: 'host not found' };
	}
}

// --------------------------------------------------
// Módulo Fastify exportado
// --------------------------------------------------
export const tracerouteModule = {
	route: '/traceroute/:id/:maxhops?',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			const attrIP = request.params.id.toString();
			const maxHops = request.params.maxhops ? parseInt(trim(request.params.maxhops)) : 30;
			const sessionID = request.query.sessionID;
			debugLog('Params', { attrIP, maxHops, sessionID });

			if (maxHops < 1 || maxHops > 64) {
				return { timestamp: new Date().toISOString(), target: attrIP, err: 'invalid max hops (1-64)', sessionID, responseTimeMs: Date.now() - startTime };
			}

			// Atualiza sID global preservando faixa
			global.sID = (global.sID >= 65535) ? 0 : (global.sID + 1 || 0);
			const sID = global.sID;

			const { targetIP, resolvedIPs, ipVersion, err } = await resolveTarget(attrIP);
			if (err) {
				return { timestamp: new Date().toISOString(), target: attrIP, err, sessionID, ipVersion: 0, responseTimeMs: Date.now() - startTime };
			}

			debugLog('Executando rawTraceroute', { targetIP, ipVersion });
			let finalResult;
			try {
				finalResult = await rawTraceroute(targetIP, maxHops);
			} catch (rtErr) {
				return { timestamp: new Date().toISOString(), target: attrIP, err: 'raw traceroute failed: ' + rtErr.message, ipVersion, responseTimeMs: Date.now() - startTime };
			}

			return {
				timestamp: new Date().toISOString(),
				target: attrIP,
				targetIP,
				resolvedIPs,
				maxHops,
				totalHops: finalResult.totalHops,
				reachedDestination: finalResult.reachedDestination,
				timeouts: finalResult.timeouts,
				hops: finalResult.hops,
				suspectedDestination: finalResult.suspectedDestination,
				method: finalResult.method,
				sessionID,
				sID,
				ipVersion,
				responseTimeMs: Date.now() - startTime
			};
		} catch (error) {
			debugLog('ERRO CRÍTICO', error.message, error.stack);
			return { timestamp: new Date().toISOString(), target: request.params.id, err: error.message, sessionID: request.query.sessionID, sID: global.sID, responseTimeMs: Date.now() - startTime };
		}
	}
};
