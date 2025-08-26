# DNS Module with DNSSEC Support - Implementação Nativa Node.js

## Principais Mudanças

✅ **Eliminada dependência do `dig`** - Agora usa bibliotecas Node.js nativas  
✅ **Biblioteca `dns2`** - Suporte completo a DNSSEC  
✅ **Zero dependências externas** - Funciona em qualquer ambiente Node.js  
✅ **Performance superior** - Sem spawn de processos externos  
✅ **Resolver inteligente** - Usa resolver do sistema/container primeiro  

## Vantagens da Nova Implementação

1. **Portabilidade total**: Não precisa ter `dig` instalado no sistema
2. **Performance**: Consultas DNS diretas via bibliotecas nativas
3. **Controle completo**: Parsing preciso dos registros DNSSEC
4. **Timeout configurável**: 5 segundos com 2 tentativas
5. **Cache otimizado**: Gerenciamento automático de memória
6. **Resolver inteligente**: 
   - Primeiro: Resolver do sistema/container (`/etc/resolv.conf`)
   - Fallback: Resolvers públicos (8.8.8.8, 1.1.1.1, 9.9.9.9)
   - Logs automáticos dos resolvers detectados

## Bibliotecas Utilizadas

- **`dns2`**: Consultas DNS avançadas com suporte a DNSSEC
- **DNS nativo Node.js**: Fallback para registros básicos
- **Cache integrado**: TTL de 60 segundos
- **Resolver automático**: Detecta resolvers do sistema via `/etc/resolv.conf`

## Uso da API

### Consultas DNS Tradicionais
```
GET /dns/A/example.com
GET /dns/AAAA/example.com
GET /dns/MX/example.com
GET /dns/TXT/example.com
GET /dns/NS/example.com
GET /dns/CNAME/www.example.com
GET /dns/SOA/example.com
GET /dns/SRV/example.com
GET /dns/PTR/8.8.8.8
```

### Consultas com DNSSEC
```
GET /dns/A/example.com?dnssec=true
GET /dns/AAAA/example.com?dnssec=1
GET /dns/MX/example.com?dnssec=true
```

### Consultas DNSSEC Específicas
```
GET /dns/DS/example.com?dnssec=true
GET /dns/DNSKEY/example.com?dnssec=true
GET /dns/RRSIG/example.com?dnssec=true
```

## Formato de Resposta

### Resposta Padrão (sem DNSSEC)
```json
{
  "timestamp": 1693056000000,
  "method": "A",
  "host": "example.com",
  "target": null,
  "result": ["93.184.216.34"],
  "err": null,
  "ipVersion": 4,
  "responseTimeMs": 25,
  "dnssec": null,
  "cached": false
}
```

### Resposta com DNSSEC
```json
{
  "timestamp": 1693056000000,
  "method": "A",
  "host": "example.com",
  "target": null,
  "result": ["93.184.216.34"],
  "err": null,
  "ipVersion": 4,
  "responseTimeMs": 125,
  "dnssec": {
    "enabled": true,
    "status": "secure",
    "hasDNSSEC": true,
    "signatures": [
      "example.com. 86400 IN RRSIG A 7 2 86400 20230901000000 20230825000000 12345 example.com. ABC123..."
    ],
    "error": null
  },
  "cached": false
}
```

### Resposta DNSSEC com Erro
```json
{
  "timestamp": 1693056000000,
  "method": "A",
  "host": "insecure-domain.com",
  "target": null,
  "result": ["192.0.2.1"],
  "err": null,
  "ipVersion": 4,
  "responseTimeMs": 89,
  "dnssec": {
    "enabled": true,
    "status": "insecure",
    "hasDNSSEC": false,
    "signatures": [],
    "error": null
  },
  "cached": false
}
```

## Códigos de Status DNSSEC

| Status | Descrição |
|--------|-----------|
| `secure` | Domínio tem DNSSEC válido e assinado |
| `insecure` | Domínio não usa DNSSEC (mas é válido) |
| `bogus` | DNSSEC presente mas inválido/quebrado |

## Dependências e Requisitos

