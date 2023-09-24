// --------------------------------
//Configurações do PM2 para o ISP.Tools

module.exports = {
    apps: [{
      name: 'ISP.Tools',
      script: './app.js',
      instances: 'max', // Usa o máximo de núcleos de CPU disponíveis
      exec_mode: 'cluster', // Ativa o modo de cluster
      autorestart: true, // Reinicia automaticamente em caso de falha
      watch: false, // Observa mudanças nos arquivos para reiniciar
      max_memory_restart: '1G', // Reinicia se o uso de memória exceder 1GB
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      },
      log_date_format: 'YYYY-MM-DD HH:mm Z', // Formato da data para os logs
      log_file: './logs/isptools.log', // Combina logs de erro e saída
      max_size: '100M', // Limita o tamanho do log a 100MB
      combine_logs: true, // Combina logs de diferentes instâncias
      merge_logs: true // Mescla logs em ordem cronológica
    }]
};
