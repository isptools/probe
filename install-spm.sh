#!/bin/bash

clear
echo "-------------------------------------------------------------------------"
echo "Preparando diretório"
sudo rm -r /opt/tklweb-cp
sudo mkdir /opt/tklweb-cp
cd /opt/tklweb-cp
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Instalando Node.js"
echo "-------------------------------------------------------------------------"
sudo apt-get install python-software-properties
sudo add-apt-repository ppa:chris-lea/node.js
sudo apt-get update
sudo apt-get install python-software-properties python g++ make nodejs
hash -r
npm install -g n
clear
echo "-------------------------------------------------------------------------"
echo "Baixando ISPTools"
echo "-------------------------------------------------------------------------"
apt-get install git
git init
git remote add origin https://giovaneh@bitbucket.org/giovaneh/isptools.git
git pull origin master
npm install
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Instalando PM2"
echo "-------------------------------------------------------------------------"
npm install pm2 -g
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Startando PM2"
echo "-------------------------------------------------------------------------"
rm /etc/init.d/pm2-init.sh
pm2 kill
sudo pm2 start app.js -x -f -i 1 --name ISPTools
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Daemon PM2"
echo "-------------------------------------------------------------------------"
sudo pm2 -f startup ubuntu
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "FIM - www.isptools.com.br"
echo "-------------------------------------------------------------------------"
echo "Agora nos envie um email para que possamos adicionar ao site."
echo "contato@isptools.com.br"
echo ""
echo "Obrigado!"
echo "Giovane Heleno"
echo "-------------------------------------------------------------------------"

## wget -qO- https://bitbucket.org/giovaneh/isptools/raw/master/install.sh | sh

