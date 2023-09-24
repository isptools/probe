// Rate limit para evitar abuso de recursos
const rateLimit = require('express-rate-limit');

const domainLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 30, // limite de 30 requisições por minuto
    keyGenerator: function (req) {
        // TODO: ajustar a conversão de ID, pois pode vir Base64 ou URI-encoded
        let attrIP = req.params.id;
        const isBase64 = (str) => {
            return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
        };

        if (isBase64(attrIP)) {
            attrIP = Buffer.from(attrIP, 'base64').toString('ascii');
        } else {
            attrIP = decodeURIComponent(attrIP);
        }

        try {
            // Tenta extrair o hostname se for uma URL
            const hostname = new URL(attrIP).hostname;
            return hostname || attrIP;
        } catch (error) {
            // Se não for uma URL válida, retorna o ID decodificado (pode ser hostname ou IP)
            return attrIP;
        }
    },
    handler: function (req, res) {
        res.status(429).json({ message: 'Muitas solicitações - tente novamente mais tarde.' });
    }
});

module.exports = {
    domainLimiter,
};
