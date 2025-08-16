#!/bin/bash
cd /app

# Faz o pull e verifica se houve alterações
if ! git pull origin main | grep -q 'Already up to date.'; then
    echo "Atualizações encontradas. Reiniciando a aplicação..."
    pm2 restart probe-isptools
fi
