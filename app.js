console.log('');
console.log('');
console.log('');
console.log('------------------------------------------------------');
console.log('- ISP Tools - www.isptools.com.br                    -');
console.log('- Giovane Heleno (www.giovane.pro.br)                -');
console.log('------------------------------------------------------');
console.log('Service started... litening port 8000.');
console.log('');
console.log('');
console.log('');

var manut = require('./manutencao');
//setInterval(manut.atualizar, 60 * 1000);
//manut.atualizar();

var Step = require('step');
var ping = require('net-ping');
var net = require('net');
var dns = require('dns');
var url = require('url');
var http = require('http');
var https = require('https');
var express = require('express');
var app = express();
var sID = new Date().getTime();
sID=0;

app.configure(function () {
    app.use(function (req, res, next) {
        res.header("X-powered-by", "Giovane Heleno - www.giovane.pro.br");
        res.header("X-version", "0.9");
        res.header("Server", "WebGEO");
        res.header("Access-Control-Allow-Origin", "*");
        var hora = new Date().toISOString().
        replace(/T/, ' ').      // replace T with a space
        replace(/\..+/, '');
        sID++;
        sID=(sID>=65535)?0:sID;
        //console.log(sID);
        //console.log((hora+" - "+res.connection.remoteAddress+' - '+req.url.toUpperCase()));
        next();
    });
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
    //res.redirect('http://www.isptools.com.br');
    res.json({"err":"invalid request. check documentation. ;-)"});
});

/**
 *    HEALT
 *
 *    @date   2014-03-18
 *
 *    @author Giovane Heleno - www.giovane.pro.br
 *
 *    @param  {[type]}   req
 *    @param  {[type]}   res
 *
 *    @return {[type]}
 */
app.get('/health', function(req, res){
  res.send({
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime()
  })
})

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
    attrTTL = (attrTTL==null)?128:parseInt(trim(attrTTL));
    var attrIP = req.params.id;
    var sessionID = req.query.sessionID;
    //console.log(sessionID);
    attrIP = attrIP.toString();
    attrIP = trim(attrIP);
    Step(
        function resolveIP() {
                dns.resolve(attrIP, this);
        },
        function pingar(err, domains) {
            xattrIP = attrIP;
            if (!net.isIP(attrIP)) {
                if(domains==undefined){
                    res.json({
                        "datetime": Date(),
                        "target": attrIP,
                        "err": 'host not found',
                        "sessionID": sessionID
                        });
                }
                else
                xattrIP = domains[Math.floor(Math.random()*domains.length)];
            }
            //console.log(sID);
            var session = ping.createSession({"ttl":attrTTL, 'sessionId': sID });
            session.pingHost(xattrIP, function (err, target, sent, rcvd) {
                var ms = rcvd - sent;
                session.close();
                res.json({
                    "datetime": Date(),
                    "ip": domains,
                    "target": xattrIP,
                    "ms": ((ms==0)?1:ms),
                    "ttl": attrTTL,
                    "err": err,
                    "sessionID": sessionID,
                    "sID": sID
                });
            });
        }
    );
});


/**
 *    TRACEROUTE
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
app.get('/TRACEROUTE/:id', function (req, res) {
    var attrIP = req.params.id;
        attrIP = attrIP.toString();
        attrIP = trim(attrIP);
        Step(
            function resolveIP() {
                    dns.resolve(attrIP, this);
            },
            function passo1(err, domains){
                            xattrIP = attrIP;
            if (!net.isIP(attrIP)) {
                xattrIP = domains[Math.floor(Math.random()*domains.length)];
            }

                tracert(xattrIP, this);
            },
            function passo2(xyz){
                res.json(xyz);
            }
        );
});

function tracert(ip, callback, attrTTL, errTTL, json) {
    attrTTL = attrTTL || 1;
    errTTL = errTTL || 0;
    json = json || new Array();
    var session = ping.createSession({"ttl":attrTTL, "timeout": 2000});
    session.pingHost(ip, function (err, target, sent, rcvd) {
                var ms = rcvd - sent;
                if(err==null) {
                    json.push({"ttl":attrTTL,"ip":ip,"ms":ms});
                    //console.log(json);
                    callback(json);
                } else if(err.name=="TimeExceededError"){
                    errTTL = 0;
                    json.push({"ttl":attrTTL,"ip":err.source,"ms":ms});
                    tracert(ip, callback, (attrTTL+1), (errTTL+1), json);
                } else {
                    if(errTTL==3){
                        json.push({"ttl":attrTTL,"err":"unreachable"});
                        callback(json);
                    }
                    else if(attrTTL<2) {
                        tracert(ip, callback, (attrTTL+1), (errTTL+1), json);
                    }
                    else {
                        json.push({"ttl":attrTTL,"err":"unreachable", "errttl": errTTL});
                        tracert(ip, callback, attrTTL, (errTTL+1), json);
                    }
                }
            });
}


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
    if(method=="PTR" && !net.isIP(attrIP)){
        res.json({
            "datetime": Date(),
            "method": method,
            "host": attrIP,
            "err": {code:'BADFAMILY'} ,
            "ipv": (net.isIP(attrIP)?(net.isIPv6(attrIP)?6:4):0)
        });
    } else
    dns.resolve(attrIP, method, function (err, domains) {
        res.json({
            "datetime": Date(),
            "method": method,
            "host": attrIP,
            "result": domains,
            "err": err,
            "ipv": (net.isIP(attrIP)?(net.isIPv6(attrIP)?6:4):0)
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
    attrIP = attrIP.toString();
    attrIP = unescape(attrIP);
    if (url.parse(attrIP).protocol == null){
        attrIP = "http://"+attrIP;
        
    }

    if (url.parse(attrIP).protocol == 'http:') {
        http.get(attrIP, function (e) {
            res.json({
                "datetime": Date(),
                "url": url.parse(attrIP),
                "status": e.statusCode,
                "response": e.headers,
                "err": null
            });
        })
            .on('error', function (e) {
                res.json({
                    "datetime": Date(),
                    "url": attrIP,
                    "err": e.message
                });
            });
    }


    else if (url.parse(attrIP).protocol == 'https:') {
        https.get(attrIP, function (e) {
            res.json({
                "datetime": Date(),
                "url": url.parse(attrIP),
                "status": e.statusCode,
                "response": e.headers,
                "err": null
            });
        })
            .on('error', function (e) {
                res.json({
                    "datetime": Date(),
                    "url": attrIP,
                    "err": e.message
                });
            });
    }

    else
        res.json({
            "datetime": Date(),
            "url": attrIP,
            "err": "invalid URL - need URL encoded - HTTP/HTTPS only"
        });
    
});


/**
 *    Habilita servidor porta 8000
 */
app.listen(8000);




/**
 *    Functions
 */

// TRIM
var trim = function (s) {
  var m = s.length;

  for (var i = 0; i < m && s.charCodeAt(i) < 33; i++) {
  }
  for (var j = m - 1; j > i && s.charCodeAt(j) < 33; j--){
  }

  return s.substring(i, j + 1);
};