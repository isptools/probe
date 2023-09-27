const express = require('express');
const router = express.Router();
const requestIp = require('request-ip');
const cors = require('cors');
const corsConfig = require('./corsConfig');
const rateLimit = require('./rateLimitConfig');

// Middleware para adicionar IP de origem ao console-stamp
const addIPToConsoleStamp = (req, res, next) => {
    const ip = requestIp.getClientIp(req);

    // Configura o console-stamp com o IP de origem
    require('console-stamp')(console, {
        format: `:date(yyyy-mm-dd HH:MM:ss.l) [${ip}]`
    });

    next();
};

// Rotas
const allowedOrigins = [
    'isp.tools',
    'isptools.com.br',
    'uppx.net.br'
];
router.get(cors({origin: function(origin, callback) {
    const allowed = allowedOrigins.includes(origin)

    callback(null, allowed)
}})); // Middleware para CORS

router.use(addIPToConsoleStamp); // Middleware para adicionar IP de origem ao console-stamp

const pingController = require('../controllers/ping');
router.get('/ping/:id/:ttl?/:tipo?', pingController.ping);

const dnsController = require('../controllers/dns');
router.get('/dns/:method/:id', rateLimit.domainLimiter, dnsController.resolveDNS);

const httpController = require('../controllers/http');
router.get('/http/:id', rateLimit.domainLimiter, httpController.fetchHTTP);

const tracerouteController = require('../controllers/traceroute');
router.get('/traceroute/:id', rateLimit.domainLimiter, tracerouteController.traceroute);

// Rota raiz
router.get('/', (req, res) => {
    console.log('/about');
    res.json({
        "about": {
            "product": "ISP.Tools",
            "description": "Diagnostic tools for Internet Service Providers",
            "author": "Giovane Heleno (www.giovane.pro.br)",
            "website": "www.isp.tools",
            "version": global.version,
            "git": "https://github.com/isptools/isptools.git"
        },
        "updated": global.updated,
        "query": req.query,
        pid: process.pid,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        port: process.env.PORT,
        hostname: process.env.HOSTNAME,
        headers: req.headers,
        url: req.url,
        originalUrl: req.originalUrl,
        baseUrl: req.baseUrl,
        path: req.path,
        query: req.query,
        params: req.params,
    });
});

module.exports = router;
