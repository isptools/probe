import { promises as dns } from 'dns';
import net from 'net';
import url from 'url';
import http from 'http';
import https from 'https';
import { optionalAuthMiddleware } from '../../auth.js';

// Configuração específica do módulo HTTP
const HTTP_TIMEOUT = 5000; // 5 segundos para requisições HTTP/HTTPS

// Função para prevenir injection em URLs
function injection(x) {
	const urlparse = url.parse(x);
	delete urlparse["query"];
	delete urlparse["search"];
	return url.format(urlparse);
}

export const httpModule = {
	route: '/HTTP/:id',
	method: 'get',
	middleware: [optionalAuthMiddleware],
	handler: async (request, reply) => {
		const startTime = Date.now();
		try {
			let attrIP = decodeURIComponent(request.params.id.toString());
			// Detecta se é URL base64 ou Encoded
			if (request.params.id.match(/^[A-Za-z0-9+\/=]+$/)) {
				attrIP = Buffer.from(request.params.id, 'base64').toString('ascii');
			}

			// Incluir protocolo se não estiver presente
			let shouldTryHttpsFallback = false;
			if (!url.parse(attrIP).protocol) {
				attrIP = "https://" + attrIP; // Tenta HTTPS primeiro
				shouldTryHttpsFallback = true;
			}

			const attrIPoriginal = attrIP;
			attrIP = injection(attrIP);
			const parsedUrl = url.parse(attrIP);

			if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
				return {
					"timestamp": Date.now(),
					"url": attrIP,
					"err": "invalid URL - need URL encoded - HTTP/HTTPS only",
					"responseTimeMs": Date.now() - startTime
				};
			}

			// Resolver DNS se hostname for fornecido
			let resolvedIPs = null;
			let ipVersion = 0;
			const hostname = parsedUrl.hostname;

			if (hostname && !net.isIP(hostname)) {
				try {
					// Tentar resolver IPv4 primeiro
					try {
						const ipv4s = await dns.resolve4(hostname);
						resolvedIPs = ipv4s;
						ipVersion = 4;
					} catch (ipv4Error) {
						// Se IPv4 falhar, tentar IPv6
						const ipv6s = await dns.resolve6(hostname);
						resolvedIPs = ipv6s;
						ipVersion = 6;
					}
				} catch (dnsError) {
					return {
						"timestamp": Date.now(),
						"url": attrIP,
						"err": "DNS resolution failed: " + dnsError.message,
						"ipVersion": 0,
						"responseTimeMs": Date.now() - startTime
					};
				}
			} else if (net.isIP(hostname)) {
				ipVersion = net.isIPv6(hostname) ? 6 : 4;
			}

			const makeRequest = (targetUrl) => {
				return new Promise(async (resolve, reject) => {
					const currentParsedUrl = url.parse(targetUrl);
					const isHttps = currentParsedUrl.protocol === 'https:';
					const client = isHttps ? https : http;
					
					// Re-resolver DNS para a URL atual se necessário
					let currentIpVersion = ipVersion;
					let currentResolvedIPs = resolvedIPs;
					
					if (currentParsedUrl.hostname && !net.isIP(currentParsedUrl.hostname)) {
						try {
							// Tentar resolver IPv4 primeiro
							try {
								const ipv4s = await dns.resolve4(currentParsedUrl.hostname);
								currentResolvedIPs = ipv4s;
								currentIpVersion = 4;
							} catch (ipv4Error) {
								// Se IPv4 falhar, tentar IPv6
								const ipv6s = await dns.resolve6(currentParsedUrl.hostname);
								currentResolvedIPs = ipv6s;
								currentIpVersion = 6;
							}
						} catch (dnsError) {
							reject({
								"timestamp": Date.now(),
								"url": targetUrl,
								"err": "DNS resolution failed: " + dnsError.message,
								"ipVersion": 0,
								"responseTimeMs": Date.now() - startTime
							});
							return;
						}
					} else if (net.isIP(currentParsedUrl.hostname)) {
						currentIpVersion = net.isIPv6(currentParsedUrl.hostname) ? 6 : 4;
					}
					
					const options = {
						timeout: HTTP_TIMEOUT,
						// Para IPv6, precisamos ajustar a family
						family: currentIpVersion === 6 ? 6 : (currentIpVersion === 4 ? 4 : 0),
						// Para HTTPS, ignorar erros de certificado
						...(isHttps && {
							rejectUnauthorized: false,
							requestCert: true,
							agent: false
						})
					};

					const request = client.get(targetUrl, options, (response) => {
						let certificate = null;
						
						// Capturar detalhes do certificado SSL/TLS
						if (isHttps && response.socket && response.socket.getPeerCertificate) {
							const cert = response.socket.getPeerCertificate(true);
							if (cert && Object.keys(cert).length > 0) {
								certificate = {
									subject: cert.subject,
									issuer: cert.issuer,
									valid_from: cert.valid_from,
									valid_to: cert.valid_to,
									fingerprint: cert.fingerprint,
									fingerprint256: cert.fingerprint256,
									serialNumber: cert.serialNumber,
									version: cert.version
								};
							}
						}

						resolve({
							"timestamp": Date.now(),
							"url": url.parse(attrIPoriginal),
							"resolvedIPs": currentResolvedIPs,
							"status": response.statusCode,
							"headers": response.headers,
							"certificate": certificate,
							"err": null,
							"ipVersion": currentIpVersion,
							"responseTimeMs": Date.now() - startTime
						});
					});

					request.on('error', (error) => {
						reject({
							"timestamp": Date.now(),
							"url": targetUrl,
							"resolvedIPs": currentResolvedIPs,
							"err": (error.message === 'socket hang up') ? 'TIMEOUT' : error.message,
							"ipVersion": currentIpVersion,
							"responseTimeMs": Date.now() - startTime
						});
					});

					request.setTimeout(HTTP_TIMEOUT, () => {
						request.destroy();
						reject({
							"timestamp": Date.now(),
							"url": targetUrl,
							"resolvedIPs": currentResolvedIPs,
							"err": 'TIMEOUT',
							"ipVersion": currentIpVersion,
							"responseTimeMs": Date.now() - startTime
						});
					});
				});
			};

			const result = await makeRequest(attrIP).catch(async (httpsError) => {
				// Se foi tentado HTTPS e falhou, tenta HTTP como fallback
				if (shouldTryHttpsFallback && parsedUrl.protocol === 'https:') {
					const httpUrl = attrIP.replace('https://', 'http://');
					try {
						const fallbackResult = await makeRequest(httpUrl);
						return fallbackResult;
					} catch (httpError) {
						// Se HTTP também falhar, retorna o erro mais detalhado
						return {
							"timestamp": Date.now(),
							"url": request.params.id,
							"resolvedIPs": httpsError.resolvedIPs || httpError.resolvedIPs,
							"err": `HTTPS failed: ${httpsError.err || httpsError.message}, HTTP fallback failed: ${httpError.err || httpError.message}`,
							"ipVersion": httpsError.ipVersion || httpError.ipVersion || ipVersion,
							"responseTimeMs": Date.now() - startTime
						};
					}
				}
				// Se não é fallback ou erro diferente, retorna o erro
				return httpsError;
			});
			return result;

		} catch (error) {
			console.error('HTTP Module Error:', error);
			return {
				"timestamp": Date.now(),
				"url": request.params.id,
				"err": error.err || error.message || 'Unknown error',
				"ipVersion": error.ipVersion || 0,
				"responseTimeMs": Date.now() - startTime
			};
		}
	}
};
