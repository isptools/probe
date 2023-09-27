const dns = require('dns').promises;
const net = require('net');

// Função para determinar o tipo de IP
const getIPVersion = (ip) => {
    if (net.isIPv6(ip)) return 6;
    if (net.isIPv4(ip)) return 4;
    return 0;
};

// Função para validar o tipo de registro DNS
const isValidDNSMethod = (method) => {
    const validMethods = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT'];
    return validMethods.includes(method.toUpperCase());
};

exports.resolveDNS = async function(req, res) {
    const { id: attrIP, method } = req.params;
    const dnsMethod = method.toUpperCase();

    // Validação do tipo de registro DNS
    if (!isValidDNSMethod(dnsMethod)) {
        return res.status(400).json({
            "datetime": Date.now(),
            "method": dnsMethod,
            "host": attrIP,
            "err": "Tipo de registro DNS inválido",
            "ipv": getIPVersion(attrIP),
            "query": req.query
        });
    }

    try {
        const domains = await dns.resolve(attrIP, dnsMethod);
        res.json({
            "datetime": Date.now(),
            "method": dnsMethod,
            "host": attrIP,
            "result": domains,
            "err": null,
            "ipv": getIPVersion(attrIP),
            "query": req.query
        });
    } catch (err) {
        res.status(500).json({
            "datetime": Date.now(),
            "method": dnsMethod,
            "host": attrIP,
            "err": err.message, // Use a mensagem de erro para clareza
            "ipv": getIPVersion(attrIP),
            "query": req.query
        });
    }
};
