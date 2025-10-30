# Build stage - onde compilamos os módulos nativos
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar apenas ferramentas de build necessárias
RUN apk add --no-cache \
    make \
    g++ \
    python3 \
    py3-pip \
    git

ENV PYTHON=/usr/bin/python3

# Clonar repositório e instalar dependências
RUN git clone https://github.com/isptools/probe.git . && \
    npm ci --omit=dev --no-audit --no-fund && \
    # Remover cache do npm e arquivos temporários
    npm cache clean --force && \
    rm -rf /root/.npm /tmp/*

# Production stage - imagem final mínima
FROM node:20-alpine AS production

LABEL maintainer="Giovane Heleno" \
      version="2.2.1" \
      description="ISP Tools Probe - Network diagnostic tools"

WORKDIR /app

# Instalar apenas runtime essenciais
RUN apk add --no-cache \
    dumb-init \
    wget \
    git \
    dcron && \
    npm install -g pm2@latest && \
    npm cache clean --force

# Copiar apenas os arquivos compilados do stage anterior
COPY --from=builder /app .

# Limpar arquivos desnecessários (mantendo .git para o cron)
RUN rm -rf \
    .github \
    v1 \
    v2-nodejs.zip \
    test.yml \
    test_run.sh \
    *.md \
    /root/.npm \
    /tmp/*

# Configurar cron para git pull a cada 10 minutos
RUN echo "*/10 * * * * cd /app && git pull" | crontab -

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=10 \
    CMD wget --no-verbose --tries=1 --spider http://0.0.0.0:8000/ || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["sh", "-c", "crond && pm2-runtime start ecosystem.config.cjs --env production"]

