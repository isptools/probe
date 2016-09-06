#!/bin/bash

echo "-------------------------------------------------------------------------"
echo "Instalando componentes necessários do Sistema Operacional"
echo "-------------------------------------------------------------------------"

  apt-get update
  hash sudo 2>/dev/null || { apt-get -y install sudo; }
  hash curl 2>/dev/null || { apt-get -y install curl; }
  hash make 2>/dev/null || { apt-get -y install make; }
  hash python 2>/dev/null || { apt-get -y install python; }
  hash g++ 2>/dev/null || { apt-get -y install g++; }
  sudo apt-get -y install git-core build-essential openssl libssl-dev pkg-config python-software-properties software-properties-common

echo "-------------------------------------------------------------------------"
echo "Removendo versão Legada do nodejs, npm e pm2"
echo "-------------------------------------------------------------------------"
  
  
  hash npm 2>/dev/null || { 
    sudo npm uninstall npm -g; 
    rm -rf /usr/local/{lib/node{,/.npm,_modules},bin,share/man}/npm*;
  }

clear
echo "-------------------------------------------------------------------------"
echo "Preparando diretório"
echo "-------------------------------------------------------------------------"

  sudo rm -r /var/www/isptools/
  sudo mkdir /var/www/isptools/
  cd /var/www/isptools/

echo "OK"
clear
echo "-------------------------------------------------------------------------"
echo "Instalando Node.js"
echo "-------------------------------------------------------------------------"

  curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
  sudo apt-get install -y nodejs
  cd /
  npm install -g n
  
clear
echo "-------------------------------------------------------------------------"
echo "Preparando diretório"
echo "-------------------------------------------------------------------------"

        rm -r /var/www/isptools
        rm -r /opt/tklweb-cp
        mkdir -p /var/www/isptools
        cd /var/www/isptools
echo "-------------------------------------------------------------------------"
echo "Baixando ISPTools"
echo "-------------------------------------------------------------------------"

  git init
  git remote add origin https://github.com/giovaneh/isptools.git
  git pull origin master
  npm install --unsafe-perm
  
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
  sudo pm2 start /var/www/isptools/app.js -x -f -i 1 --name ISPTools

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
