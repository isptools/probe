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

// Parse certificate and socket info to a richer structure (inspired by v2/modules/ssl/main.js)
function parseCertificate(cert, socket, hostname) {
	if (!cert || Object.keys(cert).length === 0) return null;

	const now = new Date();
	const expiry = cert.valid_to ? new Date(cert.valid_to) : null;
	const daysUntilExpiry = expiry ? Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)) : null;

	// subjectAltName parsing
	const sans = [];
	if (cert.subjectaltname) {
		const sanList = cert.subjectaltname.split(', ');
		sanList.forEach(san => {
			if (san.startsWith('DNS:')) sans.push(san.substring(4));
		});
	}

	// hostname validation (simple: CN or SANs with wildcard support)
	let validForHostname = false;
	if (cert.subject?.CN === hostname) validForHostname = true;
	if (!validForHostname && sans.length) {
		for (const san of sans) {
			if (san === hostname) { validForHostname = true; break; }
			if (san.startsWith('*.')) {
				const wildcardDomain = san.substring(2);
				if (hostname === wildcardDomain || hostname.endsWith('.' + wildcardDomain)) { validForHostname = true; break; }
			}
		}
	}

	const isSelfSigned = cert.issuer?.CN && cert.subject?.CN && cert.issuer.CN === cert.subject.CN;

	const cipher = socket && socket.getCipher ? socket.getCipher() : null;
	const protocol = socket && socket.getProtocol ? socket.getProtocol() : null;

	// Helper: convert raw DER Buffer to PEM string
	function derToPem(raw) {
		try {
			if (!raw) return null;
			const b64 = raw.toString('base64');
			const lines = b64.match(/.{1,64}/g) || [];
			return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
		} catch (e) {
			return null;
		}
	}

	// Build PEM chain by walking issuerCertificate if available (Node provides nested issuerCertificate when detailed=true)
	const pemChain = [];
	try {
		let current = cert;
		const seen = new Set();
		while (current && current.raw) {
			const b64 = current.raw.toString('base64');
			if (seen.has(b64)) break;
			seen.add(b64);
			const pem = derToPem(current.raw);
			if (pem) pemChain.push(pem);
			// Some Node versions provide `issuerCertificate` pointing to parent; stop when absent or self-referential
			if (!current.issuerCertificate || current.issuerCertificate === current) break;
			current = current.issuerCertificate;
		}
	} catch (e) {
		// ignore chain building errors
	}

	return {
		subject: cert.subject || null,
		issuer: cert.issuer || null,
		serialNumber: cert.serialNumber || null,
		fingerprint: cert.fingerprint || null,
		fingerprint256: cert.fingerprint256 || null,
		validFrom: cert.valid_from || null,
		validTo: cert.valid_to || null,
		daysUntilExpiry: daysUntilExpiry,
		expired: typeof daysUntilExpiry === 'number' ? daysUntilExpiry < 0 : null,
		expiresSoon: typeof daysUntilExpiry === 'number' ? daysUntilExpiry <= 30 : null,
		subjectAltNames: sans,
		validForHostname: validForHostname,
		isSelfSigned: isSelfSigned,
		keySize: cert.bits || null,
		signatureAlgorithm: cert.sigalg || null,
		protocol: protocol,
		cipher: cipher ? { name: cipher.name, version: cipher.version } : null,
		authorized: socket ? !!socket.authorized : null,
		authorizationError: socket ? socket.authorizationError || null : null
		,
		// PEM chain (array of PEM strings) when raw DER is available, and counts
		pemChain: pemChain.length ? pemChain : null,
		pemChainCount: pemChain.length
	};
}

