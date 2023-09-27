# Use uma imagem Node.js LTS como base
FROM node:16-slim

# Define metadados
LABEL maintainer="giovane@isp.tools"
LABEL version="2.0"
LABEL description="ISP.Tools Probe Module"

# Instala ferramentas necessárias
RUN apt-get update && apt-get install -y cron jq && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos do projeto
COPY ../. .

# Instala as dependências do projeto
RUN npm install

# Adiciona o script de atualização e dá permissão de execução
COPY docker-files/atualizacao.sh /usr/local/bin/atualizacao.sh
RUN chmod +x /usr/local/bin/atualizacao.sh

# Configura o cron job para executar o script de atualização a cada hora
RUN (echo "0 * * * * /usr/local/bin/atualizacao.sh") | crontab -

# Inicia o cron em background e a aplicação com PM2
CMD cron && pm2-runtime start nome_da_aplicacao
