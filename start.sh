#!/bin/bash
clear
echo "Updating ISP Tools - www.isptools.com.br" | wall
rm /etc/init.d/pm2-init.sh
killall node
pm2 kill
git fetch
git pull origin master
pm2 start app.js -x -f -i 1 --name ISPTools
pm2 -f startup ubuntu
echo "Update completed! - www.isptools.com.br" | wall
echo "OK"
