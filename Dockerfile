FROM node:20-alpine

LABEL maintainer="Giovane Heleno" \
      version="2.1.5" \
      description="ISP Tools Probe - Network diagnostic tools"

WORKDIR /app

RUN apk add --no-cache \
    dumb-init \
    make \
    g++ \
    python3 \
    py3-pip \
    wget \
    git \
    && npm install -g npm@latest pm2

ENV PYTHON=/usr/bin/python3

# clonar repositório
RUN git clone https://github.com/isptools/probe.git . && npm ci --omit=dev --no-audit --no-fund

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=10 \
    CMD wget --no-verbose --tries=1 --spider http://0.0.0.0:8000/ || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["pm2-runtime", "start", "ecosystem.config.cjs", "--env", "production"]

