const pingus = require('pingus');

exports.ping = async function (req, res) {
    const { id: attrIP, ttl: attrTTL = 128, tipo: attrTipo = 0 } = req.params;
    const sessionID = req.query.sessionID;

    console.log('/ping/' + attrIP + '/' + attrTTL);

    let pingOptions = {
        host: attrIP,
        timeout: 1000,
        ttl: attrTTL,
        filterBogon: false,
    };

    pingus
        .icmp(pingOptions)
        .then((result) => {
            res.json({
                "datetime": Date(),
                "ip": result.ip.label,
                "target": result.host,
                "ms": result.time,
                "ttl": attrTTL,
                "err": result.error,
                "sessionID": sessionID,
                "query": req.query,
                "result": result
            });
        })
        .catch((error) => {
            console.log('Erro no ping:', error.message);
            res.json({
                "datetime": Date(),
                "target": attrIP,
                "err": `ping error: ${error.message}`,
                "sessionID": sessionID,
                "query": req.query
            });
        });

};
