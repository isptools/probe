// Configurações globais
global.version = "2.1.4";
global.updated = true;
global.sID = 0;
global.showRequestLogs = process.env.SHOW_REQUEST_LOGS === 'true';
global.ipv4Support = false; // Será atualizado durante o registro
global.ipv6Support = false; // Será atualizado durante o registro
global.isDev = process.env.NODE_ENV === 'development';
global.serverPort = process.env.PORT || 8000;

import Fastify from 'fastify';
import cluster from 'cluster';
import os from 'os';
import fs, { glob } from 'fs';
import net from 'net';
import { loadModules, discoverModules } from './loader.js';
import { initializeAuth, authStatusHandler } from './auth.js';
import { initializeRegistration, initializeRegistrationSync } from './register.js';

// Configurações do cluster
const CLUSTER_ENABLED = process.env.CLUSTER_ENABLED !== 'false'; // Default: true

if (global.isDev) {
	// Modo de desenvolvimento: desabilitar cluster e logs detalhados
	console.log('🔧 Running in development mode - cluster disabled, detailed logs enabled')
	global.showRequestLogs = true;
}

// Estratégia inteligente de workers: otimizada para ambiente
function calculateOptimalWorkers() {
	const cpuCount = os.cpus().length;
	
	if (process.env.NUM_WORKERS) {
		// Se especificado manualmente, usar o valor
		return parseInt(process.env.NUM_WORKERS);
	}
	
	// Detectar ambiente
	const isWSL = process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP;
	const isContainer = process.env.container || fs.existsSync('/.dockerenv');
	const isDev = global.isDev;

//	return 4;

	if (isWSL || isDev) {
		// WSL ou Dev: usar apenas 2 CPUs
		//return Math.min(2, cpuCount);
		return Math.max(1, cpuCount - 1);
	} else if (isContainer) {
		// Container: usar n-2 (reservar 2 cores)
		return Math.max(1, cpuCount - 2);
	} else {
		// Outros ambientes: usar n-1 (reservar 1 core)
		return Math.max(1, cpuCount - 1);
	}
}

const NUM_WORKERS = calculateOptimalWorkers();
const version = global.version;

/**
 * Verifica se a porta está em uso
 */
function checkPortInUse(port) {
	return new Promise((resolve) => {
		const server = net.createServer();
		
		server.listen(port, () => {
			server.once('close', () => {
				resolve(false); // Porta livre
			});
			server.close();
		});
		
		server.on('error', () => {
			resolve(true); // Porta em uso
		});
	});
}

// Implementação do Cluster
if (CLUSTER_ENABLED && cluster.isPrimary) {
	console.log(`🚀 ISP.Tools Probe v${version} - Cluster Mode`);
	console.log('');
	
	let serverPort = global.serverPort;
	checkPortInUse(serverPort).then(inUse => {
		if (inUse) {
			console.error(`❌ Port ${serverPort} is already in use. Please stop the other instance or use a different port.`);
			console.log(`💡 To kill processes using port ${serverPort}: sudo lsof -ti:${serverPort} | xargs kill -9`);
			process.exit(1);
		}
		
		// Primeiro: Registrar a probe (apenas master)
		initializeMasterProcess().catch(error => {
			console.error('❌ Fatal error during initialization:', error.message);
			process.exit(1);
		});
	});
	
} else {
	// Worker process ou modo single-thread
	startWorker();
}

/**
 * Inicializa o processo master: autenticação -> descoberta de módulos -> cluster
 */
async function initializeMasterProcess() {
	try {
		// 1. Inicializar autenticação baseada em IP
		await initializeAuth();
		console.log(''); // Linha em branco

		// 2. Registro será feito após o servidor subir (no(s) worker(s))
		// Mantemos apenas a autenticação aqui no master
		
		// 3. Descobrir módulos disponíveis (cache para workers)
		const discoveryStartTime = Date.now();
		const discoveredModules = discoverModules();
		const discoveryEndTime = Date.now();
		console.log(`📦 Discovered ${discoveredModules.length} modules (${discoveryEndTime - discoveryStartTime}ms)`);
		
		// 4. Iniciar cluster (workers usarão cache de descoberta)
		const clusterStartTime = Date.now();
		console.log(`🔧 Starting ${NUM_WORKERS} workers...`);
		await startCluster(clusterStartTime);
		
	} catch (error) {
		console.error('❌ Failed to initialize master process:', error.message);
		process.exit(1);
	}
}

/**
 * Mostra o banner de conclusão após todos os workers estarem prontos
 */
