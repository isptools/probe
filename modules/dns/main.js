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
			
			// Resolver hostname para IP se necessário (exceto para consultas PTR que já precisam de IP)
			let targetHost = attrIP;
			let resolvedIPs = null;
			let ipVersion = 0;

			if (!net.isIP(attrIP) && method !== "PTR") {
				try {
					// Tentar resolver IPv4 primeiro
					try {
						const ipv4s = await dns.resolve4(attrIP);
						resolvedIPs = ipv4s;
						targetHost = ipv4s[0]; // Usar primeiro IP para consultas específicas
						ipVersion = 4;
					} catch (ipv4Error) {
						// Se IPv4 falhar, tentar IPv6
						const ipv6s = await dns.resolve6(attrIP);
						resolvedIPs = ipv6s;
						targetHost = ipv6s[0];
						ipVersion = 6;
					}
				} catch (dnsError) {
					// Para alguns métodos como TXT, MX, NS, CNAME, podemos usar o hostname diretamente
					if (!['TXT', 'MX', 'NS', 'CNAME', 'SOA', 'SRV'].includes(method)) {
						return {
							"timestamp": Date.now(),
							"method": method,
							"host": attrIP,
							"err": 'host not found',
							"ipVersion": 0,
							"responseTimeMs": Date.now() - startTime
						};
					}
					targetHost = attrIP; // Usar hostname original para estes métodos
				}
			} else if (net.isIP(attrIP)) {
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
			const queryTarget = (method === 'PTR' || ['TXT', 'MX', 'NS', 'CNAME', 'SOA', 'SRV'].includes(method)) ? attrIP : targetHost;

			switch (method) {
				case 'A':
					result = await dns.resolve4(queryTarget);
					break;
				case 'AAAA':
					result = await dns.resolve6(queryTarget);
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
				"target": targetHost !== attrIP ? targetHost : null,
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