### Sistema
- **Node.js 18+**: Para suporte ES6 modules e dns2
- **Biblioteca dns2**: Instalada automaticamente via npm
- **Timeout de 5 segundos**: Para consultas DNSSEC
- **Resolver automático**: Usa `/etc/resolv.conf` do container/sistema

### Resolvers DNS Utilizados
O módulo usa uma estratégia inteligente de resolvers:
1. **Primeiro**: Resolvers do sistema (lidos de `/etc/resolv.conf`)
2. **Fallback**: Resolvers públicos confiáveis:
   - `8.8.8.8` (Google DNS)
   - `1.1.1.1` (Cloudflare DNS)  
   - `9.9.9.9` (Quad9 DNS)

### Instalação
```bash
# Dependências já incluídas no package.json
npm install dns2

# Em containers Docker, o resolver é configurado automaticamente
# pelo daemon do Docker via /etc/resolv.conf
```

## Performance e Otimizações

### Cache DNS
- **60 segundos de TTL** para todas as consultas
- **Limpeza automática** a cada 60 segundos via `setInterval`
- **Chaves de cache únicas** incluindo flag DNSSEC (`dnssec_domain_type`)

### Timeouts e Retries
- **5 segundos** para consultas DNSSEC (via dns2)
- **2 tentativas** automáticas em caso de falha
- **Sem processos externos** - tudo via bibliotecas Node.js

### Estratégia de Resolvers
- **Sistema primeiro**: Lê resolvers de `/etc/resolv.conf`
- **Fallback público**: 8.8.8.8, 1.1.1.1, 9.9.9.9
- **Log automático**: Mostra resolvers detectados (apenas no desenvolvimento)
- **Performance otimizada**: Evita latência desnecessária

## Casos de Uso

### 1. Auditoria de Segurança DNS
```bash
# Verificar se um domínio tem DNSSEC configurado
curl "localhost:8000/dns/A/example.com?dnssec=true"

# Validar registros DS do domínio
curl "localhost:8000/dns/DS/example.com?dnssec=true"

# Verificar chaves DNSKEY
curl "localhost:8000/dns/DNSKEY/example.com?dnssec=true"
```

### 2. Monitoramento de Infraestrutura
- **Alertas automáticos** quando DNSSEC status muda de `secure` para `bogus`
- **Validação contínua** de domínios críticos
- **Relatórios de conformidade** DNSSEC

### 3. Troubleshooting DNS
- **Diagnóstico de falhas** DNSSEC
- **Verificação de propagação** após mudanças
- **Análise de cadeia de confiança**

## Troubleshooting

### Logs de Resolvers
Em desenvolvimento, o módulo mostra quais resolvers estão sendo usados:
```
[PID] Using DNS servers: [system resolvers] + [public fallbacks]
```

### Problemas Comuns

#### Status "bogus" inesperado
- Verificar configuração do resolver DNS no container
- Testar com outros resolvers (query parameter `?resolver=8.8.8.8`)
- Verificar conectividade com resolvers DNSSEC

#### Timeouts frequentes
- Verificar latência dos resolvers do sistema
- Container pode estar usando resolvers lentos
- Considerar forçar uso de resolvers públicos via configuração

#### Cache excessivo
- Cache padrão de 60 segundos
- Usar `?nocache=true` para bypass (se implementado)
- Restart do container limpa todo o cache

## Compatibilidade

### Versões Suportadas
- **Node.js**: 18.0+
- **dns2**: 2.1.0+ (biblioteca JavaScript nativa)
- **Sistema**: Linux, macOS, Windows (qualquer ambiente Node.js)
- **Container**: Docker, Podman, Kubernetes (auto-detecta resolver)

### Ambientes Testados
- **Docker Alpine**: Resolver automático via `/etc/resolv.conf`
- **Kubernetes**: DNS interno do cluster detectado automaticamente  
- **Desenvolvimento local**: Usa resolver do sistema operacional
- **Produção**: Fallback inteligente para resolvers públicos

### Limitações Removidas
- ❌ **dig não é mais necessário**: Implementação 100% JavaScript
- ❌ **Sem dependências de sistema**: Funciona em qualquer ambiente Node.js
- ❌ **Sem spawn de processos**: Performance superior e mais confiável
