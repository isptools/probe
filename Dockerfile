FROM mhart/alpine-node:6

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json /usr/src/app/

RUN apk add --no-cache --virtual .build-deps make gcc g++ python && \
    npm install && \
    npm install pm2@^3 -g && \
    npm cache clean && \
    apk del .build-deps

# Bundle app source
COPY . /usr/src/app

EXPOSE 8000

CMD [ "pm2-docker", "app.js" ]
