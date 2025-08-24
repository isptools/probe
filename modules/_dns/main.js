import { promises as dns } from 'dns';
import net from 'net';
import { optionalAuthMiddleware } from '../../auth.js';

export const dnsModule = {
	route: '/dns/:method/:id',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			let attrIP = request.params.id.toString();
			const method = request.params.method.toString().toUpperCase();
			
			// Determinar versão do IP se attrIP já for um IP
			let ipVersion = 0;
			if (net.isIP(attrIP)) {
				ipVersion = net.isIPv6(attrIP) ? 6 : 4;
			}
			
			if (method === "PTR" && !net.isIP(attrIP)) {
				return {
					"timestamp": Date.now(),
					"method": method,
					"host": attrIP,
					"err": {
						code: 'BADFAMILY'
					},
					"ipVersion": 0,
					"responseTimeMs": Date.now() - startTime
				};
			}

			let result;
			// Usar sempre o hostname/IP original fornecido pelo usuário
			const queryTarget = attrIP;

			switch (method) {
				case 'A':
					result = await dns.resolve4(queryTarget);
					if (result && result.length > 0) {
						ipVersion = 4;
					}
					break;
				case 'AAAA':
					result = await dns.resolve6(queryTarget);
					if (result && result.length > 0) {
						ipVersion = 6;
					}
					break;
				case 'MX':
					result = await dns.resolveMx(queryTarget);
					break;
				case 'TXT':
					result = await dns.resolveTxt(queryTarget);
					break;
				case 'NS':
					result = await dns.resolveNs(queryTarget);
					break;
				case 'CNAME':
					result = await dns.resolveCname(queryTarget);
					break;
				case 'PTR':
					result = await dns.reverse(queryTarget);
					break;
				case 'SOA':
					result = await dns.resolveSoa(queryTarget);
					break;
				case 'SRV':
					result = await dns.resolveSrv(queryTarget);
					break;
				default:
					result = await dns.resolve(queryTarget, method);
			}

			return {
				"timestamp": Date.now(),
				"method": method,
				"host": attrIP,
				"target": null,
				"result": result,
				"err": null,
				"ipVersion": ipVersion,
				"responseTimeMs": Date.now() - startTime
			};

		} catch (err) {
			return {
				"timestamp": Date.now(),
				"method": request.params.method.toString().toUpperCase(),
				"host": request.params.id.toString(),
				"result": null,
				"err": err,
				"ipVersion": 0,
				"responseTimeMs": Date.now() - startTime
			};
		}
	}
};
