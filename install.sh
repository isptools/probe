#!/bin/bash
clear
echo "-------------------------------------------------------------------------"
echo "Instalando componentes necessários do Sistema Operacional"
echo "-------------------------------------------------------------------------"

        apt-get update
        hash sudo 2>/dev/null || { apt-get -y install sudo; }
        hash at 2>/dev/null || { apt-get -y install at; }
        hash make 2>/dev/null || { apt-get -y install make; }
        sudo apt-get -y install git-core build-essential openssl libssl-dev pkg-config

echo "OK"
echo "-------------------------------------------------------------------------"
echo "Atualizando Data/Hora"
echo "-------------------------------------------------------------------------"

        date
        echo "America/Sao_Paulo" | sudo tee /etc/timezone
        sudo dpkg-reconfigure --frontend noninteractive tzdata
        hash ntpdate 2>/dev/null || { apt-get -y install ntpdate; }
        ntpdate pool.ntp.br
        date

echo "OK"
echo "-------------------------------------------------------------------------"
echo "Instalando Node.js"
echo "-------------------------------------------------------------------------"

        wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.24.0/install.sh | bash
        nvm install 0.10

echo "OK"
echo "-------------------------------------------------------------------------"
echo "Preparando diretório"
echo "-------------------------------------------------------------------------"

        rm -r /var/www/isptools
        rm -r /opt/tklweb-cp
        mkdir -p /var/www/isptools
        cd /var/www/isptools

echo "OK"
echo "-------------------------------------------------------------------------"
echo "Baixando ISPTools"
echo "-------------------------------------------------------------------------"

        git init
        git remote rm origin
        #git remote add origin https://giovaneh@bitbucket.org/giovaneh/isptools.git
        git remote add origin https://github.com/giovaneh/isptools.git
        git pull origin master

        hash pm2 2>/dev/null || { npm i -g pm2 --unsafe-perm; }
        npm install --unsafe-perm

echo "OK"
echo "-------------------------------------------------------------------------"
echo "Iniciando ISP Tools"
echo "-------------------------------------------------------------------------"

        pm2 kill
        pm2 start app.js -x -f -i 1 --name ISPTools
        pm2 -f startup ubuntu

echo "OK"

echo "-------------------------------------------------------------------------"
echo "FIM - www.isptools.com.br"
echo "-------------------------------------------------------------------------"
echo "Acesse o endereço abaixo para concluir o processo:"
echo ""
echo "http://www.isptools.com.br/cadastro"
echo ""
echo "Obrigado!"
echo "Giovane Heleno"
echo "-------------------------------------------------------------------------"

## wget -qO- https://bitbucket.org/giovaneh/isptools/raw/master/install.sh | sh

