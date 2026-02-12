# ISP Tools Probe v2.2.6

Uma ferramenta de diagnóstico de rede modernizada para Node.js v23.7+, fornecendo APIs para testes de conectividade, DNS e HTTP.

## 🚀 Mudanças da Versão 2.1.0 para 2.2.6

### ⚡ Cluster Mode para Alta Performance
- ✅ **Node.js Cluster**: Implementação completa de cluster para múltiplos workers
- ✅ **Escalabilidade Automática**: Usa todos os cores da CPU por padrão
- ✅ **Raw Sockets + Cluster**: Compatibilidade total com operações ICMP/ping
- ✅ **Worker ID Spacing**: Evita conflitos de ICMP IDs entre workers
- ✅ **Graceful Restart**: Workers reiniciam automaticamente em caso de falha
- ✅ **Performance**: Aumenta capacidade de ~300 para ~2000+ req/min

### Configuração do Cluster
```bash
# Habilitar/desabilitar cluster
CLUSTER_ENABLED=true

# Número de workers (padrão: número de CPUs)
NUM_WORKERS=4

# Logs de requisições (padrão: false)
SHOW_REQUEST_LOGS=false
```

## 🚀 Mudanças da Versão 2.0.1 para 2.1.0

### Melhorias Avançadas de Rede
- ✅ **DNS Universal**: Todos os endpoints agora resolvem DNS automaticamente (IPv4 e IPv6)
- ✅ **Suporte IPv6 Completo**: Detecção e suporte automático para IPv4 e IPv6
- ✅ **Certificados SSL/TLS**: Endpoint HTTP retorna detalhes completos do certificado
- ✅ **Ignore SSL Errors**: HTTP endpoint ignora erros de certificado para testes
- ✅ **Campo responseTimeMs**: Renomeado de `responseTime` para maior clareza
- ✅ **Campo sID**: Identificador único de sessão para correlação de requests

### Versão 2.0.1 - Melhorias na API  
- ✅ **Campo `query` removido**: Limpeza das respostas removendo dados desnecessários
- ✅ **Timestamp Unix**: Campo `datetime` substituído por `timestamp` com milissegundos Unix
- ✅ **Tempo de Resposta**: Novo campo `responseTimeMs` mostrando latência total da API em ms

### Modernização Completa
- ✅ **Node.js v23.7+**: Refatorado para usar ES6 modules
- ✅ **Async/Await**: Substituiu callbacks por promises nativas
- ✅ **Dependências Atualizadas**: Removeu dependências obsoletas
- ✅ **Graceful Shutdown**: Implementado shutdown adequado do servidor
- ✅ **Melhor Tratamento de Erros**: Error handling moderno
- ✅ **Performance**: Otimizado para versões modernas do Node.js

### Principais Mudanças Técnicas

1. **Módulos ES6**: Migração completa de `require()` para `import/export`
2. **DNS Promises**: Uso da API `dns.promises` em vez de callbacks
3. **Ping Moderno**: Substituição do `net-ping` por biblioteca `ping` mais estável
4. **Buffer Moderno**: Uso de `Buffer.from()` em vez do construtor depreciado
5. **Graceful Shutdown**: Handlers para SIGTERM e SIGINT

## 📋 Pré-requisitos

- Node.js >= 18.0.0 (recomendado v23.7+)
- npm ou yarn

## 🛠️ Instalação

```bash
# Clone o repositório
git clone <repository-url>
cd probe.isp.tools

# Instale as dependências
npm install

# Inicie o servidor
npm start

# Para desenvolvimento (com auto-reload)
npm run dev
```

## 🌐 Endpoints da API

### 1. Status do Sistema
```
GET /
```
Retorna informações sobre a versão, memoria, uptime e PID do processo.

**Exemplo de resposta:**
```json
{
  "version": "2.2.6",
  "auth": false,
  "pid": 12345,
  "systemID": "sys_abc123xyz",
  "probeID": 4567,
  "memory": {
    "rss": 123456789,
    "heapTotal": 123456789,
    "heapUsed": 123456789,
    "external": 123456789
  },
  "uptime": 123.45,
  "timestamp": 1721248415123,
  "responseTimeMs": 2,
  "modules": ["ping", "dns", "http", "portscan", "traceroute", "mtu"],
  "network": {
    "ipv4Support": true,
    "ipv6Support": true
  }
}
```

### 2. PING
```
GET /PING/:host/:ttl?
```
Executa ping para um host específico.

**Parâmetros:**
- `host`: Hostname ou IP a ser testado
- `ttl`: TTL opcional (padrão: 128)
- `sessionID`: ID da sessão (query parameter)

**Exemplo:**
```bash
curl http://localhost:8000/PING/google.com/64?sessionID=abc123
```

**Resposta:**
```json
{
  "timestamp": 1721248415123,
  "ip": ["142.250.191.14"],
  "target": "142.250.191.14",
  "ms": 15,
  "ttl": 64,
  "err": null,
  "sessionID": "abc123",
  "sID": 1,
  "ipVersion": 4,
  "responseTimeMs": 45
}
```

### 3. DNS
```
GET /DNS/:method/:host
```
Executa consultas DNS de vários tipos.

**Métodos suportados:**
- `A`: Registros IPv4
- `AAAA`: Registros IPv6
- `MX`: Registros de email
- `TXT`: Registros de texto
- `NS`: Servidores de nome
- `CNAME`: Aliases
- `PTR`: Reverse DNS

