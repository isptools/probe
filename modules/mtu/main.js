import { promises as dns } from 'dns';
import net from 'net';
import { optionalAuthMiddleware } from '../../auth.js';
import { discoverMTU } from './mtu-tester.js';
import { recordMtuDiscovery, recordApiRequest } from '../../metrics.js';

// Configuração específica do módulo MTU
const MTU_TIMEOUT = 500; // 500ms para descoberta de MTU rápida

export const mtuModule = {
	route: '/mtu/:id',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			let attrIP = request.params.id.toString();
			const sessionID = request.query.sessionID;
			
			let sID = (global.sID >= 65535) ? 0 : global.sID + 1;
			global.sID = sID;

			// Resolver DNS se necessário para IPv4 e IPv6
			let targetIP = attrIP;
			let resolvedIPs = null;
			let ipVersion = 0;
			
			if (!net.isIP(attrIP)) {
				try {
					// Tentar resolver IPv4 primeiro
					try {
						const ipv4s = await dns.resolve4(attrIP);
						resolvedIPs = ipv4s;
						targetIP = ipv4s[0];
						ipVersion = 4;
					} catch (ipv4Error) {
						const ipv6s = await dns.resolve6(attrIP);
						resolvedIPs = ipv6s;
						targetIP = ipv6s[0];
						ipVersion = 6;
					}
				} catch (err) {
					recordApiRequest('mtu', '/mtu', Date.now() - startTime, 'failure');
					return {
						"timestamp": new Date().toISOString(),
						"target": attrIP,
						"err": 'host not found',
						"sessionID": sessionID,
						"ipVersion": 0,
						"responseTimeMs": Date.now() - startTime
					};
				}
			} else {
				const is6 = net.isIPv6(attrIP);
				ipVersion = is6 ? 6 : 4;
			}

			// Executar descoberta de MTU
			const result = await discoverMTU(targetIP, MTU_TIMEOUT);
			
			// Record MTU discovery metrics
			recordMtuDiscovery(targetIP, result.mtu, Date.now() - startTime, result.supportsJumbo, ipVersion);
			recordApiRequest('mtu', '/mtu', Date.now() - startTime, 'success');
			
			return {
				"timestamp": new Date().toISOString(),
				"target": attrIP,
				"targetIP": targetIP,
				"resolvedIPs": resolvedIPs,
				"discoveredMTU": result.mtu,
				"supportsJumbo": result.supportsJumbo,
				"tests": result.tests,
				"validation": result.validation,
				"sessionID": sessionID,
				"sID": sID,
				"ipVersion": ipVersion,
				"responseTimeMs": Date.now() - startTime
			};

		} catch (error) {
			recordApiRequest('mtu', '/mtu', Date.now() - startTime, 'error');
			return {
				"timestamp": new Date().toISOString(),
				"target": request.params.id,
				"err": error.message,
				"sessionID": request.query.sessionID,
				"sID": global.sID,
				"responseTimeMs": Date.now() - startTime
			};
		}
	}
};
