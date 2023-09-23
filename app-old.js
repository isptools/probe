const manut = require('./manutencao');
const ping = require('net-ping');
const net = require('net');
const dns = require('dns').promises;
const url = require('url');
const express = require('express');
const axios = require('axios'); // Adicionado para requisições HTTP/HTTPS

const morgan = require('morgan'); // Adicionado para log de requisições
app.use(morgan('combined'));

// Adicionado para variáveis de ambiente
const env = process.env.NODE_ENV || 'dev';
require('dotenv').config({ path: `.env.${env}` });

global.version = process.env.GLOBAL_VERSION || "1.1.2";
global.updated = process.env.GLOBAL_UPDATED === 'true';
global.timeout = parseInt(process.env.GLOBAL_TIMEOUT, 10) || 5000;



const app = express();

// segurança
const helmet = require('helmet');
app.use(helmet());


let sID = 0;
let login = false;

app.use((req, res, next) => {
    res.set({
        "X-powered-by": "Giovane Heleno - www.giovane.pro.br",
        "X-version": global.version,
        "Server": "Giovane",
        "Access-Control-Allow-Origin": "*",
        'Cache-Control': 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'
    });
    const hora = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    sID = (sID >= 65535) ? 0 : sID + 1;
    const ipremoto = req.header('x-forwarded-for') || req.connection.remoteAddress;
    console.log(`${hora} - ${ipremoto} - ${req.url}`);
    next();
});

// middleware de erro
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo deu errado!');
});


function handleRootRequest(req, res) {
    res.json({
        "version": global.version,
        "updated": global.updated,
        "query": req.query,
        "auth": login,
        pid: process.pid,
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
}

app.get('/', handleRootRequest);


const { check, validationResult } = require('express-validator');

async function handlePingRequest(req, res) {
    const { id: attrIP, ttl: attrTTL } = req.params;
    const sessionID = req.query.sessionID;

    try {
        const domains = await dns.resolve(attrIP);
        const xattrIP = net.isIP(attrIP) ? attrIP : domains[Math.floor(Math.random() * domains.length)];
        const session = ping.createSession({
            "ttl": attrTTL || 128,
            'sessionId': sID,
            'retries': 2,
            'timeout': (global.timeout / 3),
            'networkProtocol': net.isIPv6(xattrIP) ? ping.NetworkProtocol.IPv6 : ping.NetworkProtocol.IPv4
        });
        session.pingHost(xattrIP, (err, target, sent, rcvd) => {
            const ms = rcvd - sent;
            res.json({
                "datetime": Date(),
                "ip": domains,
                "target": xattrIP,
                "ms": ms || 1,
                "ttl": attrTTL || 128,
                "err": err,
                "sessionID": sessionID,
                "sID": sID,
                "query": req.query
            });
            session.close();
        });
    } catch (error) {
        res.json({
            "datetime": Date(),
            "target": attrIP,
            "err": 'host not found',
            "sessionID": sessionID,
            "query": req.query
        });
    }
}

app.get('/PING/:id/:ttl?', handlePingRequest);


async function handleDnsRequest(req, res) {
    const { id: attrIP, method } = req.params;

    try {
        const domains = await dns.resolve(attrIP, method.toUpperCase());
        res.json({
            "datetime": Date(),
            "method": method,
            "host": attrIP,
            "result": domains,
            "err": null,
            "ipv": net.isIP(attrIP) ? (net.isIPv6(attrIP) ? 6 : 4) : 0,
            "query": req.query
        });
    } catch (err) {
        res.json({
            "datetime": Date(),
            "method": method,
            "host": attrIP,
            "err": err,
            "ipv": net.isIP(attrIP) ? (net.isIPv6(attrIP) ? 6 : 4) : 0,
            "query": req.query
        });
    }
}

app.get('/DNS/:method/:id', handleDnsRequest);


async function handleHttpRequest(req, res) {
    const attrIP = Buffer.from(req.params.id, 'base64').toString('ascii');
    const parsedURL = url.parse(attrIP.startsWith('http') ? attrIP : `http://${attrIP}`);

    try {
        const response = await axios.get(parsedURL.href, { timeout: global.timeout });
        res.json({
            "datetime": Date(),
            "url": parsedURL,
            "status": response.status,
            "response": response.headers,
            "err": null,
            "query": req.query
        });
    } catch (error) {
        res.json({
            "datetime": Date(),
            "url": parsedURL.href,
            "err": error.message,
            "query": req.query
        });
    }
}

app.get('/HTTP/:id', handleHttpRequest);


const serverPort = process.env.OPENSHIFT_NODEJS_PORT || 8000;
const server = app.listen(serverPort, () => {
    console.log('------------------------------------------------------');
    console.log('- ISP Tools - www.isptools.com.br                    -');
    console.log('- Giovane Heleno (www.giovane.pro.br)                -');
    console.log('------------------------------------------------------');
    console.log(`Service started... listening port ${server.address().port}`);
});
