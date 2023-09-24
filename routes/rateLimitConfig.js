// Rate limit para evitar abuso de recursos
const rateLimit = require('express-rate-limit');

const domainLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 30, // limite de 30 requisições por minuto
    keyGenerator: function (req) {
        const decodedID = Buffer.from(req.params.id, 'base64').toString('ascii');
        try {
            // Tenta extrair o hostname se for uma URL
            const hostname = new URL(decodedID).hostname;
            return hostname || decodedID;
        } catch (error) {
            // Se não for uma URL válida, retorna o ID decodificado (pode ser hostname ou IP)
            return decodedID;
        }
    },
    handler: function (req, res) {
        res.status(429).json({ message: 'Muitas solicitações - tente novamente mais tarde.' });
    }
});

module.exports = {
    domainLimiter,
};
