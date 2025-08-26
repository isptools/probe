# DNS Module with DNSSEC Support - Implementação Nativa Node.js

## Principais Mudanças

✅ **Eliminada dependência do `dig`** - Agora usa bibliotecas Node.js nativas  
✅ **Biblioteca `dns2`** - Suporte completo a DNSSEC  
✅ **Zero dependências externas** - Funciona em qualquer ambiente Node.js  
✅ **Performance superior** - Sem spawn de processos externos  

## Vantagens da Nova Implementação

1. **Portabilidade total**: Não precisa ter `dig` instalado no sistema
2. **Performance**: Consultas DNS diretas via bibliotecas nativas
3. **Controle completo**: Parsing preciso dos registros DNSSEC
4. **Timeout configurável**: 5 segundos com 2 tentativas
5. **Cache otimizado**: Gerenciamento automático de memória

## Bibliotecas Utilizadas

- **`dns2`**: Consultas DNS avançadas com suporte a DNSSEC
- **DNS nativo Node.js**: Fallback para registros básicos
- **Cache integrado**: TTL de 60 segundos

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
- **dig**: Ferramenta de linha de comando (bind-utils/dnsutils)
- **Node.js 18+**: Para suporte a child_process moderno
- **Timeout de 5 segundos**: Para consultas DNSSEC

### Instalação do dig
```bash
# Ubuntu/Debian
sudo apt-get install dnsutils

# CentOS/RHEL/Rocky
sudo yum install bind-utils
# ou
sudo dnf install bind-utils

# Alpine Linux
sudo apk add bind-tools
```

## Performance e Otimizações

### Cache DNS
- **60 segundos de TTL** para todas as consultas
- **Limpeza automática** a cada ~100 requisições (1% de chance)
- **Chaves de cache únicas** incluindo flag DNSSEC

### Timeouts
- **5 segundos** para consultas DNSSEC (via dig)
- **Padrão Node.js** para consultas DNS normais
- **Kill automático** de processos dig orfãos

### Otimizações dig
- `+time=3`: Timeout por tentativa
- `+tries=2`: Máximo 2 tentativas
- `+short`: Saída reduzida quando possível
- `+cd`: Checking Disabled para consultas independentes

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

### Erro: "dig command not found"
```bash
# Instalar ferramenta dig
sudo apt-get install dnsutils  # Ubuntu/Debian
sudo yum install bind-utils     # CentOS/RHEL
```

### Status "bogus" inesperado
- Verificar configuração do resolver DNS
- Testar com outros resolvers públicos
- Validar manualmente com `dig +dnssec`

### Performance degradada
- Consultas DNSSEC são ~3-5x mais lentas
- Cache reduz impacto para consultas repetidas
- Considerar usar `dnssec=false` para consultas rápidas

## Compatibilidade

### Versões Suportadas
- **Node.js**: 18.0+
- **dig**: 9.11+ (BIND utilities)
- **Sistema**: Linux, macOS, Windows (com WSL)

### Limitações
- **dig obrigatório**: DNSSEC requer ferramenta externa
- **Timeout fixo**: 5 segundos não configurável
- **IPv6**: Funciona mas sem otimizações específicas
