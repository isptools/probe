const dns = require('dns').promises;
const pingus = require('pingus');
const net = require('net'); // Certifique-se de importar o módulo 'net'

exports.traceroute = async function (req, res) {
    const { id: attrIP } = req.params;
    const sessionID = req.query.sessionID;

    let targetIP;

    // Verifica se attrIP é um IP válido
    if (net.isIP(attrIP)) {
        targetIP = attrIP;
    } else {
        try {
            const domains = await dns.resolve(attrIP);
            targetIP = domains[Math.floor(Math.random() * domains.length)];
        } catch (error) {
            return res.json({
                "datetime": Date.now(),
                "target": attrIP,
                "err": 'host not found',
                "sessionID": sessionID,
                "query": req.query
            });
        }
    }

    try {

        const tracerouteOptions = {
            host: targetIP,
            // Adicione outras opções aqui, se necessário
        };

        const tracerouteResult = await pingus.traceroute(tracerouteOptions);


        res.json({
            "datetime": Date.now(),
            "ip": attrIP,
            "target": targetIP,
            "hops": tracerouteResult,
            "sessionID": sessionID,
            "query": req.query
        });
    } catch (error) {
        res.json({
            "datetime": Date.now(),
            "target": targetIP,
            "err": `traceroute error: ${error.message}`,
            "sessionID": sessionID,
            "query": req.query
        });
    }
};
