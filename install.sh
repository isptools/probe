#!/bin/bash
clear
echo "Instalando ISPTools"
cd /opt/tklweb-cp
rm -r *
npm install -g n
n stable
git init
git pull https://giovaneh@bitbucket.org/giovaneh/isptools.git
killall node
npm install pm2 -g
pm2 start app.js -i max --name ISPTools
pm2 startup ubuntu

## wget -qO- https://bitbucket.org/giovaneh/isptools/raw/master/install.sh | sh