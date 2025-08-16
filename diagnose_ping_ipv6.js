#!/usr/bin/env node
/**
 * Diagnóstico detalhado para divergências no módulo /ping envolvendo IPv6
 *
 * Passos:
 * 1. Resolve A e AAAA
 * 2. Faz ping raw (net-ping) em cada IP
 * 3. Chama endpoint /ping/<host>
 * 4. Compara resultados e identifica causas prováveis
 */

import { promises as dns } from 'dns';
import netPing from 'net-ping';
import http from 'http';

const HOST = process.env.HOST || 'ipv6.isp.tools';
const BASE = process.env.PROBE_URL || 'http://127.0.0.1:8000';

function hr() { console.log('\n' + '-'.repeat(60)); }

async function resolveRecords(name) {
  const out = { A: { ips: [], err: null, ms: 0 }, AAAA: { ips: [], err: null, ms: 0 } };
  let t;
  try {
    t = Date.now();
    out.A.ips = await dns.resolve4(name);
  } catch (e) { out.A.err = e.message; }
  out.A.ms = Date.now() - t;
  try {
    t = Date.now();
    out.AAAA.ips = await dns.resolve6(name);
  } catch (e) { out.AAAA.err = e.message; }
  out.AAAA.ms = Date.now() - t;
  return out;
}

function pingMany(ips) {
  return new Promise((resolve) => {
    if (!ips || !ips.length) return resolve([]);
    const session = netPing.createSession({ timeout: 800, retries: 0 });
    const results = [];
    let pending = ips.length;
    ips.forEach(ip => {
      const start = Date.now();
      session.pingHost(ip, (err) => {
        results.push({ ip, ok: !err, timeMs: err ? null : Date.now() - start, err: err ? err.message : null });
        if (--pending === 0) {
          session.close();
          resolve(results);
        }
      });
    });
  });
}

async function callProbe(host) {
  return new Promise((resolve) => {
    const url = `${BASE}/ping/${encodeURIComponent(host)}`;
    const start = Date.now();
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const elapsed = Date.now() - start;
        try {
          resolve({ ok: true, status: res.statusCode, body: JSON.parse(data), raw: data, timeMs: elapsed });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, body: null, raw: data, parseError: e.message, timeMs: elapsed });
        }
      });
    }).on('error', (e) => {
      resolve({ ok: false, error: e.message });
    });
  });
}

function analyze(r) {
  const probs = [];
  const body = r.probe && r.probe.body ? r.probe.body : null;
  if (!r.probe.ok) {
    probs.push('Falha ao conectar ao endpoint /ping (servidor offline ou porta diferente).');
    return probs;
  }
  if (r.records.AAAA.ips.length && body && !body.ip?.length && body.ipVersion === 4) {
    probs.push('Probe retornou ipVersion=4 mas resolução AAAA disponível.');
  }
  if (body && body.err && /Invalid IP address/.test(body.err)) {
    probs.push('targetIP indefinido antes do ping (possível lista vazia não tratada).');
  }
  if (r.records.AAAA.ips.length && r.ping6.filter(p => p.ok).length === 0) {
    probs.push('Resolução AAAA ok, mas ICMP falhou em todos IPv6 (firewall ou ausência de suporte).');
  }
  if (body && r.ping6.some(p => p.ok) && body.err === 'IPv6 not supported on this probe') {
    probs.push('Biblioteca net-ping conseguiu IPv6, mas aplicação marcou ipv6Support=false (flag global não atualizada).');
  }
  return probs;
}

(async () => {
  console.log('Diagnóstico /ping IPv6');
  console.log(`Host alvo: ${HOST}`);
  console.log(`Probe: ${BASE}`);
  hr();

  const records = await resolveRecords(HOST);
  console.log('DNS:');
  console.log(JSON.stringify(records, null, 2));
  hr();

  const ping4 = await pingMany(records.A.ips);
  const ping6 = await pingMany(records.AAAA.ips);
  console.log('Ping direto:');
  console.log(JSON.stringify({ ping4, ping6 }, null, 2));
  hr();

  const probe = await callProbe(HOST);
  console.log('Resposta endpoint /ping:');
  console.log(JSON.stringify(probe, null, 2));
  hr();

  const report = { records, ping4, ping6, probe: probe, problems: [] };
  report.problems = analyze({ records, ping4, ping6, probe });
  console.log('Análise:');
  console.log(JSON.stringify({ problems: report.problems }, null, 2));

  if (report.problems.length === 0) {
    console.log('Nenhum problema detectado.');
  }
})();
