import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cache global de descoberta de módulos (compartilhado)
let moduleDiscoveryCache = null;

/**
 * Descobre quais módulos estão disponíveis (executa uma vez no master)
 */
export function discoverModules() {
	if (moduleDiscoveryCache) {
		return moduleDiscoveryCache;
	}

	const modulesDir = path.join(__dirname, 'modules');
	
	try {
		if (!fs.existsSync(modulesDir)) {
			moduleDiscoveryCache = [];
			return moduleDiscoveryCache;
		}

		const modules = fs.readdirSync(modulesDir, { withFileTypes: true });
		
		moduleDiscoveryCache = modules
			.filter(module => {
				if (module.isDirectory()) {
					const modulePath = path.join(modulesDir, module.name, 'main.js');
					return fs.existsSync(modulePath);
				}
				return false;
			})
			.map(module => ({
				name: module.name,
				path: `./modules/${module.name}/main.js`
			}));

		return moduleDiscoveryCache;
	} catch (error) {
		console.error('❌ Error discovering modules:', error.message);
		moduleDiscoveryCache = [];
		return moduleDiscoveryCache;
	}
}

/**
 * Carrega módulos rapidamente usando cache de descoberta
 */
export async function loadModules(fastify, isWorker = false) {
	try {
		// Usar cache de descoberta (muito rápido)
		const availableModules = discoverModules();
		
		if (availableModules.length === 0) {
			if (!isWorker) console.log('📦 No modules found');
			return [];
		}

		const loadedModules = [];

		// Carregar módulos em paralelo (só os que sabemos que existem)
		const modulePromises = availableModules.map(async (moduleInfo) => {
			try {
				// Import direto usando path do cache
				const moduleFile = await import(moduleInfo.path);
				const moduleEndpoints = [];

				// Processar exportações
				for (const [exportName, endpoint] of Object.entries(moduleFile)) {
					if (endpoint && endpoint.route && endpoint.method && endpoint.handler) {
						moduleEndpoints.push({
							exportName,
							endpoint,
							module: moduleInfo.name
						});
					}
				}

				return {
					name: moduleInfo.name,
					success: moduleEndpoints.length > 0,
					endpoints: moduleEndpoints,
					error: null
				};
			} catch (error) {
				return {
					name: moduleInfo.name,
					success: false,
					endpoints: [],
					error: error.message
				};
			}
		});

		// Aguardar carregamento paralelo
		const moduleResults = await Promise.all(modulePromises);

		// Registrar no Fastify sequencialmente
		for (const result of moduleResults) {
			if (result.success) {
				for (const { exportName, endpoint, module } of result.endpoints) {
					try {
						const fastifyOptions = {
							preHandler: endpoint.middleware || []
						};
						
						fastify[endpoint.method.toLowerCase()](endpoint.route, fastifyOptions, endpoint.handler);
						
						loadedModules.push({
							module: module,
							endpoint: exportName,
							route: endpoint.route,
							method: endpoint.method.toUpperCase(),
							hasMiddleware: !!(endpoint.middleware && endpoint.middleware.length > 0)
						});
					} catch (regError) {
						if (!isWorker) console.error(`❌ Error registering endpoint ${exportName} from ${module}:`, regError.message);
					}
				}
			} else {
				if (!isWorker && result.error) {
					console.error(`❌ Error loading module ${result.name}:`, result.error);
				}
			}
		}

		return loadedModules;
	} catch (error) {
		if (!isWorker) console.error('❌ Error loading modules:', error.message);
		return [];
	}
}
