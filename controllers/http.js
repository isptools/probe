const axios = require('axios');
const https = require('https');

exports.fetchHTTP = async function (req, res, next) {

    let attrIP = req.params.id;
    const isBase64 = (str) => {
        return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
    };

    if (isBase64(attrIP)) {
        attrIP = Buffer.from(attrIP, 'base64').toString('ascii');
    } else {
        attrIP = decodeURIComponent(attrIP);
    }

    let parsedURL;
    try {
        parsedURL = new URL(attrIP.startsWith('http') ? attrIP : `http://${attrIP}`);
    } catch (error) {
        return res.json({
            "datetime": Date.now(),
            "err": "URL inválida",
            "query": req.query
        });
    }

    if (!parsedURL.host) {
        return res.json({
            "datetime": Date.now(),
            "err": "URL inválida",
            "query": req.query
        });
    }



    const axiosConfig = {
        timeout: global.timeout || 5000,
        headers: {
            'User-Agent': 'ISP.Tools/1.0'
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false
        }),
        maxRedirects: 0,
        validateStatus: null // Para capturar erros HTTP sem lançar uma exceção
    };

    const startTime = Date.now();

    try {
        const response = await axios.get(parsedURL.href, axiosConfig);
        const { status, headers, data, request } = response;
        const certificate = request.res.connection.getPeerCertificate ? request.res.connection.getPeerCertificate() : null;

        res.json({
            "datetime": Date.now(),
            "url": parsedURL.href,
            "finalURL": response.request.res.responseUrl, // URL final após redirecionamentos
            "method": request.method, // Método da requisição
            status,
            headers,
            "responseTime": Date.now() - startTime,
            "responseSize": data.length,
            "protocolVersion": request.res.httpVersion,
            certificate: certificate ? {
                subject: certificate.subject,
                issuer: certificate.issuer,
                valid_from: certificate.valid_from,
                valid_to: certificate.valid_to,
                bits: certificate.bits,
                exponent: certificate.exponent,
                fingerprint: certificate.fingerprint,
                signatureAlgorithm: certificate.signatureAlgorithm
            } : null,
            "error": null,
            "query": req.query
        });
    } catch (error) {
        const { response } = error;
        const errDetails = response ? {
            status: response.status,
            headers: response.headers,
            message: "Erro HTTP"
        } : { message: error.message };

        res.json({
            "datetime": Date.now(),
            "url": parsedURL.href,
            err: errDetails,
            "query": req.query
        });
    }
};
