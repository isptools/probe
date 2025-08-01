FROM node:lts-bullseye-slim

LABEL maintainer="Giovane Heleno" \
      version="2.1.4" \
      description="ISP Tools Probe - Network diagnostic tools"

# Copiar apenas package.json e package-lock.json primeiro
COPY package*.json ./

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y git wget python3 build-essential && \
    apt-get install -y --no-install-recommends dumb-init && \
    npm install -g npm@latest pm2 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV PYTHON=/usr/bin/python3

# Instalar dependências primeiro
RUN npm ci --omit=dev

# Copiar o resto dos arquivos
COPY . /app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=10 \
    CMD wget --no-verbose --tries=1 --spider http://0.0.0.0:8000/ || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["pm2-runtime", "npm", "--", "start"]
