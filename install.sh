#!/bin/bash
clear
echo "-------------------------------------------------------------------------"
echo "Instalando SUDO"
apt-get update
apt-get install sudo
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Atualizando Data/Hora"
date
echo "America/Sao_Paulo" | sudo tee /etc/timezone
sudo dpkg-reconfigure --frontend noninteractive tzdata
ntpdate pool.ntp.br
date
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Preparando diretório"
rm -r /opt/tklweb-cp
mkdir /opt/tklweb-cp
cd /opt/tklweb-cp
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Atualizando Node.js"
echo "-------------------------------------------------------------------------"
npm install -g n
echo "OK"
n stable
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Baixando ISPTools"
echo "-------------------------------------------------------------------------"
git init
git remote add origin https://giovaneh@bitbucket.org/giovaneh/isptools.git
git pull origin master
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Interrompendo instâncias Node.js fantasmas"
echo "-------------------------------------------------------------------------"
killall node
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
pm2 start app.js -x -f -i 1 --name ISPTools
echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Daemon PM2"
echo "-------------------------------------------------------------------------"
pm2 -f startup ubuntu
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