async function showCompletionBanner(totalClusterTime) {
	// Exibir informações da autenticação baseada em IP

	console.log('');
	console.log(`📊 Cluster Status:`);
	console.log(`   • Workers: ${NUM_WORKERS} active`);
	console.log(`   • Port: ${process.env.PORT || 8000}`);
	console.log(`   • Process ID: ${process.pid}`);
	console.log(`   • Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
	console.log(`   • Total startup time: ${totalClusterTime}ms`);
	console.log(`   • IPv4 Support: ${global.ipv4Support ? 'Enabled' : 'Disabled'}`);
	console.log(`   • IPv6 Support: ${global.ipv6Support ? 'Enabled' : 'Disabled'}`);
	console.log('');
	console.log('  ___ ___ ___ _____         _    ');
	console.log(' |_ _/ __| _ \\_   _|__  ___| |___');
	console.log('  | |\\__ \\  _/ | |/ _ \\/ _ \\ (_-<');
	console.log(' |___|___/_|(_)|_|\\___/\\___/_/__/');
	console.log('');
	console.log('- ISP.Tools Probe');
	console.log('  Version ' + global.version);
	console.log('  Copyright © 2025 Giovane Heleno - www.giovane.pro.br');
	console.log('');
		
	console.log('🚀 Go to www.isp.tools to access the dashboard');
	console.log('');
}

/**
 * Inicia o cluster de workers
 */
async function startCluster(clusterStartTime) {
	// Configurar worker ID base para evitar conflitos de ICMP ID
	let workerIdCounter = 0;
	let readyWorkers = 0;
	
	// Criar workers sem delay
	for (let i = 0; i < NUM_WORKERS; i++) {
		const worker = cluster.fork();
		worker.workerStartId = ++workerIdCounter;
		worker.workerForkTime = Date.now(); // Marcar quando o worker foi criado
		
		worker.on('message', (msg) => {
			if (msg.type === 'worker-ready') {
				const totalTimeFromClusterStart = Date.now() - clusterStartTime;
				const timeFromFork = Date.now() - worker.workerForkTime;
				const loadTimeInfo = msg.loadTimeMs ? ` (loaded in ${msg.loadTimeMs}ms)` : '';
				const forkTimeInfo = ` (fork: ${timeFromFork}ms, total: ${totalTimeFromClusterStart}ms)`;
				console.log(`✅ Worker ${worker.process.pid} ready (ID: ${worker.workerStartId})${loadTimeInfo}${forkTimeInfo}`);
				readyWorkers++;
				
				// Quando todos os workers estiverem prontos, mostrar logo e copyright
				if (readyWorkers === NUM_WORKERS) {
					const totalClusterTime = Date.now() - clusterStartTime;
					showCompletionBanner(totalClusterTime);
				}				
			}
		});
	}
	
	// Handle worker deaths
	let shuttingDown = false;
	
	cluster.on('exit', (worker, code, signal) => {
		if (!shuttingDown) {
			console.log(`❌ Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
			const newWorker = cluster.fork();
			newWorker.workerStartId = ++workerIdCounter;
		}
	});
	
	// Immediate shutdown - sem graceful restart
	process.on('SIGTERM', () => {
		console.log('🛑 Master received SIGTERM, shutting down immediately...');
		shuttingDown = true;
		// Force exit after 2 seconds if not closed gracefully
		setTimeout(() => {
			console.log('🛑 Force exit after timeout');
			process.exit(1);
		}, 2000);
		process.exit(0);
	});
	
	process.on('SIGINT', () => {
		console.log('🛑 Master received SIGINT, shutting down immediately...');
		shuttingDown = true;
		// Force exit after 2 seconds if not closed gracefully
		setTimeout(() => {
			console.log('🛑 Force exit after timeout');
			process.exit(1);
		}, 2000);
		process.exit(0);
	});
}

