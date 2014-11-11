#!/bin/bash
clear
echo "-------------------------------------------------------------------------"
echo "Instalando componentes necessários do Sistema Operacional"
echo "-------------------------------------------------------------------------"

        apt-get update
        apt-get -y install build-essential
        hash sudo 2>/dev/null || { apt-get -y install sudo; }
        hash at 2>/dev/null || { apt-get -y install at; }
        hash git 2>/dev/null || { apt-get -y install git; }
        hash make 2>/dev/null || { apt-get -y install make; }

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
echo "Preparando diretório"
echo "-------------------------------------------------------------------------"

        rm -r /var/www/isptools
        rm -r /opt/tklweb-cp
        mkdir -p /var/www/isptools
        cd /var/www/isptools

echo "OK"
echo "-------------------------------------------------------------------------"
echo "Instalando Node.js"
echo "-------------------------------------------------------------------------"


        if hash npm 2>/dev/null; then
                npm cache clean
                npm install -g n
                n stable        
        else
                sudo apt-get -y install python-software-properties
                sudo add-apt-repository ppa:chris-lea/node.js
                sudo apt-get update
                sudo apt-get -y install nodejs
        fi


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

