const pingus = require('pingus');

exports.ping = async function (req, res) {
    const { id: attrIP } = req.params;
    const attrTTL = req.query.ttl || 128;
    const attrTipo = req.query.type || 0;
    const sessionID = req.query.sessionID;

    console.log('/ping/' + attrIP + '?ttl=' + attrTTL + '&tipo=' + attrTipo);

    let pingOptions = {
        host: attrIP,
        timeout: process.env.ICMP_TIMEOUT || 2000,
        ttl: attrTTL,
        filterBogon: false,
    };

    let pingPromise;

    if (attrTipo == 1) {
        // Ping usando TCP nas portas mais conhecidas
        pingOptions.ports = '@';        
        pingPromise = pingus.tcp(pingOptions);
    } else if (attrTipo == 2) {
        // Ping usando UDP
        pingPromise = pingus.udp(pingOptions);
    } else {
        // Ping padrão usando ICMP
        pingPromise = pingus.icmp(pingOptions);
    }

    pingPromise
        .then((result) => {
            res.json({
                "datetime": Date.now(),
                "target": result.host,
                "ip": result.ip.label,
                "ms": result.time,
                "ttl": attrTTL,
                "type": result.type,
                "bytes": result.bytes,
                "port": result.port,
                "err": result.error,
                "sessionID": sessionID,
                "query": req.query
            });
        })
        .catch((error) => {
            console.log('Erro no ping:', error.message);
            res.status(500).json({
                "datetime": Date.now(),
                "target": attrIP,
                "err": `ping error: ${error.message}`,
                "sessionID": sessionID,
                "query": req.query
            });
        });
};