**Exemplo:**
```bash
curl http://localhost:8000/DNS/A/google.com
```

**Resposta:**
```json
{
  "timestamp": 1721248415123,
  "method": "A",
  "host": "google.com",
  "target": "142.250.191.14",
  "result": ["142.250.191.14"],
  "err": null,
  "ipVersion": 4,
  "responseTimeMs": 25
}
```

### 4. HTTP
```
GET /HTTP/:encoded_url
```
Testa conectividade HTTP/HTTPS para uma URL.

**Parâmetros:**
- `encoded_url`: URL codificada em Base64

**Exemplo:**
```bash
# Para testar http://google.com
# Primeiro codifique: echo -n "http://google.com" | base64
# Resultado: aHR0cDovL2dvb2dsZS5jb20=
curl http://localhost:8000/HTTP/aHR0cDovL2dvb2dsZS5jb20=
```

**Resposta:**
```json
{
  "timestamp": 1721248415123,
  "url": {
    "protocol": "https:",
    "hostname": "google.com",
    "pathname": "/"
  },
  "resolvedIPs": ["142.250.191.14"],
  "status": 301,
  "headers": {
    "location": "https://www.google.com/",
    "content-type": "text/html; charset=UTF-8"
  },
  "certificate": {
    "subject": {
      "CN": "*.google.com"
    },
    "issuer": {
      "CN": "GTS CA 1C3"
    },
    "valid_from": "Dec 12 08:21:47 2023 GMT",
    "valid_to": "Mar  5 08:21:46 2024 GMT",
    "fingerprint": "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD"
  },
  "err": null,
  "ipVersion": 4,
  "responseTimeMs": 150
}
```

## 🔧 Configuração

### Variáveis de Ambiente

- `PORT`: Porta do servidor (padrão: 8000)
- `OPENSHIFT_NODEJS_PORT`: Compatibilidade com OpenShift
- `NODE_ENV`: Ambiente de execução (development/production)
- `SHOW_REQUEST_LOGS`: Habilita logs detalhados de requisições (true/false)

### Variáveis Globais Disponíveis

O sistema disponibiliza as seguintes variáveis globais que podem ser acessadas por qualquer módulo:

- `global.version`: Versão atual da probe (ex: "2.2.6")
- `global.sID`: ID único baseado no PID do processo
- `global.serverPort`: Porta do servidor HTTP
- `global.probeID`: ID único da probe retornado pelo sistema central ISP.Tools
- `global.systemID`: ID do sistema retornado durante o registro
- `global.ipv4Support`: Suporte IPv4 detectado automaticamente (boolean)
- `global.ipv6Support`: Suporte IPv6 detectado automaticamente (boolean)
- `global.isDev`: Indica se está em modo desenvolvimento (boolean)
- `global.loadedModules`: Array com informações dos módulos carregados

**Exemplo de uso nos módulos:**
```javascript
// Acessar o ID da probe em qualquer módulo
const currentProbeID = global.probeID;

// Verificar se IPv6 está disponível
if (global.ipv6Support) {
    // Executar lógica específica para IPv6
}

// Usar ID de sessão único
const sessionId = global.sID;
```

**Nota importante:** A variável `global.probeID` é inicializada como `0` e é atualizada automaticamente após o primeiro registro bem-sucedido com o sistema central ISP.Tools. O registro ocorre a cada 30 minutos.

### Timeouts por Módulo

Cada módulo possui seu próprio timeout específico definido como constante:

- **HTTP/HTTPS**: 5000ms (5 segundos)
- **PING**: 3000ms (3 segundos)
- **SSL/TLS**: 10000ms (10 segundos)
- **PORTSCAN**: 2000ms (2 segundos)
- **TRACEROUTE**: 1000ms (1 segundo por hop)
- **MTU**: 1500ms (1.5 segundos)
- **REGISTER**: 10000ms (10 segundos)

Os timeouts podem ser alterados modificando as constantes no início de cada módulo.

## 🚦 Monitoramento

O servidor fornece logs detalhados de todas as requisições:
```
2025-07-17 19:43:35 - ::ffff:127.0.0.1 - /PING/google.com
```

## 🛡️ Segurança

- **CORS habilitado**: Permite requisições de qualquer origem
- **Injection Protection**: URLs são sanitizadas antes do processamento
- **Input Validation**: Validação de parâmetros de entrada
- **Timeout Protection**: Timeouts em todas as operações de rede

## 📝 Logs

Todos os acessos são logados com:
- Timestamp
- IP do cliente (com suporte a proxy headers)
- URL acessada

## 🔄 Desenvolvimento

Para desenvolvimento com auto-reload:
```bash
npm run dev
```

O servidor será reiniciado automaticamente quando os arquivos forem modificados.

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.

## 👨‍💻 Autor

**Giovane Heleno**
- Website: www.giovane.pro.br
- Projeto: www.isptools.com.br

---

## 🔧 Troubleshooting

### Problemas Comuns

1. **Erro de módulo não encontrado**: Certifique-se de executar `npm install`
2. **Porta em uso**: Mude a porta usando `PORT=30000 npm start`
3. **Permissões de ping**: Em alguns sistemas, pode precisar de privilégios elevados

### Verificação de Funcionamento

Teste rápido:
```bash
curl http://localhost:8000/
```

Deve retornar informações do sistema.
