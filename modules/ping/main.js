import { promises as dns } from 'dns';
import net from 'net';
import raw from 'raw-socket';
import netPing from 'net-ping';
import { optionalAuthMiddleware } from '../../auth.js';

// Constantes
const PING_TIMEOUT = 1000;      // ms
const DNS_CACHE_TTL = 60_000;   // ms

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

// IPv6 helpers --------------------------------------------------------------
function parseIPv6(addr) {
	if (!addr) return null;
	if (addr.includes('%')) addr = addr.split('%')[0];
	const parts = addr.split('::');
	let head = parts[0] ? parts[0].split(':').filter(Boolean) : [];
	let tail = parts[1] ? parts[1].split(':').filter(Boolean) : [];
	if (parts.length === 1) { 
		if (head.length !== 8) return null; 
	} else { 
		const fill = 8 - (head.length + tail.length); 
		for (let i = 0; i < fill; i++) head.push('0');
		head = head.concat(tail); 
	}
	if (head.length !== 8) return null;
	const b = Buffer.alloc(16);
	for (let i = 0; i < 8; i++) b.writeUInt16BE(parseInt(head[i], 16) & 0xFFFF, i * 2);
	return b;
}

function ipv6ToString(buf) {
	if (!buf || buf.length !== 16) return null;
	const parts = [];
	for (let i = 0; i < 8; i++) {
		parts.push(buf.readUInt16BE(i * 2).toString(16));
	}
	return parts.join(':').replace(/\b:?(?:0+:?){2,}/, '::');
}

function buildICMPv6Checksum(srcBuf, dstBuf, icmpBuf) {
	const pseudo = Buffer.alloc(40 + icmpBuf.length);
	srcBuf.copy(pseudo, 0); dstBuf.copy(pseudo, 16);
	pseudo.writeUInt32BE(icmpBuf.length, 32); // len
	pseudo.writeUInt8(58, 39); // next header ICMPv6
	icmpBuf.copy(pseudo, 40);
	return raw.createChecksum(pseudo);
}

function discoverLocalIPv6(dest) {
	return new Promise((resolve) => {
		import('dgram').then(({ default: dgram }) => {
			const s = dgram.createSocket('udp6');
			let done = false;
			const finish = (addr) => { if (!done) { done = true; try { s.close(); } catch {} resolve(addr); } };
			s.on('error', () => finish(null));
			s.connect(33434, dest, () => finish(s.address()?.address || null));
		}).catch(() => resolve(null));
	});
}


// ICMPv4 -------------------------------------------------------------------
function pingIPv4(target, ttl, sID) {
	return new Promise((resolve) => {
		let socket; let done = false; const started = Date.now();
		const finish = (r) => { if (!done) { done = true; try { socket?.close(); } catch {} resolve(r); } };
		const mapErr = (m) => /operation not permitted/i.test(m || '') ? 'raw socket permission denied (need CAP_NET_RAW)' : m;
		try {
			socket = raw.createSocket({ protocol: raw.Protocol.ICMP });
			try { socket.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, ttl); } catch { try { socket.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_TTL, Buffer.from([ttl])); } catch {} }
			const payload = Buffer.from('ISPTOOLS');
			const buf = Buffer.alloc(8 + payload.length);
			const id = (process.pid + sID) & 0xFFFF; const seq = sID & 0xFFFF;
			buf.writeUInt8(8, 0); // type
			buf.writeUInt8(0, 1); // code
			buf.writeUInt16BE(0, 2); // checksum placeholder
			buf.writeUInt16BE(id, 4); buf.writeUInt16BE(seq, 6); payload.copy(buf, 8);
			buf.writeUInt16BE(raw.createChecksum(buf), 2);
			socket.on('message', (packet, source) => {
				if (done) return;
				let off = 0; if (packet.length >= 20 && (packet[0] >> 4) === 4) off = (packet[0] & 0x0f) * 4;
				const type = packet[off]; const code = packet[off + 1];
				const rid = packet.readUInt16BE(off + 4); const rseq = packet.readUInt16BE(off + 6);
				const rtt = Date.now() - started;
				if (type === 0 && code === 0 && rid === id && rseq === seq && source === target) return finish({ alive: true, time: rtt });
				if (type === 11 && code === 0) return finish({ alive: false, time: rtt, error: 'ttlExpired', hopIP: source });
				if (type === 3) return finish({ alive: false, time: rtt, error: 'unreachable', hopIP: source });
			});
			socket.on('error', (e) => finish({ alive: false, error: mapErr(e.message) }));
			socket.send(buf, 0, buf.length, target, (err) => { if (err) finish({ alive: false, error: err.message }); });
			setTimeout(() => finish({ alive: false, error: 'timeout' }), PING_TIMEOUT);
		} catch (e) { finish({ alive: false, error: mapErr(e.message) }); }
	});
}

