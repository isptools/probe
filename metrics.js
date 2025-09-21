// ISP Tools Probe - Sistema de Métricas Prometheus
// Implementação completa de métricas para todos os módulos

import { promises as dns } from 'dns';

// Estrutura para armazenar todas as métricas
class PrometheusMetrics {
    constructor() {
        this.metrics = new Map();
        this.enabled = false;
        this.startTime = Date.now();
        this.initializeMetrics();
    }

    // Verifica se as métricas devem ser coletadas
    isEnabled() {
        return this.enabled && global.probeID && global.probeID !== 0;
    }

    // Habilita/desabilita coleta de métricas
    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled && this.isEnabled()) {
            console.log(`📊 [${global.sID}] Metrics enabled for probe ID: ${global.probeID}`);
        }
    }

    // Inicializa todas as métricas
    initializeMetrics() {
        // === PING METRICS ===
        this.metrics.set('isp_ping_duration_seconds', {
            type: 'histogram',
            help: 'Ping response time in seconds',
            values: new Map(),
            buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
        });

        this.metrics.set('isp_ping_success_total', {
            type: 'counter',
            help: 'Total number of successful ping requests',
            values: new Map()
        });

        this.metrics.set('isp_ping_failure_total', {
            type: 'counter',
            help: 'Total number of failed ping requests',
            values: new Map()
        });

        this.metrics.set('isp_ping_dns_resolution_duration_seconds', {
            type: 'histogram',
            help: 'DNS resolution time for ping targets',
            values: new Map(),
            buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0]
        });

        // === DNS METRICS ===
        this.metrics.set('isp_dns_query_duration_seconds', {
            type: 'histogram',
            help: 'DNS query response time in seconds',
            values: new Map(),
            buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
        });

        this.metrics.set('isp_dns_query_success_total', {
            type: 'counter',
            help: 'Total number of successful DNS queries',
            values: new Map()
        });

        this.metrics.set('isp_dns_query_failure_total', {
            type: 'counter',
            help: 'Total number of failed DNS queries',
            values: new Map()
        });

        this.metrics.set('isp_dnssec_enabled', {
            type: 'gauge',
            help: 'DNSSEC enabled status (0=disabled, 1=enabled)',
            values: new Map()
        });

        this.metrics.set('isp_dnssec_status', {
            type: 'gauge',
            help: 'DNSSEC validation status (0=insecure, 1=secure, 2=bogus)',
            values: new Map()
        });

        this.metrics.set('isp_dnssec_dnskey_records_total', {
            type: 'gauge',
            help: 'Number of DNSKEY records found',
            values: new Map()
        });

        // === HTTP METRICS ===
        this.metrics.set('isp_http_request_duration_seconds', {
            type: 'histogram',
            help: 'HTTP request duration in seconds',
            values: new Map(),
            buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0]
        });

        this.metrics.set('isp_http_request_success_total', {
            type: 'counter',
            help: 'Total number of successful HTTP requests',
            values: new Map()
        });

        this.metrics.set('isp_http_request_failure_total', {
            type: 'counter',
            help: 'Total number of failed HTTP requests',
            values: new Map()
        });

        this.metrics.set('isp_ssl_handshake_duration_seconds', {
            type: 'histogram',
            help: 'SSL handshake duration in seconds',
            values: new Map(),
            buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]
        });

        this.metrics.set('isp_ssl_certificate_expiry_days', {
            type: 'gauge',
            help: 'Days until SSL certificate expiry',
            values: new Map()
        });

        this.metrics.set('isp_ssl_certificate_valid', {
            type: 'gauge',
            help: 'SSL certificate validity (0=invalid, 1=valid)',
            values: new Map()
        });

        // === TRACEROUTE METRICS ===
        this.metrics.set('isp_traceroute_hops_total', {
            type: 'gauge',
            help: 'Total number of hops in traceroute',
            values: new Map()
        });

        this.metrics.set('isp_traceroute_hop_duration_seconds', {
            type: 'histogram',
            help: 'Traceroute hop response time in seconds',
            values: new Map(),
            buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0]
        });

        this.metrics.set('isp_traceroute_destination_reached', {
            type: 'gauge',
            help: 'Whether traceroute reached destination (0=no, 1=yes)',
            values: new Map()
        });

        this.metrics.set('isp_traceroute_total_duration_seconds', {
            type: 'histogram',
            help: 'Total traceroute execution time in seconds',
            values: new Map(),
            buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
        });

        // === PORTSCAN METRICS ===
        this.metrics.set('isp_portscan_duration_seconds', {
            type: 'histogram',
            help: 'Port scan duration in seconds',
            values: new Map(),
            buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
        });

        this.metrics.set('isp_portscan_ports_open_total', {
            type: 'counter',
            help: 'Total number of open ports found',
            values: new Map()
        });

        this.metrics.set('isp_portscan_ports_closed_total', {
            type: 'counter',
            help: 'Total number of closed ports found',
            values: new Map()
        });

        this.metrics.set('isp_portscan_port_response_time', {
            type: 'histogram',
            help: 'Port scan response time per port in seconds',
            values: new Map(),
            buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0]
        });

        // === MTU METRICS ===
        this.metrics.set('isp_mtu_discovered_bytes', {
            type: 'gauge',
            help: 'Discovered MTU size in bytes',
            values: new Map()
        });

        this.metrics.set('isp_mtu_discovery_duration_seconds', {
            type: 'histogram',
            help: 'MTU discovery duration in seconds',
            values: new Map(),
            buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0]
        });

        this.metrics.set('isp_mtu_jumbo_frames_supported', {
            type: 'gauge',
            help: 'Jumbo frames support (0=no, 1=yes)',
            values: new Map()
        });

        // === PROBE SYSTEM METRICS ===
        this.metrics.set('isp_probe_info', {
            type: 'gauge',
            help: 'Probe information',
            values: new Map()
        });

        this.metrics.set('isp_probe_uptime_seconds', {
            type: 'gauge',
            help: 'Probe uptime in seconds',
            values: new Map()
        });

        this.metrics.set('isp_probe_memory_usage_bytes', {
            type: 'gauge',
            help: 'Probe memory usage in bytes',
            values: new Map()
        });

        this.metrics.set('isp_probe_requests_total', {
            type: 'counter',
            help: 'Total number of API requests by module',
            values: new Map()
        });

        this.metrics.set('isp_probe_request_duration_seconds', {
            type: 'histogram',
            help: 'API request duration by module in seconds',
            values: new Map(),
            buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0]
        });

        // === NETWORK SUPPORT METRICS ===
        this.metrics.set('isp_probe_ipv4_support', {
            type: 'gauge',
            help: 'IPv4 support status (0=disabled, 1=enabled)',
            values: new Map()
        });

        this.metrics.set('isp_probe_ipv6_support', {
            type: 'gauge',
            help: 'IPv6 support status (0=disabled, 1=enabled)',
            values: new Map()
        });
    }

    // Gera labels padrão para todas as métricas
    getDefaultLabels() {
        return {
            probe_id: global.probeID || '0',
            probe_version: global.version || 'unknown',
            system_id: global.systemID || 'unknown',
            instance: process.pid.toString()
        };
    }

    // Combina labels padrão com labels específicos
    combineLabels(specificLabels = {}) {
        return { ...this.getDefaultLabels(), ...specificLabels };
    }

    // Gera string de labels para Prometheus
    formatLabels(labels) {
        const entries = Object.entries(labels)
            .map(([key, value]) => `${key}="${String(value).replace(/"/g, '\\"')}"`)
            .join(',');
        return entries ? `{${entries}}` : '';
    }

    // Incrementa contador
    incrementCounter(metricName, labels = {}, value = 1) {
        if (!this.isEnabled()) return;

        const metric = this.metrics.get(metricName);
        if (!metric || metric.type !== 'counter') return;

        const labelKey = this.formatLabels(this.combineLabels(labels));
        const currentValue = metric.values.get(labelKey) || 0;
        metric.values.set(labelKey, currentValue + value);
    }

    // Define valor de gauge
    setGauge(metricName, value, labels = {}) {
        if (!this.isEnabled()) return;

        const metric = this.metrics.get(metricName);
        if (!metric || metric.type !== 'gauge') return;

        const labelKey = this.formatLabels(this.combineLabels(labels));
        metric.values.set(labelKey, value);
    }

    // Observa valor em histograma
    observeHistogram(metricName, value, labels = {}) {
        if (!this.isEnabled()) return;

        const metric = this.metrics.get(metricName);
        if (!metric || metric.type !== 'histogram') return;

        const labelKey = this.formatLabels(this.combineLabels(labels));
        
        // Inicializa histograma se não existir
        if (!metric.values.has(labelKey)) {
            metric.values.set(labelKey, {
                count: 0,
                sum: 0,
                buckets: new Map(metric.buckets.map(b => [b, 0]))
            });
        }

        const histogram = metric.values.get(labelKey);
        histogram.count++;
        histogram.sum += value;

        // Incrementa buckets apropriados
        for (const bucket of metric.buckets) {
            if (value <= bucket) {
                histogram.buckets.set(bucket, histogram.buckets.get(bucket) + 1);
            }
        }
    }

    // === MÉTODOS ESPECÍFICOS PARA CADA MÓDULO ===

    // PING Metrics
    recordPingSuccess(target, duration, ttl, ipVersion) {
        this.incrementCounter('isp_ping_success_total', { target, ip_version: ipVersion });
        this.observeHistogram('isp_ping_duration_seconds', duration / 1000, { target, ip_version: ipVersion, ttl: ttl.toString() });
    }

    recordPingFailure(target, errorType, ipVersion, ttl) {
        this.incrementCounter('isp_ping_failure_total', { target, ip_version: ipVersion, error_type: errorType, ttl: ttl.toString() });
    }

    recordPingDnsResolution(target, duration, ipVersion) {
        this.observeHistogram('isp_ping_dns_resolution_duration_seconds', duration / 1000, { target, ip_version: ipVersion });
    }

    // DNS Metrics
    recordDnsQuerySuccess(host, recordType, duration, server) {
        this.incrementCounter('isp_dns_query_success_total', { host, record_type: recordType, server });
        this.observeHistogram('isp_dns_query_duration_seconds', duration / 1000, { host, record_type: recordType, server });
    }

    recordDnsQueryFailure(host, recordType, errorType, server) {
        this.incrementCounter('isp_dns_query_failure_total', { host, record_type: recordType, error_type: errorType, server });
    }

    recordDnssecStatus(domain, enabled, status, dnskeyCount = 0) {
        this.setGauge('isp_dnssec_enabled', enabled ? 1 : 0, { domain });
        
        let statusValue = 0; // insecure
        if (status === 'secure') statusValue = 1;
        else if (status === 'bogus') statusValue = 2;
        
        this.setGauge('isp_dnssec_status', statusValue, { domain, status });
        
        if (dnskeyCount > 0) {
            this.setGauge('isp_dnssec_dnskey_records_total', dnskeyCount, { domain });
        }
    }

    // HTTP Metrics
    recordHttpSuccess(url, statusCode, duration, hostname) {
        this.incrementCounter('isp_http_request_success_total', { url, status_code: statusCode.toString(), hostname });
        this.observeHistogram('isp_http_request_duration_seconds', duration / 1000, { url, status_code: statusCode.toString(), hostname });
    }

    recordHttpFailure(url, errorType, hostname) {
        this.incrementCounter('isp_http_request_failure_total', { url, error_type: errorType, hostname });
    }

    recordSslHandshake(hostname, duration, ipVersion) {
        this.observeHistogram('isp_ssl_handshake_duration_seconds', duration / 1000, { hostname, ip_version: ipVersion });
    }

    recordSslCertificate(hostname, daysUntilExpiry, isValid) {
        this.setGauge('isp_ssl_certificate_expiry_days', daysUntilExpiry, { hostname });
        this.setGauge('isp_ssl_certificate_valid', isValid ? 1 : 0, { hostname });
    }

    // Traceroute Metrics
    recordTraceroute(target, hops, totalDuration, destinationReached, ipVersion) {
        this.setGauge('isp_traceroute_hops_total', hops.length, { target, ip_version: ipVersion });
        this.setGauge('isp_traceroute_destination_reached', destinationReached ? 1 : 0, { target, ip_version: ipVersion });
        this.observeHistogram('isp_traceroute_total_duration_seconds', totalDuration / 1000, { target, ip_version: ipVersion });

        // Record individual hop metrics
        hops.forEach((hop, index) => {
            if (hop.responseTime) {
                this.observeHistogram('isp_traceroute_hop_duration_seconds', hop.responseTime / 1000, {
                    target,
                    hop_number: (index + 1).toString(),
                    hop_ip: hop.ip || 'timeout',
                    ip_version: ipVersion
                });
            }
        });
    }

    // Portscan Metrics
    recordPortscan(target, protocol, duration, results) {
        this.observeHistogram('isp_portscan_duration_seconds', duration / 1000, { target, protocol });

        let openPorts = 0;
        let closedPorts = 0;

        results.forEach(result => {
            if (result.status === 'open') {
                openPorts++;
            } else if (result.status === 'closed') {
                closedPorts++;
            }

            // Record individual port response time
            if (result.responseTime) {
                this.observeHistogram('isp_portscan_port_response_time', result.responseTime / 1000, {
                    target,
                    port: result.port.toString(),
                    protocol: result.protocol,
                    status: result.status
                });
            }
        });

        this.incrementCounter('isp_portscan_ports_open_total', { target, protocol }, openPorts);
        this.incrementCounter('isp_portscan_ports_closed_total', { target, protocol }, closedPorts);
    }

    // MTU Metrics
    recordMtuDiscovery(target, discoveredMtu, duration, supportsJumbo, ipVersion) {
        this.setGauge('isp_mtu_discovered_bytes', discoveredMtu, { target, ip_version: ipVersion });
        this.observeHistogram('isp_mtu_discovery_duration_seconds', duration / 1000, { target, ip_version: ipVersion });
        this.setGauge('isp_mtu_jumbo_frames_supported', supportsJumbo ? 1 : 0, { target, ip_version: ipVersion });
    }

    // Probe System Metrics
    updateSystemMetrics() {
        if (!this.isEnabled()) return;

        // Probe info
        this.setGauge('isp_probe_info', 1);

        // Uptime
        const uptimeSeconds = (Date.now() - this.startTime) / 1000;
        this.setGauge('isp_probe_uptime_seconds', uptimeSeconds);

        // Memory usage
        const memUsage = process.memoryUsage();
        this.setGauge('isp_probe_memory_usage_bytes', memUsage.rss, { type: 'rss' });
        this.setGauge('isp_probe_memory_usage_bytes', memUsage.heapTotal, { type: 'heap_total' });
        this.setGauge('isp_probe_memory_usage_bytes', memUsage.heapUsed, { type: 'heap_used' });
        this.setGauge('isp_probe_memory_usage_bytes', memUsage.external, { type: 'external' });

        // Network support
        this.setGauge('isp_probe_ipv4_support', global.ipv4Support ? 1 : 0);
        this.setGauge('isp_probe_ipv6_support', global.ipv6Support ? 1 : 0);
    }

    // Record API request
    recordApiRequest(module, endpoint, duration, status = 'success') {
        this.incrementCounter('isp_probe_requests_total', { module, endpoint, status });
        this.observeHistogram('isp_probe_request_duration_seconds', duration / 1000, { module, endpoint });
    }

    // Gera saída Prometheus
    generatePrometheusOutput() {
        if (!this.isEnabled()) {
            return '# Metrics disabled - probe not registered (probeID = 0)\n';
        }

        // Atualiza métricas do sistema antes de gerar output
        this.updateSystemMetrics();

        let output = '';
        output += `# HELP isp_probe_metrics_enabled Indicates if metrics collection is enabled\n`;
        output += `# TYPE isp_probe_metrics_enabled gauge\n`;
        output += `isp_probe_metrics_enabled${this.formatLabels(this.getDefaultLabels())} 1\n\n`;

        for (const [metricName, metric] of this.metrics.entries()) {
            if (metric.values.size === 0) continue;

            output += `# HELP ${metricName} ${metric.help}\n`;
            output += `# TYPE ${metricName} ${metric.type}\n`;

            for (const [labelKey, value] of metric.values.entries()) {
                if (metric.type === 'histogram') {
                    // Output histogram buckets
                    for (const [bucket, count] of value.buckets.entries()) {
                        const bucketLabels = labelKey.slice(0, -1) + `,le="${bucket}"}`;
                        output += `${metricName}_bucket${bucketLabels} ${count}\n`;
                    }
                    
                    // Output +Inf bucket
                    const infLabels = labelKey.slice(0, -1) + `,le="+Inf"}`;
                    output += `${metricName}_bucket${infLabels} ${value.count}\n`;
                    
                    // Output count and sum
                    output += `${metricName}_count${labelKey} ${value.count}\n`;
                    output += `${metricName}_sum${labelKey} ${value.sum}\n`;
                } else {
                    output += `${metricName}${labelKey} ${value}\n`;
                }
            }
            output += '\n';
        }

        return output;
    }
}

