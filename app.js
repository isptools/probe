global.version = "1.1.2";
global.updated = true;
global.timeout = 5000;
version = global.version;

var manut = require('./manutencao');
setInterval(manut.atualizar, 60 * 60 * 1000);
manut.atualizar();

var Step = require('step');
var ping = require('net-ping');
var net = require('net');
var dns = require('dns');
var url = require('url');
var http = require('http');
var https = require('https');
var express = require('express');
var app = express();
var sID = 0;
var login = false;

app.use(function (req, res, next) {
	res.header("X-powered-by", "Giovane Heleno - www.giovane.pro.br");
	res.header("X-version", version);
	res.header("Server", "Giovane");
	res.header("Access-Control-Allow-Origin", "*");
	res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');

	var hora = new Date().toISOString().
	replace(/T/, ' '). // replace T with a space
	replace(/\..+/, '');
	sID++;
	sID = (sID >= 65535) ? 0 : sID;
	console.log((hora + " - " + res.connection.remoteAddress + ' - ' + req.url));
	next();
});

/**
 *    HOME
 *
 *    @date   2014-03-10
 *
 *    @author Giovane Heleno - www.giovane.pro.br
 *
 *    @param  {[type]}   req
 *    @param  {[type]}   res
 *
 *    @return {[type]}
 */
app.get('/', function (req, res) {
	res.json({
		"version": version,
		"updated": global.updated,
		"query": req.query,
		"auth": login,
		pid: process.pid,
		memory: process.memoryUsage(),
		uptime: process.uptime()
	});
});

/**
 *    PING
 *
 *    @date   2014-03-10
 *
 *    @author Giovane Heleno - www.giovane.pro.br
 *
 *    @param  {[type]}   req [description]
 *    @param  {[type]}   res [description]
 *
 *    @return {[type]}       [description]
 */
app.get('/PING/:id/:ttl?', function (req, res) {
	var attrTTL = req.params.ttl;
	var sent, rcvd, ms;
	attrTTL = (attrTTL == null) ? 128 : parseInt(trim(attrTTL));
	var attrIP = req.params.id;
	var sessionID = req.query.sessionID;
	var notfound = 0;

	attrIP = attrIP.toString();
	Step(
		function resolveIP() {
			dns.resolve(attrIP, this);
		},
		function pingar(err, domains) {
			xattrIP = attrIP;
			if (!net.isIP(attrIP)) {
				if (domains == undefined) {
					res.json({
						"datetime": Date(),
						"target": attrIP,
						"err": 'host not found',
						"sessionID": sessionID,
						"query": req.query
					});
					notfound = 1;
				} else
					xattrIP = domains[Math.floor(Math.random() * domains.length)];
			}
			var session = ping.createSession({
				"ttl": attrTTL,
				'sessionId': sID,
				'retries': 2,
				'timeout': (global.timeout / 3),
				'networkProtocol': ping.NetworkProtocol.IPv4
			});
			session.pingHost(xattrIP, function (err, target, sent, rcvd) {
				var ms = rcvd - sent;
				if (!notfound)
					res.json({
						"datetime": Date(),
						"ip": domains,
						"target": xattrIP,
						"ms": ((ms == 0) ? 1 : ms),
						"ttl": attrTTL,
						"err": err,
						"sessionID": sessionID,
						"sID": sID,
						"query": req.query
					});
				session.close();
			});
		}
	);
});

/**
 *    DNS Tool
 *
 *    @date   2014-03-10
 *
 *    @author Giovane Heleno - www.giovane.pro.br
 *
 *    @param  {[type]}   req [description]
 *    @param  {[type]}   res [description]
 *
 *    @return {[type]}       [description]
 */
