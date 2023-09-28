# ----------------------------------------------------------------
# Arquivo Dockerfile para construção de imagem do ISP.Tools Probe
# ----------------------------------------------------------------
# Autor: Giovane Heleno
# Data: 2023-09-28
# Versão: 2.0
# ----------------------------------------------------------------
# Instruções:
# 1. Copie o arquivo Dockerfile para o diretório raiz do projeto
# 2. Execute o comando abaixo para construir a imagem:
#    docker build -t isp.tools/probe:2.0 .
# 3. Execute o comando abaixo para iniciar o container:
#    docker run --network -d --name isp.tools-probe isp.tools/probe:2.0
# ----------------------------------------------------------------

# Use uma imagem Node.js LTS como base
FROM node:16-slim

# Define metadados
LABEL maintainer="giovane@isp.tools"
LABEL version="2.0"
LABEL description="ISP.Tools Probe Module"

# Instala ferramentas necessárias
# Instala Python e outras dependências
RUN apt-get update && apt-get install -y python3 python3-pip build-essential && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y cron jq && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos do projeto
COPY . .

# Instala as dependências do projeto
RUN npm install
RUN npm install -g pm2

# Adiciona o script de atualização e dá permissão de execução
COPY docker-files/atualizacao.sh /usr/local/bin/atualizacao.sh
RUN chmod +x /usr/local/bin/atualizacao.sh

# Configura o cron job para executar o script de atualização a cada hora
RUN (echo "0 * * * * /usr/local/bin/atualizacao.sh") | crontab -

# Inicia o cron em background e a aplicação com PM2
CMD cron && pm2-runtime npm -- start

