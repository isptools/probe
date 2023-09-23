const cluster = require('cluster');
const os = require('os');

require('console-stamp')(console,  { 
    format: ':date(yyyy-mm-dd HH:MM:ss.l)' 
});

if (cluster.isMaster) {
    console.clear();
    console.log('------------------------------------------------------');
    console.log('- ISP.Tools - www.isptools.com.br                    -');
    console.log('- Giovane Heleno (www.giovane.pro.br)                -');
    console.log('------------------------------------------------------');

    const numCPUs = os.cpus().length;
    console.log(`Master ${process.pid} is running`);
    console.log(`Forking for ${numCPUs} CPUs`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork().on('online', function() {
            //console.log(`Worker ${this.process.pid} started`);
        });
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        console.log('Forking a new worker');
        cluster.fork().on('online', function() {
            console.log(`Worker ${this.process.pid} started`);
        });
    });

} else {
    const express = require('express');
    const app = express();

    const routes = require('./routes'); // Importando todas as rotas de routes/index.js

    global.version = process.env.GLOBAL_VERSION || "1.1.2";
    global.updated = process.env.GLOBAL_UPDATED === 'true';
    global.timeout = parseInt(process.env.GLOBAL_TIMEOUT, 10) || 5000;
    global.serverPort = process.env.SERVER_PORT || 8000;
    global.now = new Date().toISOString();

    app.use(routes); // Usando todas as rotas

    const server = app.listen(global.serverPort, () => {
        console.log(`Worker ${process.pid}: Service started... listening port ${server.address().port}`);
    });
}