// Instância global de métricas
const metrics = new PrometheusMetrics();

// Habilita métricas quando probeID é definido
global.enableMetrics = () => {
    metrics.setEnabled(true);
};

// Funções exportadas para uso pelos módulos
export const recordPingSuccess = (target, duration, ttl, ipVersion) => metrics.recordPingSuccess(target, duration, ttl, ipVersion);
export const recordPingFailure = (target, errorType, ipVersion, ttl) => metrics.recordPingFailure(target, errorType, ipVersion, ttl);
export const recordPingDnsResolution = (target, duration, ipVersion) => metrics.recordPingDnsResolution(target, duration, ipVersion);

export const recordDnsQuerySuccess = (host, recordType, duration, server) => metrics.recordDnsQuerySuccess(host, recordType, duration, server);
export const recordDnsQueryFailure = (host, recordType, errorType, server) => metrics.recordDnsQueryFailure(host, recordType, errorType, server);
export const recordDnssecStatus = (domain, enabled, status, dnskeyCount) => metrics.recordDnssecStatus(domain, enabled, status, dnskeyCount);

export const recordHttpSuccess = (url, statusCode, duration, hostname) => metrics.recordHttpSuccess(url, statusCode, duration, hostname);
export const recordHttpFailure = (url, errorType, hostname) => metrics.recordHttpFailure(url, errorType, hostname);
export const recordSslHandshake = (hostname, duration, ipVersion) => metrics.recordSslHandshake(hostname, duration, ipVersion);
export const recordSslCertificate = (hostname, daysUntilExpiry, isValid) => metrics.recordSslCertificate(hostname, daysUntilExpiry, isValid);

export const recordTraceroute = (target, hops, totalDuration, destinationReached, ipVersion) => metrics.recordTraceroute(target, hops, totalDuration, destinationReached, ipVersion);

export const recordPortscan = (target, protocol, duration, results) => metrics.recordPortscan(target, protocol, duration, results);

export const recordMtuDiscovery = (target, discoveredMtu, duration, supportsJumbo, ipVersion) => metrics.recordMtuDiscovery(target, discoveredMtu, duration, supportsJumbo, ipVersion);

export const recordApiRequest = (module, endpoint, duration, status) => metrics.recordApiRequest(module, endpoint, duration, status);

export const generatePrometheusOutput = () => metrics.generatePrometheusOutput();

export { metrics };
