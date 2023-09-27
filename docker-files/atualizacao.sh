#!/bin/bash

# Nome da imagem
IMAGEM="isptools/isptools"
DIRETORIO_APLICACAO="/app"

# Obtém a versão atual do container
VERSAO_CONTAINER=$(docker inspect $IMAGEM | jq -r '.[0].Config.Labels.version')

# Obtém a versão do arquivo hospedado
VERSAO_HOSPEDADA=$(curl -L -s http://isp.tools/version)

# Se as versões forem diferentes, faz as atualizações necessárias
if [ "$VERSAO_CONTAINER" != "$VERSAO_HOSPEDADA" ]; then
    # Faz o pull da imagem mais recente
    docker pull $IMAGEM

    # Navega para o diretório da aplicação
    cd $DIRETORIO_APLICACAO

    # Executa npm install
    npm install

    # Recarrega (ou inicia) a aplicação com PM2
    pm2 reload nome_da_aplicacao --update-env
fi
