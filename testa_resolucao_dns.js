// Script de diagnóstico de resolução DNS e testes de ping IPv4/IPv6
// Uso: node testa_resolucao_dns.js [hostname]
// Requer permissões de raw socket (root ou CAP_NET_RAW) para ICMP

import { promises as dns } from 'dns';
import net from 'net';
import netPing from 'net-ping';

const hostname = process.argv[2] || 'ipv6.isp.tools';

function logSection(title) {
	console.log('\n==== ' + title + ' ====');
}

async function resolveRecords() {
	const out = { hostname, resolve4: null, resolve6: null, lookupAll: null };
	// IPv4
	const t4 = Date.now();
	try {
		const r4 = await dns.resolve4(hostname);
		out.resolve4 = { ips: r4, timeMs: Date.now() - t4 };
	} catch (e) {
		out.resolve4 = { error: e.code || e.message, timeMs: Date.now() - t4 };
	}
	// IPv6
	const t6 = Date.now();
	try {
		const r6 = await dns.resolve6(hostname);
		out.resolve6 = { ips: r6, timeMs: Date.now() - t6 };
	} catch (e) {
		out.resolve6 = { error: e.code || e.message, timeMs: Date.now() - t6 };
	}
	// lookup all (ordem do resolver local)
	const tl = Date.now();
	try {
		const all = await dns.lookup(hostname, { all: true });
		out.lookupAll = { entries: all, timeMs: Date.now() - tl };
	} catch (e) {
		out.lookupAll = { error: e.code || e.message, timeMs: Date.now() - tl };
	}
	return out;
}

function createPingSession(family) {
	try {
		return netPing.createSession({ timeout: 1000, retries: 1, networkProtocol: family === 6 ? netPing.NetworkProtocol.IPv6 : netPing.NetworkProtocol.IPv4 });
	} catch (e) {
		return { error: e.message };
	}
}

async function pingIPs(ips, family) {
	if (!ips || !ips.length) return [];
	const session = createPingSession(family);
	if (session.error) {
		return ips.map(ip => ({ ip, error: 'session_error:' + session.error }));
	}
	const results = await Promise.all(ips.map(ip => new Promise(resolve => {
		const start = Date.now();
		session.pingHost(ip, (error) => {
			if (error) {
				resolve({ ip, ok: false, timeMs: null, error: error.message || String(error) });
			} else {
				resolve({ ip, ok: true, timeMs: Date.now() - start });
			}
		});
	})));
	try { session.close && session.close(); } catch (_) {}
	return results;
}

function inferProblem(data) {
	const problems = [];
	if (data.resolve6?.ips?.length && data.ping6?.every(p => !p.ok)) {
		const allErrors = [...new Set(data.ping6.map(p => p.error))];
		problems.push('Falha em todos pings IPv6. Erros: ' + allErrors.join('; '));
	}
	if (!data.resolve6?.ips && data.resolve4?.ips) {
		problems.push('Sem registros AAAA, só A');
	}
	if (data.resolve6?.error) {
		problems.push('Erro resolve6: ' + data.resolve6.error);
	}
	if (data.ping4?.length && data.ping4.some(p => p.ok) && data.ping6?.length && data.ping6.every(p => !p.ok)) {
		problems.push('Ambiente provavelmente sem suporte IPv6 ou sem permissão raw socket para IPv6');
	}
	return problems;
}

(async () => {
	logSection('RESOLUCAO DNS');
	const dnsData = await resolveRecords();
	console.log(JSON.stringify(dnsData, null, 2));

	const ipv4List = dnsData.resolve4?.ips || [];
	const ipv6List = dnsData.resolve6?.ips || [];

	logSection('PING IPv4');
	const ping4 = await pingIPs(ipv4List.slice(0, 3), 4);
	console.log(JSON.stringify(ping4, null, 2));

	logSection('PING IPv6');
	const ping6 = await pingIPs(ipv6List.slice(0, 3), 6);
	console.log(JSON.stringify(ping6, null, 2));

	const summary = { hostname, resolve4: dnsData.resolve4, resolve6: dnsData.resolve6, ping4, ping6 };
	summary.problems = inferProblem(summary);

	logSection('SUMARIO');
	console.log(JSON.stringify(summary, null, 2));
})();