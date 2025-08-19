module.exports = {
  apps: [{
    name: 'isp-probe',
    script: 'main.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 8000,
      SHOW_REQUEST_LOGS: 'true'
    },
    // Configurações de restart
    max_memory_restart: '1G',
    health_check_grace_period: 3000,
    kill_timeout: 5000
  }]
}
