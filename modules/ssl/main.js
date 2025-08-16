import { promises as dns } from 'dns';
import net from 'net';
import tls from 'tls';
import crypto from 'crypto';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração específica do módulo SSL
const SSL_TIMEOUT = 10000; // 10 segundos para conexões SSL/TLS

// Função para obter informações do certificado SSL
function getSSLInfo(hostname, port = 443, timeout = 1000) {
	return new Promise((resolve) => {
		const options = {
			host: hostname,
			port: port,
			servername: hostname, // SNI support - sempre hostname
			rejectUnauthorized: false, // Para permitir certificados inválidos e analisá-los
			timeout: timeout
		};

		const socket = tls.connect(options, () => {
			try {
				const cert = socket.getPeerCertificate(true);
				const cipher = socket.getCipher();
				const protocol = socket.getProtocol();
				
				if (!cert || Object.keys(cert).length === 0) {
					socket.destroy();
					resolve({ error: 'No certificate found' });
					return;
				}

				// Calcular dias até expiração
				const now = new Date();
				const expiry = new Date(cert.valid_to);
				const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
				
				// Verificar se o certificado é válido para o hostname
				let validForHostname = false;
				
				// Verificar CN
				if (cert.subject?.CN === hostname) {
					validForHostname = true;
				}
				
				// Verificar SANs
				if (!validForHostname && cert.subjectaltname) {
					const sanList = cert.subjectaltname.split(', ');
					for (const san of sanList) {
						if (san.startsWith('DNS:')) {
							const sanDomain = san.substring(4);
							// Verificação exata
							if (sanDomain === hostname) {
								validForHostname = true;
								break;
							}
							// Verificação wildcard
							if (sanDomain.startsWith('*.')) {
								const wildcardDomain = sanDomain.substring(2);
								if (hostname.endsWith('.' + wildcardDomain) || hostname === wildcardDomain) {
									validForHostname = true;
									break;
								}
							}
						}
					}
				}

				// Analisar informações do emissor
				const issuer = {
					CN: cert.issuer?.CN || 'Unknown',
					O: cert.issuer?.O || 'Unknown',
					C: cert.issuer?.C || 'Unknown'
				};

				// Analisar informações do subject
				const subject = {
					CN: cert.subject?.CN || 'Unknown',
					O: cert.subject?.O || 'Unknown',
					C: cert.subject?.C || 'Unknown'
				};

				// Verificar se é self-signed
				const isSelfSigned = cert.issuer?.CN === cert.subject?.CN;
				
				// Analisar SANs (Subject Alternative Names)
				const sans = [];
				if (cert.subjectaltname) {
					const sanList = cert.subjectaltname.split(', ');
					sanList.forEach(san => {
						if (san.startsWith('DNS:')) {
							sans.push(san.substring(4));
						}
					});
				}

				const result = {
					valid: !socket.authorized ? false : true,
					authorized: socket.authorized,
					authorizationError: socket.authorizationError || null,
					validForHostname: validForHostname,
					
					// Informações do certificado
					subject: subject,
					issuer: issuer,
					serialNumber: cert.serialNumber,
					fingerprint: cert.fingerprint,
					fingerprintSHA256: cert.fingerprint256,
					
					// Datas
					validFrom: cert.valid_from,
					validTo: cert.valid_to,
					daysUntilExpiry: daysUntilExpiry,
					expired: daysUntilExpiry < 0,
					expiresoon: daysUntilExpiry <= 30,
					
					// Características do certificado
					isSelfSigned: isSelfSigned,
					subjectAltNames: sans,
					keySize: cert.bits || null,
					signatureAlgorithm: cert.sigalg || null,
					
					// Informações da conexão
					protocol: protocol,
					cipher: cipher ? {
						name: cipher.name,
						version: cipher.version
					} : null
				};

				socket.destroy();
				resolve(result);

			} catch (error) {
				socket.destroy();
				resolve({ error: error.message });
			}
		});

		socket.on('error', (error) => {
			socket.destroy();
			resolve({ error: error.message || error.code });
		});

		socket.on('timeout', () => {
			socket.destroy();
			resolve({ error: 'Connection timeout' });
		});

		socket.setTimeout(timeout);
	});
}

export const sslModule = {
	route: '/ssl/:id/:port?',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			let hostname = request.params.id.toString();
			const portParam = request.params.port;
			let port = 443; // Porta padrão HTTPS
			
			// Rejeitar se for um IP - SSL checker aceita apenas hostnames
			if (net.isIP(hostname)) {
				return {
					"timestamp": Date.now(),
					"host": hostname,
					"port": port,
					"err": "SSL checker requires hostname, not IP address",
					"responseTimeMs": Date.now() - startTime
				};
			}
			
			// Validar e configurar porta
			if (portParam) {
				const parsedPort = parseInt(portParam);
				if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
					return {
						"timestamp": Date.now(),
						"host": hostname,
						"port": portParam,
						"err": "invalid port number (1-65535)",
						"responseTimeMs": Date.now() - startTime
					};
				}
				port = parsedPort;
			}

			// Resolver hostname para IP
			let targetIP = null;
			let resolvedIPs = null;
			let ipVersion = 0;

			try {
				try {
					const ipv4s = await dns.resolve4(hostname);
					resolvedIPs = ipv4s;
					targetIP = ipv4s[0];
					ipVersion = 4;
				} catch (ipv4Error) {
					if (global.ipv6Support) {
						const ipv6s = await dns.resolve6(hostname);
						resolvedIPs = ipv6s;
						targetIP = ipv6s[0];
						ipVersion = 6;
					} else {
						throw ipv4Error;
					}
				}
			} catch (dnsError) {
				return {
					"timestamp": Date.now(),
					"host": hostname,
					"port": port,
					"err": !global.ipv6Support ? 'hostname not found (IPv6 disabled)' : 'hostname not found',
					"ipVersion": 0,
					"responseTimeMs": Date.now() - startTime
				};
			}

			// Obter informações SSL usando o hostname (sempre hostname, nunca IP)
			const sslInfo = await getSSLInfo(hostname, port, SSL_TIMEOUT);
			
			if (sslInfo.error) {
				return {
					"timestamp": Date.now(),
					"host": hostname,
					"targetIP": targetIP,
					"port": port,
					"ipVersion": ipVersion,
					"err": sslInfo.error,
					"responseTimeMs": Date.now() - startTime
				};
			}

			const response = {
				"timestamp": Date.now(),
				"host": hostname,
				"targetIP": targetIP,
				"port": port,
				"ipVersion": ipVersion,
				"resolvedIPs": resolvedIPs,
				"ssl": sslInfo,
				"responseTimeMs": Date.now() - startTime
			};

			return response;

		} catch (error) {
			return {
				"timestamp": Date.now(),
				"host": request.params.id,
				"port": request.params.port || 443,
				"err": error.message || 'unknown error',
				"responseTimeMs": Date.now() - startTime
			};
		}
	}
};
