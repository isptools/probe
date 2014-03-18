#!/bin/bash
clear
echo "-------------------------------------------------------------------------"
echo "Instalando SUDO"
apt-get update
apt-get install sudo
echo "OK"
echo "-------------------------------------------------------------------------"
echo "Preparando diretório"
rm -r /opt/tklweb-cp
mkdir /opt/tklweb-cp
cd /opt/tklweb-cp
echo "OK"
echo "-------------------------------------------------------------------------"
echo "Atualizando Node.js"
npm install -g n
echo "OK"
n stable
echo "OK"
echo "-------------------------------------------------------------------------"
echo "Baixando ISPTools"
git init
echo "OK"
git pull https://giovaneh@bitbucket.org/giovaneh/isptools.git
echo "OK"
echo "-------------------------------------------------------------------------"
echo "Interrompendo instâncias Node.js fantasmas"
killall node
echo "OK"
echo "-------------------------------------------------------------------------"
echo "Instalando PM2"
npm install pm2 -g
echo "OK"
echo "-------------------------------------------------------------------------"
echo "Startando PM2"
rm /etc/init.d/pm2-init.sh
pm2 dump
pm2 delete all
pm2 kill
pm2 start app.js -i max --name ISPTools
pm2 web
echo "OK"
echo "-------------------------------------------------------------------------"
echo "Daemon PM2"
pm2 -f startup ubuntu
echo "OK"
echo "-------------------------------------------------------------------------"
echo "FIM"

## wget -qO- https://bitbucket.org/giovaneh/isptools/raw/master/install.sh | sh

