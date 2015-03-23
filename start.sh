#!/bin/bash
clear
echo "Updating ISP Tools - www.isptools.com.br" | wall


hash sudo 2>/dev/null || { apt-get -y install sudo; }
hash at 2>/dev/null || { apt-get -y install at; }
hash git 2>/dev/null || { apt-get -y install git; }

rm -f /etc/init.d/pm2-init.sh
killall node

if hash pm2 2>/dev/null; then
        pm2 kill
else
        npm i -g pm2 --unsafe-perm
fi

rm node_modules/ -R
git remote rm origin
git remote add origin https://github.com/giovaneh/isptools.git
git fetch --all
git reset --hard origin/master

cd /usr/local/src
sudo git clone git://github.com/joyent/node.git
cd node
sudo git checkout v0.10.33

cd /var/www/isptools
npm install --unsafe-perm

pm2 start app.js -x -f -i 1 --name ISPTools
pm2 -f startup ubuntu

echo "Update completed! - www.isptools.com.br" | wall
echo "OK"
