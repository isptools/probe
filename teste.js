
var net = require('net');
var string='';
var server = net.createServer(function(c) { //'connection' listener
        //process.stdout.write('\033c');
        var ip = c.remoteAddress + ":" + c.remotePort;
        console.log(ip + ' -> connected');

        c.write('hello\r\n');

        c.on('data', function(data) {

                var char = data.toString();
                c.write('');
                if (char.charCodeAt(0) == 13 || char.charCodeAt(0) == 10) {
                        console.log(ip+' -> '+string);
                        c.write(string+'\r\n');

                        if(string.toLowerCase()=='quit') {
                                c.end();
                        }

                        string = '';
                } else
                        string += char;
                console.log(char);

        });
        //c.pipe(c);

        c.on('end', function() {
                console.log(ip + ' -> disconnected');
        });


});


server.listen(8001, function() { //'listening' listener
  console.log('listening 8001');
});

