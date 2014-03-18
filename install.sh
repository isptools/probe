#!/bin/bash
clear
echo "Instalando ISPTools"
cd /opt/tklweb-cp
echo "Limpando pastas"
rm -r *
echo "OK"
echo "Atualizando Node.js"
npm install -g n
n stable
echo "OK"
echo "Baixando ISPTools"
git init
git pull https://giovaneh@bitbucket.org/giovaneh/isptools.git
echo "OK"
echo "Iniciando Node.js"
killall node
npm install pm2 -g
pm2 start app.js -i max --name ISPTools
pm2 startup ubuntu
echo "OK"
echo "FIM"

## wget -qO- https://bitbucket.org/giovaneh/isptools/raw/master/install.sh | sh