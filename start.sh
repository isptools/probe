#!/bin/bash
clear
echo "Updating ISP Tools - www.isptools.com.br" | wall


hash sudo 2>/dev/null || { apt-get install sudo; }
hash at 2>/dev/null || { apt-get install at; }
hash git 2>/dev/null || { apt-get install git; }

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


npm cache clean
npm install -g n
n stable

npm install --unsafe-perm

pm2 start app.js -x -f -i 1 --name ISPTools
pm2 -f startup ubuntu

echo "Update completed! - www.isptools.com.br" | wall
echo "OK"
