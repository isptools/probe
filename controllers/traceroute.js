const dns = require('dns').promises;
const pingus = require('pingus');
const net = require('net'); // Certifique-se de importar o módulo 'net'

exports.traceroute = async function (req, res) {
    const { id: attrIP } = req.params;
    const sessionID = req.query.sessionID;

    console.log('/traceroute/' + attrIP);

    const targetIP = await determineTargetIP(attrIP);
    if (!targetIP) {
        return res.status(400).json({
            datetime: Date.now(),
            target: attrIP,
            err: 'Unable to determine target IP',
            sessionID,
            query: req.query
        });
    }

    try {

        const tracerouteOptions = {
            host: targetIP,
            timeout: process.env.ICMP_TIMEOUT || 2000
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
        res.status(500).json({
            "datetime": Date.now(),
            "target": targetIP,
            "err": `traceroute error: ${error.message}`,
            "sessionID": sessionID,
            "query": req.query
        });
    }
};


async function determineTargetIP(attrIP) {
    let parsedURL;

    try {
        const urlObject = new URL(decodeURIComponent(attrIP));
        parsedURL = urlObject.hostname;
    } catch (error) {
        parsedURL = attrIP;
    }

    if (net.isIP(parsedURL)) {
        return parsedURL;
    } else {
        try {
            const domains = await dns.resolve(parsedURL);
            return domains[Math.floor(Math.random() * domains.length)];
        } catch (error) {
            return null;
        }
    }
}