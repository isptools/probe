require('dotenv').config();
const cluster = require('cluster');
const os = require('os');
const funcoes = require('./funcoes');
funcoes.customizeConsole();

const ligarcluster = !!JSON.parse(String(process.env.LIGAR_CLUSTER).toLowerCase());

if (cluster.isMaster) {

    // pinga o isp.tools a cada 5 minutos
    funcoes.registro();
    setInterval(funcoes.registro, 300000);

    console.clear();
    console.warn('------------------------------------------------------');
    console.warn('- ISP.Tools - www.isptools.com.br                    -');
    console.warn('- Giovane Heleno (www.giovane.pro.br)                -');
    console.warn('------------------------------------------------------');
    console.info(`Starting cluster mode: ${ligarcluster}`);
}

if (ligarcluster && cluster.isMaster) {
    const numCPUs = os.cpus().length;
    console.info(`- Master ${process.pid} is running`);
    console.info(`- Forking for ${numCPUs} CPUs`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork().on('online', function () {
            console.info(`- Worker ${this.process.pid} started`);
        });
    }

    cluster.on('exit', (worker, code, signal) => {
        console.error(`- Worker ${worker.process.pid} died`);
        console.info('- Forking a new worker');
        cluster.fork().on('online', function () {
            console.info(`- Worker ${this.process.pid} started`);
        });
    });

} else {
    const express = require('express');
    const app = express();

    const routes = require('./routes'); // Importando todas as rotas de routes/index.js

    global.version = process.env.GLOBAL_VERSION || "2.0";
    global.timeout = parseInt(process.env.GLOBAL_TIMEOUT, 10) || 5000;
    global.serverPort = process.env.SERVER_PORT || 8000;
    global.now = new Date().toISOString();

    app.use(routes); // Usando todas as rotas

    const server = app.listen(global.serverPort, () => {
        console.info(`- Worker ${process.pid}: Service started... listening port ${server.address().port}`);
    });
}

