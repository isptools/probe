# Módulo Portscan - ISP Tools Probe

## Visão Geral

O módulo **portscan** fornece funcionalidades de varredura de portas TCP e UDP para diagnóstico de rede. Ele permite verificar se portas específicas estão abertas, fechadas ou filtradas em hosts remotos, incluindo análise de segurança e identificação de serviços.

## Endpoints

### GET (Compatibilidade)
```
GET /portscan/:protocol/:method/:id/:ports?
```

### POST (Listas Grandes - Recomendado para CUSTOM)
```
POST /portscan
Content-Type: application/json

{
  "protocol": "tcp|udp",
  "method": "SINGLE|COMMON|RANGE|CUSTOM",
  "host": "hostname ou IP",
  "ports": "string ou array de portas"
}
```

### Parâmetros da URL (GET)

- **protocol** (obrigatório): `tcp` ou `udp`
- **method** (obrigatório): `SINGLE`, `COMMON`, `RANGE`, ou `CUSTOM`
- **id** (obrigatório): Hostname ou endereço IP do alvo
- **ports** (opcional/condicional): Especificação das portas conforme o método

### Parâmetros do Body (POST)

- **protocol** (obrigatório): `tcp` ou `udp`
- **method** (obrigatório): `SINGLE`, `COMMON`, `RANGE`, ou `CUSTOM`
- **host** (obrigatório): Hostname ou endereço IP do alvo
- **ports** (opcional/condicional): String separada por vírgulas ou array de números

### Middleware

- `optionalAuthMiddleware`: Autenticação baseada em whitelist de IPs

## Métodos de Scan

### 1. SINGLE - Porta Única
```
/portscan/tcp/SINGLE/example.com/80
/portscan/udp/SINGLE/8.8.8.8/53
```

### 2. COMMON - Portas Comuns
```
/portscan/tcp/COMMON/example.com
/portscan/udp/COMMON/192.168.1.1
```

**Portas TCP Comuns**: 21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 1433, 3306, 3389, 5432, 5984, 6379, 8080, 8443, 9200

**Portas UDP Comuns**: 53, 67, 68, 69, 123, 161, 162, 500, 514, 520, 1812, 1813, 1900, 4500, 5060, 5353

### 3. RANGE - Faixa de Portas
```
/portscan/tcp/RANGE/example.com/80-443
/portscan/udp/RANGE/target.local/1000-1010
```
- Máximo de 100 portas por range

### 4. CUSTOM - Lista Personalizada

#### GET (Limitado)
```
/portscan/tcp/CUSTOM/example.com/22,80,443,8080
/portscan/udp/CUSTOM/dns.server.com/53,123,161
```
- Máximo de ~30-40 portas (limitado por URL de 256 caracteres)
- Separadas por vírgula

#### POST (Recomendado para Listas Grandes)
```javascript
// Usando string separada por vírgulas
POST /portscan
{
  "protocol": "tcp",
  "method": "CUSTOM", 
  "host": "example.com",
  "ports": "22,80,443,8080,8443,9000,9001,9002..."
}

// Usando array de números (mais limpo)
POST /portscan
{
  "protocol": "udp",
  "method": "CUSTOM",
  "host": "target.local", 
  "ports": [53, 123, 161, 500, 1812, 1813, 4500, 5060]
}
```
- Máximo de 100 portas por lista (parametrizável)
- Sem limitação de URL - aceita listas que não cabem na URL GET

## Respostas

### Estrutura Base da Resposta

```json
{
  "timestamp": 1692000000000,
  "responseTimeMs": 2500,
  "protocol": "tcp",
  "method": "COMMON",
  "host": "example.com",
  "targetIP": "93.184.216.34",
  "ipVersion": 4,
  "totalPorts": 20,
  "openPorts": [22, 80, 443],
  "closedPorts": [21, 23, 25, ...],
  "results": [
    {
      "port": 80,
      "protocol": "tcp",
      "status": "open",
      "serviceName": "HTTP",
      "securityRisk": "medium",
      "securityNote": "HTTP - Web server, verify content and access controls"
    }
  ]
}
```