app.get('/DNS/:method/:id', function (req, res) {
	var attrIP = req.params.id;
	var method = req.params.method;
	attrIP = attrIP.toString();
	method = method.toString().toUpperCase();
	if (method == "PTR" && !net.isIP(attrIP)) {
		res.json({
			"datetime": Date(),
			"method": method,
			"host": attrIP,
			"err": {
				code: 'BADFAMILY'
			},
			"ipv": (net.isIP(attrIP) ? (net.isIPv6(attrIP) ? 6 : 4) : 0),
			"query": req.query
		});
	} else
		dns.resolve(attrIP, method, function (err, domains) {
			res.json({
				"datetime": Date(),
				"method": method,
				"host": attrIP,
				"result": domains,
				"err": err,
				"ipv": (net.isIP(attrIP) ? (net.isIPv6(attrIP) ? 6 : 4) : 0),
				"query": req.query
			});
		});
});

/**
 *    HTTP Tool
 *
 *    @date   2014-03-10
 *
 *    @author Giovane Heleno - www.giovane.pro.br
 *
 *    @param  {[type]}   req [description]
 *    @param  {[type]}   res [description]
 *
 *    @return {[type]}       [description]
 */

app.get('/HTTP/:id', function (req, res) {
	var attrIP = req.params.id;
	attrIP = new Buffer(attrIP, 'base64').toString('ascii');
	//attrIP = attrIP.toString();
	if (url.parse(attrIP).protocol == null) {
		attrIP = "http://" + attrIP;
	}

	attrIPoriginal = attrIP;
	attrIP = injection(attrIP);
	if (url.parse(attrIP).protocol == 'http:') {
		var httpreq = http.get(attrIP, function (e) {
				res.json({
					"datetime": Date(),
					"url": url.parse(attrIPoriginal),
					"status": e.statusCode,
					"response": e.headers,
					"err": null,
					"query": req.query
				});
			})
			.on('error', function (e) {
				res.json({
					"datetime": Date(),
					"url": attrIP,
					"err": (e.message == 'socket hang up') ? 'TIMEOUT' : e.message,
					"query": req.query
				});
			});
		httpreq.setTimeout(global.timeout, function () {
			httpreq.abort();
		});
	} else if (url.parse(attrIP).protocol == 'https:') {
		var httpsreq = https.get(attrIP, function (e) {
				res.json({
					"datetime": Date(),
					"url": url.parse(attrIP),
					"status": e.statusCode,
					"response": e.headers,
					"err": null,
					"query": req.query
				});
			})
			.on('error', function (e) {
				res.json({
					"datetime": Date(),
					"url": attrIP,
					"err": (e.message == 'socket hang up') ? 'TIMEOUT' : e.message,
					"query": req.query
				});
			});
		httpsreq.setTimeout(global.timeout, function () {
			httpsreq.abort();
		});
	} else
		res.json({
			"datetime": Date(),
			"url": attrIP,
			"err": "invalid URL - need URL encoded - HTTP/HTTPS only",
			"query": req.query
		});

});

/**
 *    Habilita servidor porta 8000
 */
var serverPort = process.env.OPENSHIFT_NODEJS_PORT  || 8000;
var server = app.listen(serverPort, function () {

	console.log('');
	console.log('');
	console.log('');
	console.log('------------------------------------------------------');
	console.log('- ISP Tools - www.isptools.com.br                    -');
	console.log('- Giovane Heleno (www.giovane.pro.br)                -');
	console.log('------------------------------------------------------');
	console.log('Service started... litening port %d.', server.address().port);
	console.log('');
	console.log('');
	console.log('');

});



/**
 *    Functions
 */

// TRIM
var trim = function (s) {
	var m = s.length;

	for (var i = 0; i < m && s.charCodeAt(i) < 33; i++) {}
	for (var j = m - 1; j > i && s.charCodeAt(j) < 33; j--) {}

	return s.substring(i, j + 1);
};

function injection(x) {
	var urlparse = url.parse(x);
	delete urlparse["query"];
	delete urlparse["search"];
	return url.format(urlparse);
}
