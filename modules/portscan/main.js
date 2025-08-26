import { promises as dns } from 'dns';
import net from 'net';
import dgram from 'dgram';
import { optionalAuthMiddleware } from '../../auth.js';
import { getUdpPacket, getProtocolInfo } from './udp-protocols.js';
import { getTcpProtocolInfo } from './tcp-protocols.js';

// Configuração específica do módulo PORTSCAN
const PORTSCAN_TIMEOUT = 2000; // 2 segundos para scan de portas

// Lista de portas comuns para scan TCP
const commonTcpPorts = [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 1433, 3306, 3389, 5432, 5984, 6379, 8080, 8443, 9200];

// Lista de portas comuns para scan UDP - inclui portas de segurança crítica
const commonUdpPorts = [53, 67, 68, 69, 123, 161, 162, 500, 514, 520, 1812, 1813, 1900, 4500, 5060, 5353];

// Função para verificar se uma porta TCP está aberta
function checkTcpPort(host, port, timeout = 1000) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		const timer = setTimeout(() => {
			socket.destroy();
			resolve({ port, protocol: 'tcp', status: 'closed', error: 'timeout' });
		}, timeout);

		socket.setTimeout(timeout);
		
		socket.on('connect', () => {
			clearTimeout(timer);
			socket.destroy();
			resolve({ port, protocol: 'tcp', status: 'open' });
		});

		socket.on('timeout', () => {
			clearTimeout(timer);
			socket.destroy();
			resolve({ port, protocol: 'tcp', status: 'closed', error: 'timeout' });
		});

		socket.on('error', (err) => {
			clearTimeout(timer);
			socket.destroy();
			resolve({ port, protocol: 'tcp', status: 'closed', error: err.code || err.message });
		});

		socket.connect(port, host);
	});
}

// Função para verificar se uma porta UDP está aberta
function checkUdpPort(host, port, timeout = 1000) {
	return new Promise((resolve) => {
		// Selecionar família correta baseado no host
		const family = net.isIPv6(host) ? 'udp6' : 'udp4';
		const client = dgram.createSocket(family);
		let resolved = false;
		
		const timer = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				client.close();
				// UDP timeout geralmente indica porta aberta ou filtrada
				resolve({ port, protocol: 'udp', status: 'open|filtered', error: 'timeout' });
			}
		}, timeout);

		client.on('error', (err) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timer);
				client.close();
				// ICMP port unreachable indica porta fechada
				if (err.code === 'ECONNREFUSED') {
					resolve({ port, protocol: 'udp', status: 'closed', error: err.code });
				} else {
					resolve({ port, protocol: 'udp', status: 'closed', error: err.code || err.message });
				}
			}
		});

		client.on('message', (msg, rinfo) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timer);
				client.close();
				// Resposta recebida indica porta aberta
				resolve({ port, protocol: 'udp', status: 'open' });
			}
		});

		// Preparar pacote específico baseado na porta usando biblioteca
		const message = getUdpPacket(port, host);
		
		// Se não há pacote específico, usar pacote genérico
		const packet = message || Buffer.from('test');

		client.send(packet, 0, packet.length, port, host, (err) => {
			if (err && !resolved) {
				resolved = true;
				clearTimeout(timer);
				client.close();
				resolve({ port, protocol: 'udp', status: 'closed', error: err.code || err.message });
			}
		});
	});
}