### Estados das Portas

#### TCP
- **open**: Porta aberta e aceitando conexões
- **closed**: Porta fechada ou filtrada

#### UDP
- **open**: Porta respondeu ao pacote de teste
- **closed**: Porta retornou ICMP port unreachable
- **open|filtered**: Sem resposta (comum em UDP devido à natureza do protocolo)

### Campos Específicos para UDP

```json
{
  "filteredPorts": [67, 68, 514],
  "securityAlert": {
    "level": "high",
    "message": "High-risk UDP ports detected open",
    "riskPorts": [
      {
        "port": 161,
        "service": "SNMP",
        "note": "SNMP - Often has default/weak community strings"
      }
    ],
    "recommendation": "Verify if these services are necessary and properly secured"
  }
}
```

## Detecção de Protocolos e Segurança

### Níveis de Risco
- **low**: Serviços geralmente seguros (SSH, DNS)
- **medium**: Serviços que requerem atenção (HTTP, SMTP)
- **high**: Serviços críticos de segurança (FTP, Telnet, SNMP, NetBIOS)

### Protocolos TCP Monitorados
| Porta | Serviço | Risco | Nota |
|-------|---------|-------|------|
| 21    | FTP     | Alto  | Credenciais em texto plano |
| 22    | SSH     | Baixo | Seguro se bem configurado |
| 23    | Telnet  | Alto  | Acesso remoto não criptografado |
| 80    | HTTP    | Médio | Servidor web, verificar controles |
| 443   | HTTPS   | Baixo | Servidor web seguro |
| 3389  | RDP     | Alto  | Acesso remoto Windows |

### Protocolos UDP Monitorados
| Porta | Serviço | Risco | Nota |
|-------|---------|-------|------|
| 53    | DNS     | Baixo | Servidor DNS |
| 123   | NTP     | Médio | Sincronização de tempo |
| 161   | SNMP    | Alto  | Strings de comunidade fracas |
| 500   | IPSec   | Médio | VPN IPSec |
| 1812  | RADIUS  | Alto  | Autenticação de rede |

## Detecção Inteligente de UDP

O módulo utiliza pacotes específicos para cada protocolo UDP para melhorar a detecção:

- **DNS (53)**: Query DNS válida
- **NTP (123)**: Request NTP
- **SNMP (161)**: Get request SNMP
- **DHCP (67/68)**: Discover packet
- **TFTP (69)**: Read request

## Configurações Técnicas

- **Timeout padrão**: 2000ms por porta
- **Limite de portas**: 
  - GET CUSTOM: ~30-40 portas (limitado por URL 256 chars)
  - GET RANGE: 100 portas
  - POST CUSTOM: 100 portas (parametrizável via MAX_PORTS_LIMIT)
- **Resolução DNS**: IPv4 primeiro, fallback IPv6
- **Suporte**: IPv4 e IPv6

### Configuração do Limite de Portas

Para alterar o limite máximo de portas, edite a constante no arquivo `main.js`:

```javascript
const MAX_PORTS_LIMIT = 100; // Altere este valor conforme necessário
```

**Recomendações de limite:**
- **Produção**: 100 portas (performance balanceada)
- **Ambiente controlado**: 200-500 portas (se necessário)
- **Scan intensivo**: Considere implementar paginação ou scan assíncrono

## Códigos de Erro

```json
{
  "err": "invalid protocol - use TCP or UDP"
}
```

### Erros Comuns
- `invalid protocol` - Protocolo deve ser tcp ou udp
- `invalid method` - Método deve ser SINGLE, COMMON, RANGE ou CUSTOM
- `host not found` - Hostname não pôde ser resolvido
- `port number required` - Porta necessária para método SINGLE
- `invalid port number` - Porta fora do range 1-65535
- `port range too large` - Range excede 100 portas
- `too many ports` - Lista personalizada excede limite (30-40 GET, 100 POST)
- `missing required fields` - Body POST incompleto (host, protocol, method)