// ICMPv6 -------------------------------------------------------------------
function pingIPv6(target, hopLimit, sID) {
	return new Promise(async (resolve) => {
		let socket; let done = false; const started = Date.now();
		const finish = (r) => { if (!done) { done = true; try { socket?.close(); } catch {} resolve(r); } };
		const mapErr = (m) => /operation not permitted/i.test(m || '') ? 'raw socket permission denied (need CAP_NET_RAW)' : m;
		
		try {
			// Usar socket IPv6 raw
			socket = raw.createSocket({ protocol: raw.Protocol.ICMPv6, addressFamily: raw.AddressFamily.IPv6 });
			
			// Configurar hop limit
			try { 
				socket.setOption(raw.SocketLevel.IPPROTO_IPV6, raw.SocketOption.IPV6_UNICAST_HOPS, hopLimit); 
			} catch { 
				try { 
					socket.setOption(raw.SocketLevel.IPPROTO_IPV6, raw.SocketOption.IPV6_UNICAST_HOPS, Buffer.from([hopLimit])); 
				} catch { 
					try { 
						socket.setOption(raw.SocketLevel.IPPROTO_IPV6, raw.SocketOption.IPV6_HOPLIMIT, hopLimit); 
					} catch {} 
				} 
			}
			
			const payload = Buffer.from('ISPTOOLS');
			const buf = Buffer.alloc(8 + payload.length);
			const id = (process.pid + sID) & 0xFFFF; 
			const seq = sID & 0xFFFF;
			
			buf.writeUInt8(128, 0); // Echo Request
			buf.writeUInt8(0, 1);   // Code
			buf.writeUInt16BE(0, 2); // Checksum placeholder
			buf.writeUInt16BE(id, 4); 
			buf.writeUInt16BE(seq, 6); 
			payload.copy(buf, 8);
			
			// Calcular checksum
			const dstBuf = parseIPv6(target); 
			const srcAddr = await discoverLocalIPv6(target); 
			const srcBuf = parseIPv6(srcAddr || '::1');
			
			if (dstBuf && srcBuf) {
				buf.writeUInt16BE(buildICMPv6Checksum(srcBuf, dstBuf, buf), 2);
			}
			
			socket.on('message', (packet, source) => {
				if (done) return;
				
				const rtt = Date.now() - started;
				
				// Verificar se o source está no formato correto (não é 127.0.0.1)
				if (source === '127.0.0.1' || source === 'localhost') {
					// Isso indica problema na captura do endereço, vamos pular
					return;
				}
				
				// Para ICMPv6, o pacote pode conter cabeçalho IPv6 ou apenas ICMP
				let offset = 0;
				
				// Se o pacote começa com versão IPv6 (6 no primeiro nibble)
				if (packet.length >= 40 && (packet[0] >> 4) === 6) {
					offset = 40; // Pular cabeçalho IPv6
				}
				
				if (packet.length < offset + 8) return; // Pacote muito pequeno
				
				const type = packet[offset]; 
				const code = packet[offset + 1];
				
				// Echo Reply
				if (type === 129 && code === 0) {
					const rid = packet.readUInt16BE(offset + 4); 
					const rseq = packet.readUInt16BE(offset + 6);
					if (rid === id && rseq === seq && source === target) {
						return finish({ alive: true, time: rtt });
					}
				}
				
				// Time Exceeded
				if (type === 3 && code === 0) {
					return finish({ alive: false, time: rtt, error: 'ttlExpired', hopIP: source });
				}
				
				// Destination Unreachable
				if (type === 1) {
					return finish({ alive: false, time: rtt, error: 'unreachable', hopIP: source });
				}
			});
			
			socket.on('error', (e) => {
				finish({ alive: false, error: mapErr(e.message) });
			});
			
			// Enviar pacote
			socket.send(buf, 0, buf.length, target, (err) => {
				if (err) {
					finish({ alive: false, error: err.message });
				}
			});
			
			// Timeout
			setTimeout(() => {
				finish({ alive: false, error: 'timeout' });
			}, PING_TIMEOUT);
			
		} catch (e) {
			finish({ alive: false, error: mapErr(e.message) });
		}
	});
}



function buildError(result) {
	if (result.alive) return null;
	if (result.error === 'ttlExpired') return { name: 'TimeExceededError', message: `Time exceeded (source=${result.hopIP})`, source: result.hopIP };
	if (result.error === 'unreachable') return { name: 'DestinationUnreachableError', message: `Destination unreachable (source=${result.hopIP})`, source: result.hopIP };
	return { name: 'RequestTimedOutError', message: result.error || 'timeout' };
}

export const ping = {
	route: '/ping/:id/:ttl?',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request) => {
		let ttl = ttlNormalize(parseInt(String(request.params.ttl || '')));
		const input = String(request.params.id || '');
		const sID = (global.sID >= 65535) ? 0 : (global.sID + 1 || 0); global.sID = sID;
		try {
			const res = await resolveHost(input);
			if (res.error) {
				const errName = res.error === 'ipv6-only (disabled)' ? 'IPv6NotSupportedError' : 'HostNotFoundError';
				const errMsg = res.error === 'ipv6-only (disabled)' ? 'IPv6 not supported on this probe' : res.error;
				return { datetime: new Date().toString(), target: input, ms: null, ttl, err: { name: errName, message: errMsg }, sID, query: request.query || {} };
			}
			const target = res.version ? res.ips[Math.floor(Math.random() * res.ips.length)] : null;
			if (!target || !net.isIP(target)) {
				return { datetime: new Date().toString(), target: target || input, ms: null, ttl, err: { name: 'HostNotFoundError', message: 'host not found' }, sID, query: request.query || {} };
			}
			const result = res.version === 6 ? await pingIPv6(target, ttl, sID) : await pingIPv4(target, ttl, sID);
			const errObj = buildError(result);
			return { datetime: new Date().toString(), target, ms: result.alive ? Math.round(result.time) : null, ttl, err: errObj, sID, query: request.query || {} };
		} catch (e) {
			return { datetime: new Date().toString(), target: input, ms: null, ttl, err: { name: 'InternalError', message: e.message }, sID, query: request.query || {} };
		}
	}
};