export const portscanModule = {
	route: '/portscan/:protocol/:method/:id/:ports?',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			let attrIP = request.params.id.toString();
			const protocol = request.params.protocol.toString().toLowerCase();
			const method = request.params.method.toString().toUpperCase();
			const portsParam = request.params.ports;
			
			// Validar protocolo
			if (!['tcp', 'udp'].includes(protocol)) {
				return {
					"timestamp": Date.now(),
					"protocol": protocol,
					"method": method,
					"host": attrIP,
					"err": "invalid protocol - use TCP or UDP",
					"responseTimeMs": Date.now() - startTime
				};
			}
			
			// Validar método
			if (!['SINGLE', 'COMMON', 'RANGE', 'CUSTOM'].includes(method)) {
				return {
					"timestamp": Date.now(),
					"protocol": protocol,
					"method": method,
					"host": attrIP,
					"err": "invalid method - use SINGLE, COMMON, RANGE, or CUSTOM",
					"responseTimeMs": Date.now() - startTime
				};
			}

			// Resolver hostname para IP se necessário
			let targetHost = attrIP;
			let resolvedIPs = null;
			let ipVersion = 0;

			if (!net.isIP(attrIP)) {
				try {
					// Tentar resolver IPv4 primeiro
					try {
						const ipv4s = await dns.resolve4(attrIP);
						resolvedIPs = ipv4s;
						targetHost = ipv4s[0];
						ipVersion = 4;
					} catch (ipv4Error) {
						const ipv6s = await dns.resolve6(attrIP);
						resolvedIPs = ipv6s;
						targetHost = ipv6s[0];
						ipVersion = 6;
					}
				} catch (dnsError) {
					return {
						"timestamp": Date.now(),
						"protocol": protocol,
						"method": method,
						"host": attrIP,
						"err": 'host not found',
						"ipVersion": 0,
						"responseTimeMs": Date.now() - startTime
					};
				}
			} else {
				const is6 = net.isIPv6(attrIP);
				ipVersion = is6 ? 6 : 4;
			}

			let portsToScan = [];
			
			// Determinar portas para scan baseado no método
			switch (method) {
				case 'SINGLE':
					if (!portsParam) {
						return {
							"timestamp": Date.now(),
							"protocol": protocol,
							"method": method,
							"host": attrIP,
							"err": "port number required for SINGLE method",
							"responseTimeMs": Date.now() - startTime
						};
					}
					const singlePort = parseInt(portsParam);
					if (isNaN(singlePort) || singlePort < 1 || singlePort > 65535) {
						return {
							"timestamp": Date.now(),
							"protocol": protocol,
							"method": method,
							"host": attrIP,
							"err": "invalid port number (1-65535)",
							"responseTimeMs": Date.now() - startTime
						};
					}
					portsToScan = [singlePort];
					break;

				case 'COMMON':
					portsToScan = protocol === 'udp' ? [...commonUdpPorts] : [...commonTcpPorts];
					break;

				case 'RANGE':
					if (!portsParam || !portsParam.includes('-')) {
						return {
							"timestamp": Date.now(),
							"protocol": protocol,
							"method": method,
							"host": attrIP,
							"err": "port range required in format start-end (e.g., 80-443)",
							"responseTimeMs": Date.now() - startTime
						};
					}
					const [startPort, endPort] = portsParam.split('-').map(p => parseInt(p));
					if (isNaN(startPort) || isNaN(endPort) || startPort < 1 || endPort > 65535 || startPort > endPort) {
						return {
							"timestamp": Date.now(),
							"protocol": protocol,
							"method": method,
							"host": attrIP,
							"err": "invalid port range (1-65535, start <= end)",
							"responseTimeMs": Date.now() - startTime
						};
					}
					if (endPort - startPort > 100) {
						return {
							"timestamp": Date.now(),
							"protocol": protocol,
							"method": method,
							"host": attrIP,
							"err": "port range too large (max 100 ports)",
							"responseTimeMs": Date.now() - startTime
						};
					}
					for (let port = startPort; port <= endPort; port++) {
						portsToScan.push(port);
					}
					break;

				case 'CUSTOM':
					if (!portsParam) {
						return {
							"timestamp": Date.now(),
							"protocol": protocol,
							"method": method,
							"host": attrIP,
							"err": "comma-separated port list required (e.g., 80,443,22)",
							"responseTimeMs": Date.now() - startTime
						};
					}
					const customPorts = portsParam.split(',').map(p => parseInt(p.trim()));
					if (customPorts.some(p => isNaN(p) || p < 1 || p > 65535)) {
						return {
							"timestamp": Date.now(),
							"protocol": protocol,
							"method": method,
							"host": attrIP,
							"err": "invalid port numbers in list (1-65535)",
							"responseTimeMs": Date.now() - startTime
						};
					}
					if (customPorts.length > 100) {
						return {
							"timestamp": Date.now(),
							"protocol": protocol,
							"method": method,
							"host": attrIP,
							"err": "too many ports (max 100)",
							"responseTimeMs": Date.now() - startTime
						};
					}
					portsToScan = customPorts;
					break;
			}

			// Realizar o scan das portas
			const checkFunction = protocol === 'udp' ? checkUdpPort : checkTcpPort;
			const scanPromises = portsToScan.map(port => checkFunction(targetHost, port, PORTSCAN_TIMEOUT));
			const results = await Promise.all(scanPromises);
			
			// Adicionar informações de protocolo e segurança
			results.forEach(result => {
				const protocolInfo = protocol === 'udp' 
					? getProtocolInfo(result.port)
					: getTcpProtocolInfo(result.port);
				
				if (protocolInfo) {
					result.serviceName = protocolInfo.name;
					result.securityRisk = protocolInfo.securityRisk;
					result.securityNote = protocolInfo.securityNote;
				}
			});
			
			// Organizar resultados
			const openPorts = results.filter(r => r.status === 'open').map(r => r.port);
			const closedPorts = results.filter(r => r.status === 'closed').map(r => r.port);
			const filteredPorts = results.filter(r => r.status === 'open|filtered').map(r => r.port);
			
			// Identificar portas abertas com alto risco de segurança
			const highRiskOpenPorts = results
				.filter(r => r.status === 'open' && r.securityRisk === 'high')
				.map(r => ({ port: r.port, service: r.serviceName, note: r.securityNote }));
			
			const response = {
				"timestamp": Date.now(),
				"responseTimeMs": Date.now() - startTime,
				"protocol": protocol,
				"method": method,
				"host": attrIP,
				"targetIP": targetHost,
				"ipVersion": ipVersion,
				"totalPorts": portsToScan.length,
				"openPorts": openPorts,
				"closedPorts": closedPorts
			};

			// Adicionar portas filtradas para UDP
			if (protocol === 'udp' && filteredPorts.length > 0) {
				response.filteredPorts = filteredPorts;
			}

			// Adicionar alertas de segurança se houver portas de alto risco abertas
			if (protocol === 'udp' && highRiskOpenPorts.length > 0) {
				response.securityAlert = {
					level: 'high',
					message: 'High-risk UDP ports detected open',
					riskPorts: highRiskOpenPorts,
					recommendation: 'Verify if these services are necessary and properly secured'
				};
			}

			// Adicionar IPs resolvidos se hostname foi usado
			if (resolvedIPs && resolvedIPs.length > 0) {
				response.resolvedIPs = resolvedIPs;
			}

			response.results = results;

			return response;

		} catch (error) {
			return {
				"timestamp": Date.now(),
				"protocol": request.params.protocol,
				"method": request.params.method,
				"host": request.params.id,
				"err": error.message || 'unknown error',
				"responseTimeMs": Date.now() - startTime
			};
		}
	}
};
