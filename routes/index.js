const express = require('express');
const router = express.Router();

// ---------------------------------------------------------------------------------------------
// Rate limit para evitar abuso de recursos
// ---------------------------------------------------------------------------------------------
const rateLimit = require('express-rate-limit');
const domainLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 30, // limite de 1 requisição
    keyGenerator: function(req) {
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
    handler: function(req, res) {
        res.status(429).json({ message: 'Muitas solicitações - tente novamente mais tarde.' });
    }
});

// ---------------------------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------------------------

const pingController = require('../controllers/ping');
router.get('/ping/:id/:ttl?/:tipo?', pingController.ping);

const dnsController = require('../controllers/dns');
router.get('/dns/:method/:id', domainLimiter, dnsController.resolveDNS);

const httpController = require('../controllers/http');
router.get('/http/:id', domainLimiter, httpController.fetchHTTP);

const tracerouteController = require('../controllers/traceroute');
router.get('/traceroute/:id',domainLimiter, tracerouteController.traceroute);

// ---------------------------------------------------------------------------------------------


router.get('/', (req, res) => {
    res.json({
        "version": global.version,
        "updated": global.updated,
        "query": req.query,
        "auth": login,
        pid: process.pid,
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

module.exports = router;
