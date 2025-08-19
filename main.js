// Configurações globais
global.version = "2.1.5";
global.sID = process.pid; // ID único baseado no PID (mais simples)
global.showRequestLogs = process.env.SHOW_REQUEST_LOGS === 'true';
global.ipv4Support = false;
global.ipv6Support = false;
global.isDev = process.env.NODE_ENV === 'development';
global.serverPort = process.env.PORT || 8000;
global.loadedModules = [];

import Fastify from 'fastify';
import { loadModules } from './loader.js';
import { initializeAuth, authStatusHandler } from './auth.js';
import { detectNetworkSupport, initializeRegistration } from './register.js';

// Configuração otimizada do Fastify
const fastifyConfig = {
	logger: false,
	trustProxy: true,
	maxParamLength: 256,
	bodyLimit: 512000,
	keepAliveTimeout: 7200000,    // 2 horas
	connectionTimeout: 300000,    // 5 minutos 
	pluginTimeout: 10000,
	requestIdHeader: false,
	genReqId: false,
	caseSensitive: true,
	ignoreTrailingSlash: true,
	ignoreDuplicateSlashes: true,
	maxRequestsPerSocket: 0,
	jsonLimit: 512000,
	http2SessionTimeout: 7200000,
	onProtoPoisoning: 'ignore',
	onConstructorPoisoning: 'ignore'
};

const fastify = Fastify(fastifyConfig);

// Headers globais otimizados
const globalHeaders = {
	'X-powered-by': 'ISP.Tools',
	'X-author': 'Giovane Heleno - www.giovane.pro.br',
	'X-version': global.version,
	'Server': 'ISP.Tools Probe',
	'Access-Control-Allow-Origin': '*',
	'Cache-Control': 'no-cache, private, no-store, must-revalidate'
};

// Hook ultra-otimizado
fastify.addHook('onRequest', async (request, reply) => {
	reply.headers(globalHeaders);
	
	if (global.showRequestLogs) {
		const timestamp = new Date().toISOString().substring(0, 19).replace('T', ' ');
		const ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
		console.log(`📥 ${timestamp} - ${ip} - ${request.method} ${request.url}`);
	}
});

// Rota principal simplificada
fastify.get('/', async (request, reply) => {
	const startTime = process.hrtime.bigint();
	const now = Date.now();
	
	// Cache de memória otimizado
	if (!global.memoryCache || (now - global.memoryCache.timestamp) > 100) {
		global.memoryCache = { memory: process.memoryUsage(), timestamp: now };
	}
	
	const response = {
		version: global.version,
		auth: false,
		pid: process.pid,
		systemID: global.systemID || null,
		memory: global.memoryCache.memory,
		uptime: process.uptime(),
		timestamp: now,
		responseTimeMs: Number(process.hrtime.bigint() - startTime) / 1000000,
		modules: global.loadedModules.map(mod => mod.module) || [],
		network: {
			ipv4Support: global.ipv4Support,
			ipv6Support: global.ipv6Support
		}
	};
	
	return response; // Fastify já formata JSON automaticamente
});

// Rotas simples
fastify.get('/auth/status', authStatusHandler);
fastify.get('/health', async () => ({
	status: 'ok',
	version: global.version,
	timestamp: new Date().toISOString()
}));

// Banner simplificado
const showBanner = () => {
	console.log('\n\n\n\n🚀 ISP.Tools Probe v' + global.version);
	console.log(`📊 Port: ${global.serverPort}`);
	console.log(`🌐 IPv4: ${global.ipv4Support ? '✅' : '❌'} | IPv6: ${global.ipv6Support ? '✅' : '❌'}`);
	console.log('\n🔗 Dashboard: www.isp.tools\n\n\n\n');
};

// Inicialização ultra-simplificada
const start = async () => {
	try {		
		// Detectar suporte de rede ANTES de carregar módulos
		await detectNetworkSupport();
		
		// Paralelizar inicializações após detecção de rede
		const [, loadedModules] = await Promise.all([
			initializeAuth(),
			loadModules(fastify)
		]);
		
		global.loadedModules = loadedModules;
		
		// Iniciar servidor
		await fastify.listen({ port: global.serverPort, host: '0.0.0.0' });
		
		// Configurar servidor após inicialização
		Object.assign(fastify.server, {
			headersTimeout: 7200100,
			requestTimeout: 300000,
			maxHeadersCount: 1000,
			maxRequestsPerSocket: 0
		});

		// Registro em background
		initializeRegistration();
		
		const instanceId = process.env.NODE_APP_INSTANCE || process.env.PM2_INSTANCE_ID || '0';
		if (instanceId === '0') {
			showBanner();
		}
		
	} catch (err) {
		console.error('❌ Failed to start:', err.message);
		process.exit(1);
	}
};

// Graceful shutdown simplificado
const shutdown = (signal) => {
	console.log(`🛑 ${signal} - Shutting down gracefully`);
	fastify.close().then(() => process.exit(0)).catch(() => process.exit(1));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
