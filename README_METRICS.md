# ISP Tools Probe - Sistema de Métricas Prometheus

Uma implementação completa de métricas Prometheus para monitoramento avançado da ISP Tools Probe v2.1.7+.

## 📊 Visão Geral

O sistema de métricas coleta dados detalhados de performance, qualidade de rede e status operacional de todos os módulos da probe. As métricas são expostas no formato Prometheus padrão e **apenas habilitadas quando a probe está registrada** (probeID ≠ 0).

### ⚡ Ativação Automática

```javascript
// Métricas são ativadas automaticamente quando:
// 1. Probe é registrada com sucesso no sistema ISP.Tools
// 2. global.probeID é definido e diferente de 0
// 3. Endpoint /metrics fica disponível
```

## 🎯 Endpoint de Métricas

```
GET /metrics
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

**Exemplo de uso:**
```bash
# Verificar se métricas estão habilitadas
curl http://localhost:8000/metrics

# Integração com Prometheus
scrape_configs:
  - job_name: 'isp-probe'
    static_configs:
      - targets: ['probe-server:8000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

## 📈 Métricas por Módulo

### 🏓 **PING Module**

#### Latência e Performance
```prometheus
# Tempo de resposta do ping
isp_ping_duration_seconds{probe_id, target, ip_version, ttl}
  Buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

# Resolução DNS para targets de ping
isp_ping_dns_resolution_duration_seconds{probe_id, target, ip_version}
  Buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2s
```

#### Qualidade e Disponibilidade
```prometheus
# Sucessos de ping
isp_ping_success_total{probe_id, target, ip_version}

# Falhas de ping com categorização
isp_ping_failure_total{probe_id, target, ip_version, error_type, ttl}
  error_types: timeout, unreachable, ttlExpired, permission_denied, host_not_found
```

**Exemplo de Query PromQL:**
```promql
# Taxa de sucesso de ping por target
rate(isp_ping_success_total[5m]) / 
(rate(isp_ping_success_total[5m]) + rate(isp_ping_failure_total[5m])) * 100

# Latência média de ping
rate(isp_ping_duration_seconds_sum[5m]) / rate(isp_ping_duration_seconds_count[5m]) * 1000
```

### 🌐 **DNS Module**

#### Performance de Consultas
```prometheus
# Tempo de consulta DNS
isp_dns_query_duration_seconds{probe_id, host, record_type, server}
  Buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2s, 5s

# Sucessos de consulta DNS
isp_dns_query_success_total{probe_id, host, record_type, server}

# Falhas de consulta DNS
isp_dns_query_failure_total{probe_id, host, record_type, error_type, server}
```

#### DNSSEC (Crítico para Segurança)
```prometheus
# Status DNSSEC habilitado
isp_dnssec_enabled{probe_id, domain}
  Values: 0=disabled, 1=enabled

# Status de validação DNSSEC
isp_dnssec_status{probe_id, domain, status}
  Values: 0=insecure, 1=secure, 2=bogus

# Número de registros DNSKEY
isp_dnssec_dnskey_records_total{probe_id, domain}
```

**Exemplo de Query PromQL:**
```promql
# Domains sem DNSSEC
isp_dnssec_enabled{probe_id="123"} == 0

# Taxa de falha DNS por servidor
rate(isp_dns_query_failure_total[5m]) by (server)
```

### 🌍 **HTTP Module**

#### Performance HTTP/HTTPS
```prometheus
# Tempo de requisição HTTP
isp_http_request_duration_seconds{probe_id, url, status_code, hostname}
  Buckets: 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s, 30s

# Requisições HTTP bem-sucedidas
isp_http_request_success_total{probe_id, url, status_code, hostname}

# Requisições HTTP falhadas
isp_http_request_failure_total{probe_id, url, error_type, hostname}
```

#### SSL/TLS (Segurança Crítica)
```prometheus
# Tempo de handshake SSL
isp_ssl_handshake_duration_seconds{probe_id, hostname, ip_version}
  Buckets: 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2s, 5s, 10s

# Dias até expiração do certificado
isp_ssl_certificate_expiry_days{probe_id, hostname}

# Validade do certificado SSL
isp_ssl_certificate_valid{probe_id, hostname}
  Values: 0=invalid, 1=valid
```

**Exemplo de Query PromQL:**
```promql
# Certificados expirando em 30 dias
isp_ssl_certificate_expiry_days < 30

# Sites com certificados inválidos
isp_ssl_certificate_valid{probe_id="123"} == 0

# Latência HTTP P95
histogram_quantile(0.95, rate(isp_http_request_duration_seconds_bucket[5m]))
```

### 🛤️ **TRACEROUTE Module**

#### Análise de Rota
```prometheus
# Número total de hops
isp_traceroute_hops_total{probe_id, target, ip_version}

# Tempo por hop individual
isp_traceroute_hop_duration_seconds{probe_id, target, hop_number, hop_ip, ip_version}

# Destino alcançado
isp_traceroute_destination_reached{probe_id, target, ip_version}
  Values: 0=no, 1=yes

# Duração total do traceroute
isp_traceroute_total_duration_seconds{probe_id, target, ip_version}
  Buckets: 100ms, 500ms, 1s, 2s, 5s, 10s, 30s, 60s
```

**Exemplo de Query PromQL:**
```promql
# Rotas que não alcançam o destino
isp_traceroute_destination_reached{probe_id="123"} == 0

# Hop mais lento na rota
max by (target) (isp_traceroute_hop_duration_seconds)
```

### 🔍 **PORTSCAN Module**

#### Análise de Portas
```prometheus
# Duração do scan de portas
isp_portscan_duration_seconds{probe_id, target, protocol}
  Buckets: 100ms, 500ms, 1s, 2s, 5s, 10s, 30s, 60s

# Portas abertas encontradas
isp_portscan_ports_open_total{probe_id, target, protocol}

# Portas fechadas encontradas
isp_portscan_ports_closed_total{probe_id, target, protocol}

# Tempo de resposta por porta
isp_portscan_port_response_time{probe_id, target, port, protocol, status}
  Buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2s
```

**Exemplo de Query PromQL:**
```promql
# Serviços expostos por target
sum by (target) (isp_portscan_ports_open_total)

# Ports scan mais demorados
isp_portscan_duration_seconds > 10
```

### 📏 **MTU Module**

#### Descoberta de MTU
```prometheus
# MTU descoberto em bytes
isp_mtu_discovered_bytes{probe_id, target, ip_version}

# Duração da descoberta de MTU
isp_mtu_discovery_duration_seconds{probe_id, target, ip_version}
  Buckets: 100ms, 500ms, 1s, 2s, 5s, 10s, 30s

# Suporte a Jumbo Frames
isp_mtu_jumbo_frames_supported{probe_id, target, ip_version}
  Values: 0=no, 1=yes
```

**Exemplo de Query PromQL:**
```promql
# Targets com MTU baixo (<1500)
isp_mtu_discovered_bytes < 1500

# Suporte a Jumbo Frames por rede
avg by (probe_id) (isp_mtu_jumbo_frames_supported)
```

## 🔧 **Métricas do Sistema da Probe**

### Status e Performance
```prometheus
# Informações da probe
isp_probe_info{probe_id, probe_version, system_id, instance}
  Value: Always 1

# Uptime da probe em segundos
isp_probe_uptime_seconds{probe_id, probe_version, system_id, instance}

# Uso de memória em bytes
isp_probe_memory_usage_bytes{probe_id, probe_version, system_id, instance, type}
  types: rss, heap_total, heap_used, external
```

### Capacidades de Rede
```prometheus
# Suporte IPv4
isp_probe_ipv4_support{probe_id, probe_version, system_id, instance}
  Values: 0=disabled, 1=enabled

# Suporte IPv6
isp_probe_ipv6_support{probe_id, probe_version, system_id, instance}
  Values: 0=disabled, 1=enabled
```

### Performance da API
```prometheus
# Total de requisições por módulo
isp_probe_requests_total{probe_id, probe_version, system_id, instance, module, endpoint, status}

# Duração de requisições da API
isp_probe_request_duration_seconds{probe_id, probe_version, system_id, instance, module, endpoint}
  Buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2s
```

## 🏷️ **Labels Padrão**

Todas as métricas incluem os seguintes labels automaticamente:

```prometheus
probe_id="12345"           # ID único da probe no sistema ISP.Tools
probe_version="2.1.7"      # Versão da probe
system_id="sys_abc123"     # ID do sistema ISP.Tools
instance="54321"           # PID do processo (para múltiplos workers)
```

## 📊 **Dashboards Recomendados**

### Dashboard de Overview
```promql
# Probes ativas
count by (probe_id) (isp_probe_info)

# Uptime médio
avg(isp_probe_uptime_seconds) / 3600

# Uso de memória
isp_probe_memory_usage_bytes{type="rss"} / 1024 / 1024

# Requisições por segundo
rate(isp_probe_requests_total[5m])
```

### Dashboard de Qualidade de Rede
```promql
# Latência média de ping
rate(isp_ping_duration_seconds_sum[5m]) / rate(isp_ping_duration_seconds_count[5m]) * 1000

# Taxa de perda de pacotes
rate(isp_ping_failure_total[5m]) / (rate(isp_ping_success_total[5m]) + rate(isp_ping_failure_total[5m])) * 100

# Certificados SSL expirando
count(isp_ssl_certificate_expiry_days < 30)

# DNSSEC coverage
count(isp_dnssec_enabled == 1) / count(isp_dnssec_enabled) * 100
```

### Dashboard de Segurança
```promql
# Domains sem DNSSEC
count(isp_dnssec_enabled == 0)

# Certificados inválidos
count(isp_ssl_certificate_valid == 0)

# Portas abertas por target
sum by (target) (isp_portscan_ports_open_total)
```

## ⚠️ **Alertas Recomendados**

### Alertas Críticos
```yaml
# Probe offline
- alert: ProbeDown
  expr: up{job="isp-probe"} == 0
  for: 5m

# Latência alta
- alert: HighPingLatency
  expr: rate(isp_ping_duration_seconds_sum[5m]) / rate(isp_ping_duration_seconds_count[5m]) > 0.1
  for: 2m

# Certificado expirando
- alert: SSLCertificateExpiring
  expr: isp_ssl_certificate_expiry_days < 7
  for: 0m

# Perda de pacotes alta
- alert: HighPacketLoss
  expr: rate(isp_ping_failure_total[5m]) / (rate(isp_ping_success_total[5m]) + rate(isp_ping_failure_total[5m])) > 0.05
  for: 5m
```

### Alertas de Warning
```yaml
# Uso alto de memória
- alert: HighMemoryUsage
  expr: isp_probe_memory_usage_bytes{type="rss"} > 500 * 1024 * 1024
  for: 10m

# DNSSEC não habilitado
- alert: DNSSECNotEnabled
  expr: isp_dnssec_enabled == 0
  for: 0m

# Destino não alcançado no traceroute
- alert: TracerouteUnreachable
  expr: isp_traceroute_destination_reached == 0
  for: 5m
```

## 🔧 **Configuração no Prometheus**

### prometheus.yml
```yaml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'isp-tools-probes'
    static_configs:
      - targets: 
          - 'probe1.example.com:8000'
          - 'probe2.example.com:8000'
          - 'probe3.example.com:8000'
    metrics_path: '/metrics'
    scrape_interval: 30s
    scrape_timeout: 10s
    
rule_files:
  - "isp_probe_alerts.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - 'alertmanager:9093'
```

## 📝 **Retenção e Performance**

### Configuração Recomendada
```yaml
# Retenção de dados
storage.tsdb.retention.time: 30d
storage.tsdb.retention.size: 50GB

# Performance
storage.tsdb.min-block-duration: 2h
storage.tsdb.max-block-duration: 36h
storage.tsdb.wal-compression: true
```

### Cardinality Estimada
```
~80 métricas base × ~5 probes × ~10 targets = ~4,000 series
+ Labels dinâmicos (hosts, IPs, portas) = ~15,000-25,000 series totais
```

## 🚀 **Exemplos de Uso**

### Monitoramento de SLA
```promql
# SLA de disponibilidade (99.9%)
(rate(isp_ping_success_total[30d]) / (rate(isp_ping_success_total[30d]) + rate(isp_ping_failure_total[30d]))) * 100 > 99.9

# SLA de latência (<50ms para 95% das requisições)
histogram_quantile(0.95, rate(isp_ping_duration_seconds_bucket[1h])) * 1000 < 50
```

### Análise de Tendências
```promql
# Tendência de latência nas últimas 24h
increase(isp_ping_duration_seconds_sum[24h]) / increase(isp_ping_duration_seconds_count[24h])

# Crescimento do uso de memória
rate(isp_probe_memory_usage_bytes{type="heap_used"}[1h]) * 3600
```

### Comparação Multi-Probe
```promql
# Latência média por probe
avg by (probe_id) (rate(isp_ping_duration_seconds_sum[5m]) / rate(isp_ping_duration_seconds_count[5m]))

# Capacidade de rede por probe
sum by (probe_id) (isp_probe_ipv4_support + isp_probe_ipv6_support)
```

---

## 📚 **Recursos Adicionais**

- **Prometheus Documentation**: https://prometheus.io/docs/
- **Grafana Dashboard Gallery**: https://grafana.com/grafana/dashboards/
- **PromQL Tutorial**: https://prometheus.io/docs/prometheus/latest/querying/basics/

## 👨‍💻 **Desenvolvimento**

Para adicionar novas métricas:

1. Defina a métrica em `metrics.js`
2. Adicione função de gravação apropriada
3. Chame a função no módulo correspondente
4. Atualize esta documentação
5. Teste no endpoint `/metrics`

**Versão:** 1.0.0  
**Compatível com:** ISP Tools Probe v2.1.7+  
**Última atualização:** Setembro 2025
