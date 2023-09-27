const http = require('http');
const https = require('https');

exports.fetchHTTP = async function (req, res, next) {
    let attrIP = req.params.id;

    const isBase64 = (str) => /^[A-Za-z0-9+/]*={0,2}$/.test(str);

    if (isBase64(attrIP)) {
        attrIP = Buffer.from(attrIP, 'base64').toString('ascii');
    } else {
        attrIP = decodeURIComponent(attrIP);
    }

    console.log('/http/' + attrIP);

    let parsedURL;
    try {
        parsedURL = new URL(attrIP.startsWith('http') ? attrIP : `http://${attrIP}`);
    } catch (error) {
        return res.status(400).json({
            "datetime": Date.now(),
            "err": "URL inválida",
            "query": req.query
        });
    }

    if (!parsedURL.host) {
        return res.status(400).json({
            "datetime": Date.now(),
            "err": "URL inválida",
            "query": req.query
        });
    }

    const options = {
        host: parsedURL.host,
        port: parsedURL.port || (parsedURL.protocol === 'https:' ? 443 : 80),
        path: parsedURL.pathname,
        method: 'GET',
        rejectUnauthorized: false,
        headers: {
            'User-Agent': 'ISP.Tools/1.0'
        },
        timeout: global.timeout
    };
    if (parsedURL.protocol === 'https:') {
        options.agent = new https.Agent({
            rejectUnauthorized: false,
            keepAlive: false
        });
    }
    const protocolHandler = parsedURL.protocol === 'https:' ? https : http;

    const startTime = Date.now();

    const reqHttps = protocolHandler.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            const responseObject = {
                "datetime": Date.now(),
                "url": parsedURL.href,
                "method": options.method,
                "status": response.statusCode,
                "statusMessage": response.statusMessage,
                "headers": response.headers,
                "responseTime": Date.now() - startTime,
                "responseSize": data.length,
                "httpVersion": response.httpVersion,
                "error": null,
                "query": req.query
            };

            if (parsedURL.protocol === 'https:') {
                const certificate = response.socket.getPeerCertificate();
                responseObject.certificate = certificate ? {
                    subject: certificate.subject,
                    issuer: certificate.issuer,
                    valid_from: certificate.valid_from,
                    valid_to: certificate.valid_to,
                    subjectaltname: certificate.subjectaltname,
                    infoAccess: certificate.infoAccess,
                    bits: certificate.bits,
                    exponent: certificate.exponent,
                    fingerprint: certificate.fingerprint,
                    signatureAlgorithm: certificate.signatureAlgorithm
                } : null;
                responseObject.tlsCipher = response.socket.getCipher();
                responseObject.tlsVersion = response.socket.getProtocol();
            }

            res.json(responseObject);
        });
    });

    reqHttps.on('error', (error) => {
        res.status(500).json({
            "datetime": Date.now(),
            "url": parsedURL.href,
            err: {
                message: error.message
            },
            "query": req.query
        });
    });

    reqHttps.end();
};