## Exemplos de Uso no Frontend

### Scan Básico de Porta (GET)
```javascript
fetch('/portscan/tcp/SINGLE/example.com/80')
  .then(response => response.json())
  .then(data => {
    if (data.openPorts && data.openPorts.includes(80)) {
      console.log('Porta 80 está aberta');
    }
  });
```

### Scan de Lista Grande (POST - Recomendado)
```javascript
fetch('/portscan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    protocol: 'tcp',
    method: 'CUSTOM',
    host: 'example.com',
    ports: [22, 80, 443, 8080, 8443, 9000, 9001, 9002, 9003, 9004] // Até 100 portas
  })
})
.then(response => response.json())
.then(data => {
  console.log(`Escaneadas ${data.totalPorts} portas`);
  console.log(`Portas abertas: ${data.openPorts.join(', ')}`);
});
```

### Scan de Portas Comuns com Alertas de Segurança
```javascript
fetch('/portscan/tcp/COMMON/target.com')
  .then(response => response.json())
  .then(data => {
    // Verificar portas abertas
    data.openPorts.forEach(port => {
      const result = data.results.find(r => r.port === port);
      if (result.securityRisk === 'high') {
        console.warn(`Porta de alto risco aberta: ${port} (${result.serviceName})`);
      }
    });
  });
```

### Interface de Usuário Sugerida

1. **Seletor de Protocolo**: TCP/UDP radio buttons
2. **Método de Scan**: Dropdown com SINGLE, COMMON, RANGE, CUSTOM
3. **Campo de Host**: Input para hostname/IP
4. **Especificação de Portas**: Input condicional baseado no método
5. **Modo de Envio**: Toggle GET/POST (automático para listas >40 portas)
6. **Resultados**: Tabela com colunas para porta, status, serviço, risco
7. **Alertas**: Banner destacado para portas de alto risco

### Validação Frontend Recomendada

```javascript
function validatePortscanRequest(protocol, method, host, ports) {
  if (!['tcp', 'udp'].includes(protocol.toLowerCase())) {
    return 'Protocolo deve ser TCP ou UDP';
  }
  
  if (!['SINGLE', 'COMMON', 'RANGE', 'CUSTOM'].includes(method.toUpperCase())) {
    return 'Método inválido';
  }
  
  if (method === 'SINGLE' && !ports) {
    return 'Porta necessária para método SINGLE';
  }
  
  if (method === 'RANGE' && (!ports || !ports.includes('-'))) {
    return 'Range deve estar no formato início-fim';
  }
  
  // Recomendar POST para listas grandes
  if (method === 'CUSTOM' && Array.isArray(ports) && ports.length > 40) {
    console.info('Lista grande detectada - usando endpoint POST para melhor performance');
  }
  
  return null; // Válido
}

// Função para decidir automaticamente GET vs POST
function sendPortscanRequest(protocol, method, host, ports) {
  const shouldUsePost = method === 'CUSTOM' && 
    ((Array.isArray(ports) && ports.length > 40) || 
     (typeof ports === 'string' && ports.split(',').length > 40));
     
  if (shouldUsePost) {
    return fetch('/portscan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol, method, host, ports })
    });
  } else {
    const portsStr = Array.isArray(ports) ? ports.join(',') : ports;
    return fetch(`/portscan/${protocol}/${method}/${host}/${portsStr || ''}`);
  }
}
```

## Considerações de Performance

- Cada porta é testada em paralelo
- Timeout de 2 segundos por porta
- UDP scans podem demorar mais devido à natureza do protocolo
- Recomenda-se interface com indicador de progresso para scans maiores

## Segurança

- Módulo requer autenticação via whitelist de IPs
- Limitações de rate limiting aplicadas pelo Fastify
- Logs de acesso para auditoria
- Alertas automáticos para portas de alto risco