function startWorker() {
	// Configurar ID único para este worker (evita conflitos de ICMP)
	const workerId = cluster.worker?.id || 1;
	global.workerBaseId = workerId * 1000; // Range de 1000 IDs por worker
	global.sID = global.workerBaseId; // Iniciar sID no range do worker
	global.loadedModules = []; // Para armazenar módulos carregados

	// Configuração da aplicação Fastify - ULTRA otimizada para alta performance
	const fastify = Fastify({
		logger: false, // Completamente desabilitado para máxima performance
		trustProxy: true,
		// Configurações de performance críticas para alta carga
		maxParamLength: 256, // Ajustado para suportar parâmetros dos módulos
		bodyLimit: 512000, // 512KB - reduzido, suficiente para a aplicação
		keepAliveTimeout: 65000, // 65 segundos - padrão HTTP/1.1
		connectionTimeout: 10000, // 10 segundos - aumentado para estabilidade
		pluginTimeout: 10000, // 10 segundos
		requestIdHeader: false,
		requestIdLogLabel: false,
		genReqId: false,
		// Configurações críticas para roteamento rápido
		caseSensitive: true, // Mais rápido que false
		ignoreTrailingSlash: true,
		ignoreDuplicateSlashes: true,
		maxRequestsPerSocket: 0, // Sem limite
		// Configurações de parsing otimizadas
		jsonLimit: 512000, // 512KB
		formLimit: 512000, // 512KB
		// Configurações HTTP/2
		http2SessionTimeout: 72000000, // 20 horas
		// Configurações adicionais de performance
		onProtoPoisoning: 'ignore', // Ignora prototype poisoning para performance
		onConstructorPoisoning: 'ignore' // Ignora constructor poisoning
	});

	const login = false;

	// Hook ultra-otimizado - APENAS headers e debug
	fastify.addHook('onRequest', async (request, reply) => {
		// Headers globais - aplicados individualmente para melhor performance
		reply.header('X-powered-by', 'ISP.Tools');
		reply.header('X-author', 'Giovane Heleno - www.giovane.pro.br');
		reply.header('X-version', version);
		reply.header('Server', 'ISP.Tools Probe');
		reply.header('Access-Control-Allow-Origin', '*');
		reply.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');

		// Log otimizado apenas se habilitado
		if (global.showRequestLogs) {
			const now = new Date();
			const hora = now.toISOString().substring(0, 19).replace('T', ' ');
			const ipremoto = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
			console.log(`📥 ${hora} - ${ipremoto} - ${request.method} ${request.url}`);
		}

	});

	/**
	 * Schema para rota principal
	 */
	const homeSchema = {
		response: {
			200: {
				type: 'object',
				properties: {
					version: { type: 'string' },
					updated: { type: 'boolean' },
					auth: { type: 'boolean' },
					pid: { type: 'number' },
					workerId: { type: ['number', 'string'] },
					workerBaseId: { type: 'number' },
					clusterEnabled: { type: 'boolean' },
					numWorkers: { type: 'number' },
					memory: { 
						type: 'object',
						properties: {
							rss: { type: 'number' },
							heapTotal: { type: 'number' },
							heapUsed: { type: 'number' },
							external: { type: 'number' },
							arrayBuffers: { type: 'number' }
						}
					},
					uptime: { type: 'number' },
					timestamp: { type: 'number' },
					responseTimeMs: { type: 'number' },
					modules: {
						type: 'array',
						items: { type: 'string' }
					}	,
					network: {
						type: 'object',
						properties: {
							ipv4Support: { type: 'boolean' },
							ipv6Support: { type: 'boolean' }
						}
					}
				}
			}
		}
	};

	/**
	 *    HOME
	 *
	 *    @date   2014-03-10
	 *
	 *    @author Giovane Heleno - www.giovane.pro.br
	 *
	 *    @param  {[type]}   request
	 *    @param  {[type]}   reply
	 *
	 *    @return {[type]}
	 */
	fastify.get('/', { schema: homeSchema }, async (request, reply) => {
		const startTime = process.hrtime.bigint();
		
		// Cache memory info para evitar chamadas frequentes - atualiza a cada 100ms
		const now = Date.now();
		if (!global.memoryCache || (now - global.memoryCache.timestamp) > 100) {
			global.memoryCache = {
				memory: process.memoryUsage(),
				timestamp: now
			};
		}
		
		const response = {
			version: version,
			updated: global.updated,
			auth: login,
			pid: process.pid,
			systemID: global.systemID || null, // Adiciona o ID do sistema
			workerId: cluster.worker?.id || 'master',
			workerBaseId: global.workerBaseId || 0,
			clusterEnabled: CLUSTER_ENABLED,
			numWorkers: NUM_WORKERS, // Já é número, não precisa converter
			memory: global.memoryCache.memory,
			uptime: process.uptime(),
			timestamp: now,
			responseTimeMs: Number(process.hrtime.bigint() - startTime) / 1000000, // Converte nanosegundos para milissegundos
			modules: global.loadedModules.map(mod => mod.module) || [],
			network: {
				ipv4Support: global.ipv4Support,
				ipv6Support: global.ipv6Support
			}
		};
		

		// Retorna JSON formatado. Somente este endpoint.
		reply.type('application/json');
		return JSON.stringify(response, null, 2);
	});

	/**
	 * Schema para auth status
	 */
	const authStatusSchema = {
		response: {
			200: {
				type: 'object',
				properties: {
					hasValidKeys: { type: 'boolean' },
					keyCount: { type: 'number' },
					authRequired: { type: 'boolean' },
					message: { type: 'string' }
				}
			}
		}
	};

	/**
	 *    Auth status endpoint
	 */
	fastify.get('/auth/status', { schema: authStatusSchema }, authStatusHandler);

	/**
	 * Schema para health check
	 */
	const healthSchema = {
		response: {
			200: {
				type: 'object',
				properties: {
					status: { type: 'string' },
					version: { type: 'string' },
					timestamp: { type: 'string' }
				}
			}
		}
	};

	/**
	 *    Health check endpoint for Docker
	 */
	fastify.get('/health', { schema: healthSchema }, async (request, reply) => {
		return {
			status: 'ok',
			version: global.version,
			timestamp: new Date().toISOString()
		};
	});

	/**
	 *    Server initialization
	 */
	const start = async () => {
		try {
			// Se não é cluster (single-thread), fazer apenas autenticação aqui
			// O registro será executado depois que o servidor estiver escutando
			if (!cluster.worker) {
				await initializeAuth();
			}
			
			// Marcar início do carregamento para debug
			const loadStartTime = Date.now();

			// Carregar módulos ANTES de iniciar o servidor
			// Usar flag isWorker para reduzir logs desnecessários
			const loadedModules = await loadModules(fastify, true); // true = isWorker para reduzir logs
			global.loadedModules = loadedModules; // Armazenar na variável global
			
			const loadEndTime = Date.now();
			
			const serverPort = process.env.PORT || 8000;
			global.serverPort = serverPort; // Disponibiliza a porta globalmente
			
			await fastify.listen({ 
				port: serverPort, 
				host: '0.0.0.0' 
			});

			// Após o servidor estar escutando, executar o registro
			// Em cluster: apenas o worker 1 registra para evitar duplicidade
			if ((cluster.worker && cluster.worker.id === 1) || !cluster.worker) {
				// initializeRegistration: não bloqueia; initializeRegistrationSync: aguarda sucesso
				// Usamos a versão assíncrona que faz retry em background
				initializeRegistration();
			}

			// Configuração otimizada para proxy persistente
			const serverConfig = {
				keepAliveTimeout: 7200000,    // 2 horas
				headersTimeout: 7200100,      // 2 horas + buffer
				requestTimeout: 300000,       // 5 minutos para requisições individuais
				maxHeadersCount: 1000,        // Headers permitidos
				maxRequestsPerSocket: 0       // Sem limite de requests por socket
			};

			// Aplicar configurações ao servidor
			fastify.server.keepAliveTimeout = serverConfig.keepAliveTimeout;
			fastify.server.headersTimeout = serverConfig.headersTimeout;
			fastify.server.requestTimeout = serverConfig.requestTimeout;
			fastify.server.maxHeadersCount = serverConfig.maxHeadersCount;
			fastify.server.maxRequestsPerSocket = serverConfig.maxRequestsPerSocket;

			// Workers não fazem registro - já foi feito pelo master
			
			// Notificar o master que o worker está pronto
			if (cluster.worker) {
				process.send({ 
					type: 'worker-ready', 
					workerId: cluster.worker.id,
					loadTimeMs: loadEndTime - loadStartTime
				});
			} else {
				// Se não é cluster, mostrar banner completo para modo single-thread
				const totalTime = loadEndTime - loadStartTime;
				showCompletionBanner(totalTime);
			}
		} catch (err) {
			fastify.log.error(err);
			process.exit(1);
		}
	};

	start();

	// Graceful shutdown handlers
	const gracefulShutdown = async (signal) => {
		try {
			if (cluster.worker) {
				console.log(`🛑 Worker ${cluster.worker.id} received ${signal}, shutting down immediately`);
			} else {
				console.log(`🛑 ${signal} received, shutting down immediately`);
			}
			
			await fastify.close();
			process.exit(0);
		} catch (err) {
			console.error('Error during shutdown:', err);
			process.exit(1);
		}
	};

	// Immediate shutdown for workers
	if (!process.listeners('SIGTERM').length) {
		process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
	}

	if (!process.listeners('SIGINT').length) {
		process.on('SIGINT', () => gracefulShutdown('SIGINT'));
	}

} // Fecha a função startWorker