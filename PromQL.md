# PromQL Queries para ISP Tools Probe

Coleção completa de queries PromQL organizadas por módulos para uso no Grafana. Todas as queries são baseadas nas métricas implementadas no sistema de monitoramento da ISP Tools Probe.

## 📖 Índice

- [🏓 Ping Metrics](#-ping-metrics)
- [🌐 DNS Metrics](#-dns-metrics)
- [🌍 HTTP/SSL Metrics](#-httpssl-metrics)
- [🛤️ Traceroute Metrics](#️-traceroute-metrics)
- [🔌 Port Scan Metrics](#-port-scan-metrics)
- [📏 MTU Discovery Metrics](#-mtu-discovery-metrics)
- [🖥️ Probe System Metrics](#️-probe-system-metrics)
- [🔗 Insights Cross-Module](#-insights-cross-module)
- [🚨 Alerting Queries](#-alerting-queries)
- [📊 Dashboard Templates](#-dashboard-templates)

---

## 🏓 Ping Metrics

### Performance e Latência

```promql
# P50, P95, P99 de latência de ping (geral) (Time Series)
histogram_quantile(0.50, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le))
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le))
histogram_quantile(0.99, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le))

# Latência por target específico (Time Series)
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, target))

# Latência por versão IP (IPv4 vs IPv6) (Time Series)
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, ip_version))

# Top 10 targets mais lentos (Bar Chart)
topk(10, histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, target)))

# Latência média em milissegundos (Stat/Single Value)
histogram_quantile(0.50, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le)) * 1000
```

### Disponibilidade e Taxa de Sucesso

```promql
# Taxa de sucesso geral de ping (Stat/Single Value)
rate(isp_ping_success_total[5m]) / (rate(isp_ping_success_total[5m]) + rate(isp_ping_failure_total[5m])) * 100

# Taxa de sucesso por target (Time Series)
sum(rate(isp_ping_success_total[5m])) by (target) / (sum(rate(isp_ping_success_total[5m])) by (target) + sum(rate(isp_ping_failure_total[5m])) by (target)) * 100

# Taxa de falhas por tipo de erro (Pie Chart)
sum(rate(isp_ping_failure_total[5m])) by (error_type)

# Disponibilidade por versão IP (Bar Gauge)
sum(rate(isp_ping_success_total[5m])) by (ip_version) / (sum(rate(isp_ping_success_total[5m])) by (ip_version) + sum(rate(isp_ping_failure_total[5m])) by (ip_version)) * 100

# Requests por segundo (RPS) (Stat/Single Value)
sum(rate(isp_ping_success_total[5m])) + sum(rate(isp_ping_failure_total[5m]))

# RPS por target (Time Series)
sum(rate(isp_ping_success_total[5m])) by (target) + sum(rate(isp_ping_failure_total[5m])) by (target)
```

### DNS Resolution para Ping

```promql
# Tempo de resolução DNS para targets de ping (Time Series)
histogram_quantile(0.95, sum(rate(isp_ping_dns_resolution_duration_seconds_bucket[5m])) by (le, target))

# Comparação: tempo de ping vs resolução DNS (Time Series)
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, target))
vs
histogram_quantile(0.95, sum(rate(isp_ping_dns_resolution_duration_seconds_bucket[5m])) by (le, target))

# Taxa de falhas de resolução DNS (Time Series)
rate(isp_ping_failure_total{error_type="dns_resolution_failed"}[5m])
```

---

## 🌐 DNS Metrics

### Performance de Queries DNS

```promql
# Latência de queries DNS por servidor (Time Series)
histogram_quantile(0.95, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le, server))

# Top 5 servidores DNS mais rápidos (Table)
bottomk(5, histogram_quantile(0.50, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le, server)))

# Top 5 servidores DNS mais lentos (Table)
topk(5, histogram_quantile(0.95, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le, server)))

# Latência por tipo de record (Bar Chart)
histogram_quantile(0.95, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le, record_type))

# Performance por host consultado (Time Series)
histogram_quantile(0.95, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le, host))
```

### Taxa de Sucesso DNS

```promql
# Taxa de sucesso geral DNS (Stat/Single Value)
rate(isp_dns_query_success_total[5m]) / (rate(isp_dns_query_success_total[5m]) + rate(isp_dns_query_failure_total[5m])) * 100

# Taxa de sucesso por servidor DNS (Bar Gauge)
sum(rate(isp_dns_query_success_total[5m])) by (server) / (sum(rate(isp_dns_query_success_total[5m])) by (server) + sum(rate(isp_dns_query_failure_total[5m])) by (server)) * 100

# Taxa de falhas por tipo de erro (Pie Chart)
sum(rate(isp_dns_query_failure_total[5m])) by (error_type)

# Taxa de sucesso por tipo de record (Bar Chart)
sum(rate(isp_dns_query_success_total[5m])) by (record_type) / (sum(rate(isp_dns_query_success_total[5m])) by (record_type) + sum(rate(isp_dns_query_failure_total[5m])) by (record_type)) * 100

# Queries por segundo por servidor (Time Series)
sum(rate(isp_dns_query_success_total[5m])) by (server) + sum(rate(isp_dns_query_failure_total[5m])) by (server)
```

### DNSSEC Monitoring

```promql
# Domínios com DNSSEC habilitado (Table)
sum(isp_dnssec_enabled) by (domain)

# Status de validação DNSSEC (Table)
isp_dnssec_status

# Domínios DNSSEC seguros (Stat/Single Value)
count(isp_dnssec_status == 1)

# Domínios DNSSEC bogus (comprometidos) (Stat/Single Value)
count(isp_dnssec_status == 2)

# Número de DNSKEY records por domínio (Bar Chart)
isp_dnssec_dnskey_records_total

# Porcentagem de domínios com DNSSEC (Stat/Single Value)
(count(isp_dnssec_enabled == 1) / count(isp_dnssec_enabled)) * 100
```

---

## 🌍 HTTP/SSL Metrics

### Performance HTTP

```promql
# Latência HTTP por hostname (Time Series)
histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname))

# Top 10 sites mais lentos (Table)
topk(10, histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname)))

# Latência por status code (Bar Chart)
histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, status_code))

# Tempo de resposta em milissegundos (Stat/Single Value)
histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname)) * 1000

# Distribuição de latência (P50, P95, P99) (Time Series)
histogram_quantile(0.50, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname))
histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname))
histogram_quantile(0.99, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname))
```

### Disponibilidade HTTP

```promql
# Taxa de sucesso HTTP geral (Stat/Single Value)
rate(isp_http_request_success_total[5m]) / (rate(isp_http_request_success_total[5m]) + rate(isp_http_request_failure_total[5m])) * 100

# Disponibilidade por hostname (Bar Gauge)
sum(rate(isp_http_request_success_total[5m])) by (hostname) / (sum(rate(isp_http_request_success_total[5m])) by (hostname) + sum(rate(isp_http_request_failure_total[5m])) by (hostname)) * 100

# Distribuição de status codes (Pie Chart)
sum(rate(isp_http_request_success_total[5m])) by (status_code)

# Taxa de erro 5xx (Stat/Single Value)
sum(rate(isp_http_request_success_total{status_code=~"5.."}[5m])) / sum(rate(isp_http_request_success_total[5m])) * 100

# Taxa de erro 4xx (Stat/Single Value)
sum(rate(isp_http_request_success_total{status_code=~"4.."}[5m])) / sum(rate(isp_http_request_success_total[5m])) * 100

# Requests HTTP por segundo (Time Series)
sum(rate(isp_http_request_success_total[5m])) + sum(rate(isp_http_request_failure_total[5m]))
```

### SSL/TLS Monitoring

```promql
# Latência do handshake SSL (Time Series)
histogram_quantile(0.95, sum(rate(isp_ssl_handshake_duration_seconds_bucket[5m])) by (le, hostname))

# Certificados expirando em menos de 30 dias (Table)
isp_ssl_certificate_expiry_days < 30 and isp_ssl_certificate_expiry_days > 0

# Certificados expirando em menos de 7 dias (Stat/Single Value)
isp_ssl_certificate_expiry_days < 7 and isp_ssl_certificate_expiry_days > 0

# Certificados inválidos (Stat/Single Value)
count(isp_ssl_certificate_valid == 0)

# Certificados válidos (Stat/Single Value)
count(isp_ssl_certificate_valid == 1)

# Distribuição de dias até expiração (Histogram)
histogram_quantile(0.50, isp_ssl_certificate_expiry_days)

# Top 10 certificados mais próximos do vencimento (Table)
bottomk(10, isp_ssl_certificate_expiry_days)

# Performance SSL por versão IP (Time Series)
histogram_quantile(0.95, sum(rate(isp_ssl_handshake_duration_seconds_bucket[5m])) by (le, ip_version))
```

---

## 🛤️ Traceroute Metrics

### Topologia de Rede

```promql
# Número médio de hops por target (Bar Chart)
avg(isp_traceroute_hops_total) by (target)

# Top 10 destinos com mais hops (Table)
topk(10, isp_traceroute_hops_total)

# Taxa de alcance do destino (Bar Gauge)
avg(isp_traceroute_destination_reached) by (target) * 100

# Destinos não alcançados (Stat/Single Value)
count(isp_traceroute_destination_reached == 0)

# Duração total do traceroute (Time Series)
histogram_quantile(0.95, sum(rate(isp_traceroute_total_duration_seconds_bucket[5m])) by (le, target))
```

### Performance por Hop

```promql
# Latência por número do hop (Heatmap)
histogram_quantile(0.95, sum(rate(isp_traceroute_hop_duration_seconds_bucket[5m])) by (le, hop_number))

# Latência do primeiro hop (gateway local) (Time Series)
histogram_quantile(0.95, sum(rate(isp_traceroute_hop_duration_seconds_bucket{hop_number="1"}[5m])) by (le))

# Hops com timeout (Stat/Single Value)
count(isp_traceroute_hop_duration_seconds_bucket{hop_ip="timeout"})

# Performance por versão IP (Time Series)
histogram_quantile(0.95, sum(rate(isp_traceroute_total_duration_seconds_bucket[5m])) by (le, ip_version))

# Mapa de latência por hop (para heatmap) (Heatmap)
sum(rate(isp_traceroute_hop_duration_seconds_bucket[5m])) by (le, hop_number, target)
```

---

## 🔌 Port Scan Metrics

### Descoberta de Portas

```promql
# Taxa de portas abertas vs fechadas (Stat/Single Value)
rate(isp_portscan_ports_open_total[5m]) / (rate(isp_portscan_ports_open_total[5m]) + rate(isp_portscan_ports_closed_total[5m])) * 100

# Portas abertas por target (Bar Chart)
sum(rate(isp_portscan_ports_open_total[5m])) by (target)

# Top 10 portas mais comuns abertas (Bar Chart)
topk(10, sum(rate(isp_portscan_ports_open_total[5m])) by (port))

# Top 10 targets com mais portas abertas (Table)
topk(10, sum(rate(isp_portscan_ports_open_total[5m])) by (target))

# Distribuição por protocolo (Pie Chart)
sum(rate(isp_portscan_ports_open_total[5m])) by (protocol)
```

### Performance de Port Scan

```promql
# Duração do port scan por target (Time Series)
histogram_quantile(0.95, sum(rate(isp_portscan_duration_seconds_bucket[5m])) by (le, target))

# Tempo de resposta por porta (Bar Chart)
histogram_quantile(0.95, sum(rate(isp_portscan_port_response_time_bucket[5m])) by (le, port))

# Top 10 portas mais responsivas (Table)
bottomk(10, histogram_quantile(0.50, sum(rate(isp_portscan_port_response_time_bucket[5m])) by (le, port)))

# Performance por protocolo (Time Series)
histogram_quantile(0.95, sum(rate(isp_portscan_duration_seconds_bucket[5m])) by (le, protocol))

# Status de portas por target (Heatmap)
sum(rate(isp_portscan_port_response_time_bucket[5m])) by (target, port, status)
```

---

## 📏 MTU Discovery Metrics

### Descoberta de MTU

```promql
# MTU médio por target (Bar Chart)
avg(isp_mtu_discovered_bytes) by (target)

# Distribuição de MTU descoberto (Histogram)
histogram_quantile(0.50, isp_mtu_discovered_bytes)

# Top 10 targets com maior MTU (Table)
topk(10, isp_mtu_discovered_bytes)

# Suporte a Jumbo Frames (Table)
sum(isp_mtu_jumbo_frames_supported) by (target)

# Targets com Jumbo Frames habilitado (Stat/Single Value)
count(isp_mtu_jumbo_frames_supported == 1)

# MTU por versão IP (Bar Chart)
avg(isp_mtu_discovered_bytes) by (ip_version)
```

### Performance de MTU Discovery

```promql
# Duração da descoberta de MTU (Time Series)
histogram_quantile(0.95, sum(rate(isp_mtu_discovery_duration_seconds_bucket[5m])) by (le, target))

# Performance por versão IP (Time Series)
histogram_quantile(0.95, sum(rate(isp_mtu_discovery_duration_seconds_bucket[5m])) by (le, ip_version))

# Correlação MTU vs tempo de descoberta (Scatter Plot)
isp_mtu_discovered_bytes vs histogram_quantile(0.95, sum(rate(isp_mtu_discovery_duration_seconds_bucket[5m])) by (le, target))
```

---

## 🖥️ Probe System Metrics

### Saúde do Sistema

```promql
# Uptime da probe em horas (Stat/Single Value)
isp_probe_uptime_seconds / 3600

# Uptime em dias (Stat/Single Value)
isp_probe_uptime_seconds / 86400

# Uso de memória RSS em MB (Time Series)
isp_probe_memory_usage_bytes{type="rss"} / 1024 / 1024

# Uso de heap em MB (Time Series)
isp_probe_memory_usage_bytes{type="heap_used"} / 1024 / 1024

# Porcentagem de uso de heap (Gauge)
(isp_probe_memory_usage_bytes{type="heap_used"} / isp_probe_memory_usage_bytes{type="heap_total"}) * 100

# Memória externa em MB (Time Series)
isp_probe_memory_usage_bytes{type="external"} / 1024 / 1024
```

### Performance das APIs

```promql
# Requests por segundo por módulo (Time Series)
sum(rate(isp_probe_requests_total[5m])) by (module)

# Latência das APIs por módulo (Time Series)
histogram_quantile(0.95, sum(rate(isp_probe_request_duration_seconds_bucket[5m])) by (le, module))

# Top 5 módulos mais usados (Bar Chart)
topk(5, sum(rate(isp_probe_requests_total[5m])) by (module))

# Top 5 endpoints mais lentos (Table)
topk(5, histogram_quantile(0.95, sum(rate(isp_probe_request_duration_seconds_bucket[5m])) by (le, endpoint)))

# Taxa de sucesso das APIs (Stat/Single Value)
sum(rate(isp_probe_requests_total{status="success"}[5m])) / sum(rate(isp_probe_requests_total[5m])) * 100

# Distribuição de requests por status (Pie Chart)
sum(rate(isp_probe_requests_total[5m])) by (status)
```

### Suporte de Rede

```promql
# Status do suporte IPv4 (Stat/Single Value)
isp_probe_ipv4_support

# Status do suporte IPv6 (Stat/Single Value)
isp_probe_ipv6_support

# Probe com dual-stack (IPv4 + IPv6) (Stat/Single Value)
isp_probe_ipv4_support * isp_probe_ipv6_support

# Probes apenas IPv4 (Stat/Single Value)
isp_probe_ipv4_support * (1 - isp_probe_ipv6_support)

# Probes apenas IPv6 (Stat/Single Value)
isp_probe_ipv6_support * (1 - isp_probe_ipv4_support)

# CONTADORES - Quantidade de probes por categoria
# Total de probes com suporte IPv4 (Stat/Single Value)
count(isp_probe_ipv4_support == 1)

# Total de probes com suporte IPv6 (Stat/Single Value)
count(isp_probe_ipv6_support == 1)

# Total de probes dual-stack (IPv4 + IPv6) (Stat/Single Value)
count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 1)

# Total de probes apenas IPv4 (sem IPv6) (Stat/Single Value)
count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 0)

# Total de probes apenas IPv6 (sem IPv4) (Stat/Single Value)
count(isp_probe_ipv4_support == 0 and isp_probe_ipv6_support == 1)

# Total de probes sem suporte a nenhum protocolo (Stat/Single Value)
count(isp_probe_ipv4_support == 0 and isp_probe_ipv6_support == 0)

# Total geral de probes ativas (Stat/Single Value)
count(isp_probe_ipv4_support) or count(isp_probe_ipv6_support)

# PERCENTUAIS - Distribuição percentual por categoria
# Percentual de probes com IPv4 (Gauge)
(count(isp_probe_ipv4_support == 1) / count(isp_probe_ipv4_support)) * 100

# Percentual de probes com IPv6 (Gauge)
(count(isp_probe_ipv6_support == 1) / count(isp_probe_ipv6_support)) * 100

# Percentual de probes dual-stack (Gauge)
(count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 1) / count(isp_probe_ipv4_support)) * 100

# Percentual de probes IPv4-only (Gauge)
(count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 0) / count(isp_probe_ipv4_support)) * 100

# Percentual de probes IPv6-only (Gauge)
(count(isp_probe_ipv4_support == 0 and isp_probe_ipv6_support == 1) / count(isp_probe_ipv4_support)) * 100
```

---

## 🔗 Insights Cross-Module

### Correlações de Performance

```promql
# Latência DNS vs Latência de Ping (Time Series)
histogram_quantile(0.95, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le, server))
vs
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, target))

# HTTP Total vs SSL Handshake (Time Series)
histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname))
vs
histogram_quantile(0.95, sum(rate(isp_ssl_handshake_duration_seconds_bucket[5m])) by (le, hostname))

# Overhead do SSL (diferença entre HTTP total e handshake) (Time Series)
histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname)) - histogram_quantile(0.95, sum(rate(isp_ssl_handshake_duration_seconds_bucket[5m])) by (le, hostname))
```

### Análise de Conectividade Global

```promql
# Score de conectividade (ping + HTTP + DNS) (Gauge)
(
  (rate(isp_ping_success_total[5m]) / (rate(isp_ping_success_total[5m]) + rate(isp_ping_failure_total[5m]))) +
  (rate(isp_http_request_success_total[5m]) / (rate(isp_http_request_success_total[5m]) + rate(isp_http_request_failure_total[5m]))) +
  (rate(isp_dns_query_success_total[5m]) / (rate(isp_dns_query_success_total[5m]) + rate(isp_dns_query_failure_total[5m])))
) / 3 * 100

# Latência média agregada de todos os módulos (Stat/Single Value)
(
  histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le)) +
  histogram_quantile(0.95, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le)) +
  histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le))
) / 3
```

### Performance IPv4 vs IPv6

```promql
# Comparação de latência IPv4 vs IPv6 (Ping) (Time Series)
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket{ip_version="ipv4"}[5m])) by (le))
vs
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket{ip_version="ipv6"}[5m])) by (le))

# Taxa de sucesso IPv4 vs IPv6 (Bar Gauge)
rate(isp_ping_success_total{ip_version="ipv4"}[5m]) / (rate(isp_ping_success_total{ip_version="ipv4"}[5m]) + rate(isp_ping_failure_total{ip_version="ipv4"}[5m])) * 100
vs
rate(isp_ping_success_total{ip_version="ipv6"}[5m]) / (rate(isp_ping_success_total{ip_version="ipv6"}[5m]) + rate(isp_ping_failure_total{ip_version="ipv6"}[5m])) * 100

# Diferença percentual de performance IPv6 vs IPv4 (Stat/Single Value)
((histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket{ip_version="ipv6"}[5m])) by (le)) - histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket{ip_version="ipv4"}[5m])) by (le))) / histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket{ip_version="ipv4"}[5m])) by (le))) * 100
```

### Análise de Infraestrutura

```promql
# Mapa de qualidade da rede (combinando múltiplos fatores) (Gauge)
(
  (rate(isp_ping_success_total[5m]) / (rate(isp_ping_success_total[5m]) + rate(isp_ping_failure_total[5m]))) * 0.4 +
  (1 - (histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le)) / 0.1)) * 0.3 +
  (avg(isp_traceroute_destination_reached) * 0.3)
) * 100

# Eficiência de rota (hops vs latência) (Scatter Plot)
avg(isp_traceroute_hops_total) by (target) / histogram_quantile(0.95, sum(rate(isp_traceroute_total_duration_seconds_bucket[5m])) by (le, target))

# Score de segurança SSL (Stat/Single Value)
(count(isp_ssl_certificate_valid == 1) / count(isp_ssl_certificate_valid)) * 100
```

---

## 🚨 Alerting Queries

### Alertas Críticos

```promql
# CRÍTICO: Ping com mais de 5% de falhas (Alert)
(rate(isp_ping_failure_total[5m]) / (rate(isp_ping_success_total[5m]) + rate(isp_ping_failure_total[5m]))) > 0.05

# CRÍTICO: DNS com mais de 10% de falhas (Alert)
(rate(isp_dns_query_failure_total[5m]) / (rate(isp_dns_query_success_total[5m]) + rate(isp_dns_query_failure_total[5m]))) > 0.1

# CRÍTICO: HTTP com mais de 10% de falhas (Alert)
(rate(isp_http_request_failure_total[5m]) / (rate(isp_http_request_success_total[5m]) + rate(isp_http_request_failure_total[5m]))) > 0.1

# CRÍTICO: Certificado SSL expirando em 7 dias (Alert)
isp_ssl_certificate_expiry_days < 7 and isp_ssl_certificate_expiry_days > 0

# CRÍTICO: Probe usando mais de 900MB RAM (Alert)
isp_probe_memory_usage_bytes{type="rss"} > 900 * 1024 * 1024

# CRÍTICO: Probe com uptime < 5 minutos (reinício recente) (Alert)
isp_probe_uptime_seconds < 300
```

### Alertas de Performance

```promql
# WARNING: Ping com P95 > 100ms (Alert)
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, target)) > 0.1

# WARNING: DNS com P95 > 500ms (Alert)
histogram_quantile(0.95, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le, server)) > 0.5

# WARNING: HTTP com P95 > 5s (Alert)
histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le, hostname)) > 5.0

# WARNING: SSL Handshake com P95 > 2s (Alert)
histogram_quantile(0.95, sum(rate(isp_ssl_handshake_duration_seconds_bucket[5m])) by (le, hostname)) > 2.0

# WARNING: Traceroute com mais de 20 hops (Alert)
isp_traceroute_hops_total > 20

# WARNING: Certificado SSL expirando em 30 dias (Alert)
isp_ssl_certificate_expiry_days < 30 and isp_ssl_certificate_expiry_days > 7
```

### Alertas de Capacidade

```promql
# WARNING: Probe usando mais de 70% do heap (Alert)
(isp_probe_memory_usage_bytes{type="heap_used"} / isp_probe_memory_usage_bytes{type="heap_total"}) > 0.7

# WARNING: API com latência > 1s (Alert)
histogram_quantile(0.95, sum(rate(isp_probe_request_duration_seconds_bucket[5m])) by (le, module)) > 1.0

# INFO: Suporte IPv6 desabilitado (Alert)
isp_probe_ipv6_support == 0

# INFO: Suporte IPv4 desabilitado (Alert)
isp_probe_ipv4_support == 0
```

---

## 📊 Dashboard Templates

### Dashboard Overview (Visão Geral)

```promql
# Big Numbers (Single Stat)
- Uptime: isp_probe_uptime_seconds / 86400
- Memory Usage: isp_probe_memory_usage_bytes{type="rss"} / 1024 / 1024
- Overall Success Rate: rate(isp_ping_success_total[5m]) / (rate(isp_ping_success_total[5m]) + rate(isp_ping_failure_total[5m])) * 100
- Active Targets: count(group by (target) (isp_ping_success_total))

# Time Series
- Ping Latency: histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le))
- DNS Latency: histogram_quantile(0.95, sum(rate(isp_dns_query_duration_seconds_bucket[5m])) by (le))
- HTTP Latency: histogram_quantile(0.95, sum(rate(isp_http_request_duration_seconds_bucket[5m])) by (le))
- Request Rate: sum(rate(isp_probe_requests_total[5m])) by (module)
```

### Dashboard Network Performance

```promql
# Heatmap: Latência por Target
sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, target)

# Table: Top Targets por Latência
topk(20, histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, target)))

# Graph: IPv4 vs IPv6 Performance
histogram_quantile(0.95, sum(rate(isp_ping_duration_seconds_bucket[5m])) by (le, ip_version))

# Pie Chart: Success vs Failure Distribution
sum(rate(isp_ping_success_total[5m]))
sum(rate(isp_ping_failure_total[5m]))
```

### Dashboard SSL/Security

```promql
# Table: Certificados próximos do vencimento
bottomk(10, isp_ssl_certificate_expiry_days)

# Graph: SSL Handshake Performance
histogram_quantile(0.95, sum(rate(isp_ssl_handshake_duration_seconds_bucket[5m])) by (le, hostname))

# Stat: DNSSEC Coverage
(count(isp_dnssec_enabled == 1) / count(isp_dnssec_enabled)) * 100

# Bar Chart: DNSSEC Status Distribution
count(isp_dnssec_status) by (status)
```

### Dashboard Network Support

```promql
# Big Numbers (Single Stat)
- Total Probes: count(isp_probe_ipv4_support) or count(isp_probe_ipv6_support)
- IPv4 Support: count(isp_probe_ipv4_support == 1)
- IPv6 Support: count(isp_probe_ipv6_support == 1)
- Dual-Stack: count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 1)

# Pie Chart: Network Support Distribution
- IPv4 Only: count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 0)
- IPv6 Only: count(isp_probe_ipv4_support == 0 and isp_probe_ipv6_support == 1)
- Dual-Stack: count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 1)
- No Support: count(isp_probe_ipv4_support == 0 and isp_probe_ipv6_support == 0)

# Bar Gauge: Adoption Percentages
- IPv4 Adoption: (count(isp_probe_ipv4_support == 1) / count(isp_probe_ipv4_support)) * 100
- IPv6 Adoption: (count(isp_probe_ipv6_support == 1) / count(isp_probe_ipv6_support)) * 100
- Dual-Stack Adoption: (count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 1) / count(isp_probe_ipv4_support)) * 100

# Time Series: Network Support Trends
- IPv4 Probes: count(isp_probe_ipv4_support == 1)
- IPv6 Probes: count(isp_probe_ipv6_support == 1)
- Dual-Stack Probes: count(isp_probe_ipv4_support == 1 and isp_probe_ipv6_support == 1)
```

### Template Variables para Grafana

```promql
# Variable: target
label_values(isp_ping_success_total, target)

# Variable: dns_server  
label_values(isp_dns_query_success_total, server)

# Variable: hostname
label_values(isp_http_request_success_total, hostname)

# Variable: module
label_values(isp_probe_requests_total, module)

# Variable: ip_version
label_values(isp_ping_success_total, ip_version)

# Variable: time_range (custom)
5m,15m,1h,6h,24h,7d,30d
```

---

## 💡 Dicas de Uso

### Formatação de Tempo
- Para converter segundos em milissegundos: `* 1000`
- Para converter bytes em MB: `/ 1024 / 1024`
- Para converter segundos em horas: `/ 3600`
- Para converter segundos em dias: `/ 86400`

### Filtros Úteis
```promql
# Filtrar por target específico
{target="8.8.8.8"}

# Filtrar por range de IPs
{target=~"8\\.8\\..*"}

# Filtrar múltiplos targets
{target=~"8.8.8.8|1.1.1.1|9.9.9.9"}

# Excluir targets específicos
{target!~"localhost|127.0.0.1"}
```

### Agregação por Tempo
```promql
# Últimos 5 minutos
[5m]

# Última hora
[1h] 

# Último dia
[24h]

# Últimos 7 dias
[7d]
```

---

**Nota**: Todas as queries assumem que as métricas estão sendo coletadas conforme implementado no sistema ISP Tools Probe. Ajuste os ranges de tempo `[5m]`, thresholds e labels conforme necessário para seu ambiente específico.