module.exports = {
  apps: [{
    name: 'isp-probe',
    script: 'main.js',
    instances: 'max',
    exec_mode: 'cluster',

    watch: true,
    watch_options: {
      followSymlinks: false,
      usePolling: false,
      interval: 1000
    },
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      '.pm2',
      '.vscode',
      'test',
      'test.yml',
      'build.sh',
      'Dockerfile*',
      'README.md',
      '*.log',
      '*.pid',
      'package-lock.json',
      '.gitignore',
      '.dockerignore'
    ],

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