export const httpModule = {
	route: '/http/:id',
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
					"timestamp": new Date().toISOString(),
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
						// Se IPv4 falhar, tentar IPv6 sempre
						const ipv6s = await dns.resolve6(hostname);
						resolvedIPs = ipv6s;
						ipVersion = 6;
					}
				} catch (dnsError) {
					return {
						"timestamp": new Date().toISOString(),
						"url": attrIP,
						"err": 'DNS resolution failed: ' + dnsError.message,
						"ipVersion": 0,
						"responseTimeMs": Date.now() - startTime
					};
				}
			} else if (net.isIP(hostname)) {
				ipVersion = net.isIPv6(hostname) ? 6 : 4;
			}

			const makeRequest = (targetUrl) => {
				return new Promise(async (resolve, reject) => {
					const makeStart = Date.now();
					const currentParsedUrl = url.parse(targetUrl);
					const isHttps = currentParsedUrl.protocol === 'https:';
					const client = isHttps ? https : http;

					// Re-resolver DNS para a URL atual se necessário (medindo tempo)
					let currentIpVersion = ipVersion;
					let currentResolvedIPs = resolvedIPs;
					let dnsMs = null;
					if (currentParsedUrl.hostname && !net.isIP(currentParsedUrl.hostname)) {
						const dnsStart = Date.now();
						try {
							try {
								const ipv4s = await dns.resolve4(currentParsedUrl.hostname);
								currentResolvedIPs = ipv4s;
								currentIpVersion = 4;
							} catch (ipv4Error) {
								const ipv6s = await dns.resolve6(currentParsedUrl.hostname);
								currentResolvedIPs = ipv6s;
								currentIpVersion = 6;
							}
							dnsMs = Date.now() - dnsStart;
						} catch (dnsError) {
							reject({
								"timestamp": new Date().toISOString(),
								"url": targetUrl,
								"err": 'DNS resolution failed: ' + dnsError.message,
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
						family: currentIpVersion === 6 ? 6 : (currentIpVersion === 4 ? 4 : 0),
						...(isHttps && {
							rejectUnauthorized: false,
							requestCert: true,
							agent: false
						})
					};

					let tcpConnectMs = null;
					let tlsHandshakeMs = null;
					let firstByteMs = null;

					const request = client.get(targetUrl, options, (response) => {
						const responseTime = Date.now() - makeStart;

						// Medir time-to-first-byte se possível
						response.once('data', () => {
							if (!firstByteMs) firstByteMs = Date.now() - makeStart;
						});

						// Capturar detalhes do certificado SSL/TLS e socket info
						let certificate = null;
						let socketInfo = null;
						if (isHttps && response.socket && response.socket.getPeerCertificate) {
							try {
								const cert = response.socket.getPeerCertificate(true);
								certificate = parseCertificate(cert, response.socket, currentParsedUrl.hostname || parsedUrl.hostname);
								// add raw cert fields for backward compat
								if (cert && Object.keys(cert).length > 0) {
									certificate.raw = { serialNumber: cert.serialNumber };
								}
								socketInfo = {
									protocol: response.socket.getProtocol ? response.socket.getProtocol() : null,
									cipher: response.socket.getCipher ? response.socket.getCipher() : null,
									authorized: !!response.socket.authorized,
									authorizationError: response.socket.authorizationError || null
								};
							} catch (e) {
								// ignore certificate parsing failures
							}
						}

						resolve({
							"timestamp": new Date().toISOString(),
							"url": url.parse(attrIPoriginal),
							"targetUrl": targetUrl,
							"resolvedIPs": currentResolvedIPs,
							"status": response.statusCode,
							"headers": response.headers,
							"certificate": certificate,
							"socket": socketInfo,
							"timing": {
								dnsMs: dnsMs,
								tcpConnectMs: tcpConnectMs,
								tlsHandshakeMs: tlsHandshakeMs,
								firstByteMs: firstByteMs,
								responseMs: responseTime
							},
							"err": null,
							"ipVersion": currentIpVersion,
							"responseTimeMs": Date.now() - startTime
						});
					});

					// instrument socket events for timing
					request.on('socket', (socket) => {
						if (!socket) return;
						socket.on('lookup', (err, address, family, host) => {
							if (!dnsMs) dnsMs = Date.now() - makeStart;
						});
						socket.on('connect', () => {
							tcpConnectMs = Date.now() - makeStart;
						});
						if (socket.on) {
							socket.on('secureConnect', () => {
								tlsHandshakeMs = Date.now() - makeStart;
							});
						}
					});

					request.on('error', (error) => {
						reject({
							"timestamp": new Date().toISOString(),
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
							"timestamp": new Date().toISOString(),
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
							"timestamp": new Date().toISOString(),
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
				"timestamp": new Date().toISOString(),
				"url": request.params.id,
				"err": error.err || error.message || 'Unknown error',
				"ipVersion": error.ipVersion || 0,
				"responseTimeMs": Date.now() - startTime
			};
		}
	}
};
