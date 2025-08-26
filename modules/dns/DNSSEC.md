# DNS Module with DNSSEC Support - Implementação Nativa Node.js

## Principais Mudanças

✅ **Eliminada dependência do `dig`** - Agora usa bibliotecas Node.js nativas  
✅ **Biblioteca `native-dnssec-dns`** - Suporte completo a DNSSEC  
✅ **Zero dependências externas** - Funciona em qualquer ambiente Node.js  
✅ **Performance superior** - Sem spawn de processos externos  
✅ **Resolver inteligente** - Usa resolver do sistema/container primeiro  
✅ **Endpoints avançados** - Validação, análise de cadeia, health checks  

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
7. **Análise completa**: Validação, cadeia de confiança, health checks
8. **Frontend-ready**: Endpoints específicos para dashboards de monitoramento

## Bibliotecas Utilizadas

- **`native-dnssec-dns`**: Consultas DNS avançadas com suporte a DNSSEC
- **DNS nativo Node.js**: Fallback para registros básicos
- **Cache integrado**: TTL de 60 segundos para queries básicas, 5 minutos para análises
- **Resolver automático**: Detecta resolvers do sistema via `/etc/resolv.conf`

---

# 🎯 **GUIA COMPLETO PARA FRONTEND DNSSEC**

## **Arquitetura Recomendada**

### **Dashboard Principal**
```
┌─────────────────────────────────────────────────┐
│  🔍 Domain Input                                 │
│  [example.com                    ] [Analyze]    │
└─────────────────────────────────────────────────┘

┌─────────────────┬─────────────────┬─────────────────┐
│   🛡️ Health      │   🔗 Chain       │   🧮 Algorithms │
│   Grade: A+     │   Status: ✅     │   Level: Strong │
│   Score: 95     │   Links: 3      │   Modern: 2     │
└─────────────────┴─────────────────┴─────────────────┘

┌─────────────────────────────────────────────────┐
│  📊 Detailed Analysis                            │
│  ▶ DNSSEC Records                               │
│  ▶ Signature Status                             │
│  ▶ Trust Chain                                  │
│  ▶ Issues & Recommendations                     │
└─────────────────────────────────────────────────┘
```

### **Fluxo de Chamadas API**
```javascript
// 1. Health Check primeiro (visão geral)
GET /dns/:id_probe/health/example.com

// 2. Se tiver DNSSEC, buscar detalhes
GET /dns/:id_probe/validate/example.com
GET /dns/:id_probe/chain/example.com  
GET /dns/:id_probe/algorithms/example.com

// 3. Registros específicos conforme necessário
GET /dns/:id_probe/DNSKEY/example.com?dnssec=true
GET /dns/:id_probe/DS/example.com?dnssec=true
GET /dns/:id_probe/RRSIG/example.com?dnssec=true
```

---

## **Endpoints para Frontend**

### **🏥 1. Health Check - ENDPOINT PRINCIPAL**
```http
GET /dns/:id_probe/health/example.com
```

**Finalidade**: Overview completo da saúde DNSSEC  
**Cache**: 5 minutos  
**Uso no Frontend**: Card principal, semáforo de status  

```json
{
  "timestamp": 1693056000000,
  "domain": "example.com",
  "health": {
    "score": 95,
    "grade": "A+",
    "issues": ["1 signature expires in 5 days"],
    "recommendations": ["Re-sign zone to extend validity"],
    "tests": {
      "dnssecEnabled": { "status": "pass", "message": "DNSSEC is enabled" },
      "dsRecords": { "status": "pass", "message": "DS records found in parent zone" },
      "signatures": { "status": "pass", "message": "RRSIG records found" },
      "algorithms": { "status": "pass", "message": "Using strong algorithms" }
    }
  },
  "responseTimeMs": 234
}
```

**Frontend Implementation**:
```javascript
// Health Status Component
const HealthCard = ({ domain }) => {
  const [health, setHealth] = useState(null);
  
  useEffect(() => {
    fetch(`/dns/:id_probe/health/${domain}`)
      .then(res => res.json())
      .then(data => setHealth(data.health));
  }, [domain]);
  
  const getGradeColor = (grade) => {
    const colors = { 'A+': 'green', 'A': 'lightgreen', 'B': 'yellow', 'C': 'orange', 'D': 'red', 'F': 'darkred' };
    return colors[grade] || 'gray';
  };
  
  return (
    <div className="health-card">
      <div className="grade" style={{color: getGradeColor(health?.grade)}}>
        {health?.grade || '?'}
      </div>
      <div className="score">Score: {health?.score || 0}/100</div>
      <div className="tests">
        {Object.entries(health?.tests || {}).map(([test, result]) => (
          <div key={test} className={`test-${result.status}`}>
            {result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️'} {result.message}
          </div>
        ))}
      </div>
    </div>
  );
};
```

### **🔍 2. Validação Completa**
```http
GET /dns/:id_probe/validate/example.com
```

**Finalidade**: Análise técnica detalhada  
**Cache**: 1 minuto  
**Uso no Frontend**: Modal de detalhes técnicos  

```json
{
  "timestamp": 1693056000000,
  "domain": "example.com",
  "overallStatus": "secure",
  "summary": {
    "hasDNSSEC": true,
    "hasDS": true,
    "hasValidSignatures": true,
    "keyCount": 2,
    "signatureCount": 4
  },
  "analysis": {
    "dnskey": { "records": [...], "dnssecRecords": {...} },
    "ds": { "records": [...] },
    "rrsig": { "records": [...] },
    "keyAnalysis": { "kskCount": 1, "zskCount": 1 },
    "signatureStatus": { "total": 4, "expired": 0, "expiringSoon": 1 }
  },
  "warnings": ["1 signature expires within 7 days"],
  "errors": [],
  "responseTimeMs": 456
}
```

### **🔗 3. Cadeia de Confiança**
```http
GET /dns/:id_probe/chain/example.com
```

**Finalidade**: Visualizar hierarquia DNSSEC  
**Cache**: 5 minutos  
**Uso no Frontend**: Diagrama de cadeia visual  

```json
{
  "timestamp": 1693056000000,
  "domain": "example.com",
  "chain": [
    { "domain": "example.com", "hasDS": true, "hasDNSKEY": true, "status": "secure" },
    { "domain": "com", "hasDS": true, "hasDNSKEY": true, "status": "secure" },
    { "domain": ".", "hasDS": false, "hasDNSKEY": true, "status": "secure" }
  ],
  "chainLength": 3,
  "isFullySecure": true,
  "responseTimeMs": 678
}
```

**Frontend Implementation**:
```javascript
// Chain Visualization
const ChainDiagram = ({ domain }) => {
  const [chain, setChain] = useState([]);
  
  useEffect(() => {
    fetch(`/dns/chain/${domain}`)
      .then(res => res.json())
      .then(data => setChain(data.chain));
  }, [domain]);
  
  return (
    <div className="chain-diagram">
      {chain.map((link, index) => (
        <div key={link.domain} className={`chain-link ${link.status}`}>
          <div className="domain">{link.domain}</div>
          <div className="status">
            {link.status === 'secure' ? '🔒' : link.status === 'insecure' ? '🔓' : '❌'}
          </div>
          {index < chain.length - 1 && <div className="arrow">↑</div>}
        </div>
      ))}
    </div>
  );
};
```

### **🧮 4. Análise de Algoritmos**
```http
GET /dns/:id_probe/algorithms/example.com
```

**Finalidade**: Verificar força criptográfica  
**Cache**: 5 minutos  
**Uso no Frontend**: Badge de segurança  

```json
{
  "timestamp": 1693056000000,
  "domain": "example.com",
  "analysis": {
    "dnskeyAlgorithms": [
      { "algorithm": 13, "name": "ECDSA-P256-SHA256", "status": "recommended", "security": "strong", "keyType": "KSK" },
      { "algorithm": 13, "name": "ECDSA-P256-SHA256", "status": "recommended", "security": "strong", "keyType": "ZSK" }
    ],
    "dsAlgorithms": [
      { "algorithm": 13, "name": "ECDSA-P256-SHA256", "status": "recommended", "security": "strong", "digestType": 2 }
    ],
    "securityLevel": "strong",
    "recommendations": [],
    "warnings": []
  },
  "responseTimeMs": 123
}
```

---

## **Endpoints DNS Tradicionais com DNSSEC**

### **Registros Básicos com Análise DNSSEC**
```http
GET /dns/:id_probe/A/example.com?dnssec=true
GET /dns/:id_probe/AAAA/example.com?dnssec=true
GET /dns/:id_probe/MX/example.com?dnssec=true
GET /dns/:id_probe/TXT/example.com?dnssec=true
GET /dns/:id_probe/NS/example.com?dnssec=true
GET /dns/:id_probe/CNAME/www.example.com?dnssec=true
GET /dns/:id_probe/SOA/example.com?dnssec=true
GET /dns/:id_probe/SRV/example.com?dnssec=true
GET /dns/:id_probe/PTR/8.8.8.8?dnssec=true
```

### **Registros DNSSEC Específicos**
```http
GET /dns/:id_probe/DS/example.com?dnssec=true        # Delegation Signer
GET /dns/:id_probe/DNSKEY/example.com?dnssec=true    # DNS Key records
GET /dns/:id_probe/RRSIG/example.com?dnssec=true     # Signatures
GET /dns/:id_probe/NSEC/example.com?dnssec=true      # Next Secure (negative auth)
GET /dns/:id_probe/NSEC3/example.com?dnssec=true     # Next Secure v3 (hashed)
```

### **Registros de Segurança Relacionados**
```http
GET /dns/:id_probe/CAA/example.com                   # Certificate Authority Authorization
GET /dns/:id_probe/TLSA/example.com                  # DANE (TLS Authentication)
```

---

## **Componente Frontend Completo**

### **React Dashboard Example**
```javascript
import React, { useState, useEffect } from 'react';

const DNSSECDashboard = () => {
  const [domain, setDomain] = useState('example.com');
  const [health, setHealth] = useState(null);
  const [validation, setValidation] = useState(null);
  const [chain, setChain] = useState(null);
  const [algorithms, setAlgorithms] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeDomain = async (domainName) => {
    setLoading(true);
    
    try {
      // Primary health check
      const healthRes = await fetch(`/dns/:id_probe/health/${domainName}`);
      const healthData = await healthRes.json();
      setHealth(healthData.health);
      
      // If DNSSEC is enabled, get detailed analysis
      if (healthData.health?.tests?.dnssecEnabled?.status === 'pass') {
        const [validationRes, chainRes, algorithmsRes] = await Promise.all([
          fetch(`/dns/validate/${domainName}`),
          fetch(`/dns/chain/${domainName}`),
          fetch(`/dns/algorithms/${domainName}`)
        ]);
        
        setValidation(await validationRes.json());
        setChain(await chainRes.json());
        setAlgorithms(await algorithmsRes.json());
      }
    } catch (error) {
      console.error('Error analyzing domain:', error);
    }
    
    setLoading(false);
  };

  return (
    <div className="dnssec-dashboard">
      <div className="header">
        <h1>🛡️ DNSSEC Analyzer</h1>
        <div className="domain-input">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Enter domain name"
          />
          <button onClick={() => analyzeDomain(domain)} disabled={loading}>
            {loading ? '🔄 Analyzing...' : '🔍 Analyze'}
          </button>
        </div>
      </div>

      {health && (
        <div className="health-overview">
          <div className="grade-card">
            <div className={`grade grade-${health.grade.toLowerCase()}`}>
              {health.grade}
            </div>
            <div className="score">{health.score}/100</div>
          </div>
          
          <div className="tests-grid">
            {Object.entries(health.tests).map(([test, result]) => (
              <div key={test} className={`test-card test-${result.status}`}>
                <div className="test-icon">
                  {result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️'}
                </div>
                <div className="test-name">{test.replace(/([A-Z])/g, ' $1').toUpperCase()}</div>
                <div className="test-message">{result.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {validation && (
        <div className="validation-details">
          <h2>📋 Detailed Analysis</h2>
          
          <div className="summary-cards">
            <div className="card">
              <h3>🔑 Keys</h3>
              <p>Total: {validation.summary.keyCount}</p>
              {validation.analysis.keyAnalysis && (
                <>
                  <p>KSK: {validation.analysis.keyAnalysis.kskCount}</p>
                  <p>ZSK: {validation.analysis.keyAnalysis.zskCount}</p>
                </>
              )}
            </div>
            
            <div className="card">
              <h3>✍️ Signatures</h3>
              <p>Total: {validation.summary.signatureCount}</p>
              {validation.analysis.signatureStatus && (
                <>
                  <p>Expiring Soon: {validation.analysis.signatureStatus.expiringSoon}</p>
                  <p>Expired: {validation.analysis.signatureStatus.expired}</p>
                </>
              )}
            </div>
          </div>
          
          {validation.warnings.length > 0 && (
            <div className="warnings">
              <h3>⚠️ Warnings</h3>
              {validation.warnings.map((warning, index) => (
                <div key={index} className="warning-item">{warning}</div>
              ))}
            </div>
          )}
          
          {validation.errors.length > 0 && (
            <div className="errors">
              <h3>❌ Errors</h3>
              {validation.errors.map((error, index) => (
                <div key={index} className="error-item">{error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {chain && (
        <div className="chain-visualization">
          <h2>🔗 Trust Chain</h2>
          <div className="chain-links">
            {chain.chain.map((link, index) => (
              <React.Fragment key={link.domain}>
                <div className={`chain-link ${link.status}`}>
                  <div className="domain-name">{link.domain}</div>
                  <div className="link-status">
                    {link.status === 'secure' ? '🔒 Secure' : 
                     link.status === 'insecure' ? '🔓 Insecure' : '❌ Error'}
                  </div>
                  <div className="link-details">
                    DS: {link.hasDS ? '✅' : '❌'} | 
                    DNSKEY: {link.hasDNSKEY ? '✅' : '❌'}
                  </div>
                </div>
                {index < chain.chain.length - 1 && (
                  <div className="chain-arrow">↑</div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="chain-summary">
            <strong>Chain Status: </strong>
            {chain.isFullySecure ? '🔒 Fully Secure' : '⚠️ Partially Secure'}
          </div>
        </div>
      )}

      {algorithms && (
        <div className="algorithms-analysis">
          <h2>🧮 Cryptographic Analysis</h2>
          <div className="security-level">
            <strong>Security Level: </strong>
            <span className={`level-${algorithms.analysis.securityLevel}`}>
              {algorithms.analysis.securityLevel.toUpperCase()}
            </span>
          </div>
          
          <div className="algorithms-grid">
            <div className="algorithm-section">
              <h3>DNSKEY Algorithms</h3>
              {algorithms.analysis.dnskeyAlgorithms.map((alg, index) => (
                <div key={index} className={`algorithm-item security-${alg.security}`}>
                  <span className="algorithm-name">{alg.name}</span>
                  <span className="algorithm-type">{alg.keyType}</span>
                  <span className="algorithm-security">{alg.security}</span>
                </div>
              ))}
            </div>
          </div>
          
          {algorithms.analysis.recommendations.length > 0 && (
            <div className="recommendations">
              <h3>💡 Recommendations</h3>
              {algorithms.analysis.recommendations.map((rec, index) => (
                <div key={index} className="recommendation-item">{rec}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DNSSECDashboard;
```

### **CSS Styles Example**
```css
.dnssec-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.domain-input {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

.domain-input input {
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 5px;
  font-size: 16px;
  width: 300px;
}

.domain-input button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
}

.domain-input button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.health-overview {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.grade-card {
  text-align: center;
  padding: 20px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.grade {
  font-size: 48px;
  font-weight: bold;
  margin-bottom: 10px;
}

.grade-a\+ { color: #28a745; }
.grade-a { color: #6f42c1; }
.grade-b { color: #ffc107; }
.grade-c { color: #fd7e14; }
.grade-d { color: #dc3545; }
.grade-f { color: #6c757d; }

.tests-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}

.test-card {
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid;
}

.test-pass { border-left-color: #28a745; background: #d4edda; }
.test-fail { border-left-color: #dc3545; background: #f8d7da; }
.test-warning { border-left-color: #ffc107; background: #fff3cd; }

.chain-links {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.chain-link {
  padding: 15px;
  border-radius: 8px;
  text-align: center;
  min-width: 200px;
}

.chain-link.secure { background: #d4edda; border: 2px solid #28a745; }
.chain-link.insecure { background: #fff3cd; border: 2px solid #ffc107; }
.chain-link.error { background: #f8d7da; border: 2px solid #dc3545; }

.chain-arrow {
  font-size: 24px;
  color: #666;
}

.algorithms-grid {
  margin-top: 20px;
}

.algorithm-item {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  margin-bottom: 5px;
  border-radius: 5px;
}

.security-excellent { background: #d4edda; }
.security-strong { background: #e7f3ff; }
.security-moderate { background: #fff3cd; }
.security-weak { background: #f8d7da; }
```

---

## **Casos de Uso do Frontend**

### **1. Monitoramento de Infraestrutura**
```javascript
// Verificação periódica de múltiplos domínios
const domains = ['example.com', 'api.example.com', 'mail.example.com'];

domains.forEach(domain => {
  setInterval(async () => {
    const health = await fetch(`/dns/:id_probe/health/${domain}`).then(r => r.json());
    
    if (health.health.grade === 'F' || health.health.score < 50) {
      sendAlert(`DNSSEC issues detected for ${domain}`);
    }
  }, 300000); // Check every 5 minutes
});
```

### **2. Análise de Migração DNSSEC**
```javascript
// Comparar domínio antes/depois da implementação DNSSEC
const compareDNSSEC = async (domain) => {
  const [health, validation, chain] = await Promise.all([
    fetch(`/dns/:id_probe/health/${domain}`).then(r => r.json()),
    fetch(`/dns/validate/${domain}`).then(r => r.json()),
    fetch(`/dns/chain/${domain}`).then(r => r.json())
  ]);
  
  return {
    hasDNSSEC: health.health.tests.dnssecEnabled.status === 'pass',
    isFullySecure: chain.isFullySecure,
    issues: validation.errors.concat(validation.warnings),
    grade: health.health.grade
  };
};
```

### **3. Auditoria de Segurança**
```javascript
// Relatório completo de segurança DNS
const generateSecurityReport = async (domain) => {
  const [health, algorithms, validation] = await Promise.all([
    fetch(`/dns/:id_probe/health/${domain}`).then(r => r.json()),
    fetch(`/dns/algorithms/${domain}`).then(r => r.json()),
    fetch(`/dns/validate/${domain}`).then(r => r.json())
  ]);
  
  const report = {
    domain,
    timestamp: new Date().toISOString(),
    overallGrade: health.health.grade,
    securityLevel: algorithms.analysis?.securityLevel || 'none',
    criticalIssues: validation.errors || [],
    recommendations: algorithms.analysis?.recommendations || [],
    keyStrength: algorithms.analysis?.securityLevel || 'unknown'
  };
  
  return report;
};
```

---

## **Performance e Cache Strategy**

### **Níveis de Cache**
- **Health Check**: 5 minutos (visão geral)
- **Validation**: 1 minuto (dados críticos)  
- **Chain**: 5 minutos (estrutura hierárquica)
- **Algorithms**: 5 minutos (configuração estável)
- **DNS Records**: 1 minuto (dados dinâmicos)

### **Estratégia de Loading**
```javascript
// Progressive loading para melhor UX
const useDNSSECData = (domain) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  
  useEffect(() => {
    const loadData = async () => {
      // 1. Load health first (fastest)
      const health = await fetch(`/dns/:id_probe/health/${domain}`).then(r => r.json());
      setData(prev => ({ ...prev, health: health.health }));
      setLoading(false);
      
      // 2. Load detailed data if DNSSEC is enabled
      if (health.health?.tests?.dnssecEnabled?.status === 'pass') {
        const [validation, chain, algorithms] = await Promise.all([
          fetch(`/dns/validate/${domain}`).then(r => r.json()),
          fetch(`/dns/chain/${domain}`).then(r => r.json()),
          fetch(`/dns/algorithms/${domain}`).then(r => r.json())
        ]);
        
        setData(prev => ({ ...prev, validation, chain, algorithms }));
      }
    };
    
    loadData();
  }, [domain]);
  
  return { data, loading };
};
```


---

## **Formato de Resposta Atualizado**

### **Resposta Padrão (sem DNSSEC)**
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

### **Resposta com DNSSEC**
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
    "records": {
      "dnskey": [...],
      "ds": [...],
      "rrsig": [...]
    },
    "trustChain": ["DNSKEY records found", "DS record found", "RRSIG records found"],
    "queryInfo": {
      "authority": 2,
      "additional": 1,
      "flags": {
        "authoritative": true,
        "authenticatedData": true
      }
    }
  },
  "cached": false
}
```

### **Resposta Health Check**
```json
{
  "timestamp": 1693056000000,
  "domain": "example.com",
  "health": {
    "score": 95,
    "grade": "A+",
    "issues": ["1 signature expires in 5 days"],
    "recommendations": ["Re-sign zone to extend validity"],
    "tests": {
      "dnssecEnabled": { "status": "pass", "message": "DNSSEC is enabled" },
      "dsRecords": { "status": "pass", "message": "DS records found in parent zone" },
      "signatures": { "status": "pass", "message": "RRSIG records found" },
      "algorithms": { "status": "pass", "message": "Using strong algorithms" }
    }
  },
  "responseTimeMs": 234
}
```

---

## **Códigos de Status DNSSEC**

| Status | Descrição | Frontend Color |
|--------|-----------|----------------|
| `secure` | DNSSEC válido e funcionando | 🟢 Verde |
| `insecure` | Domínio sem DNSSEC (válido) | 🟡 Amarelo |
| `bogus` | DNSSEC presente mas inválido | 🔴 Vermelho |
| `warning` | DNSSEC funcionando com avisos | 🟠 Laranja |
| `error` | Erro na consulta/validação | ⚫ Cinza |

## **Grades de Health Check**

| Grade | Score | Significado | Ações Recomendadas |
|-------|-------|-------------|-------------------|
| **A+** | 90-100 | DNSSEC perfeito | Monitoramento routine |
| **A** | 80-89 | DNSSEC bom | Verificar recomendações |
| **B** | 70-79 | DNSSEC adequado | Melhorar configuração |
| **C** | 60-69 | DNSSEC com issues | Ação necessária |
| **D** | 50-59 | DNSSEC problemático | Correção urgente |
| **F** | 0-49 | DNSSEC falho | Investigação imediata |

---

## **Dependências e Requisitos**

### **Sistema**
- **Node.js 18+**: Para suporte ES6 modules e native-dnssec-dns
- **Biblioteca native-dnssec-dns**: Instalada automaticamente via npm
- **Timeout de 5 segundos**: Para consultas DNSSEC
- **Resolver automático**: Usa `/etc/resolv.conf` do container/sistema

### **Resolvers DNS Utilizados**
O módulo usa uma estratégia inteligente de resolvers:
1. **Primeiro**: Resolvers do sistema (lidos de `/etc/resolv.conf`)
2. **Fallback**: Resolvers públicos confiáveis:
   - `8.8.8.8` (Google DNS)
   - `1.1.1.1` (Cloudflare DNS)  
   - `9.9.9.9` (Quad9 DNS)

### **Instalação**
```bash
# Dependência incluída no package.json
npm install native-dnssec-dns

# Em containers Docker, o resolver é configurado automaticamente
# pelo daemon do Docker via /etc/resolv.conf
```

---

## **Performance e Otimizações**

### **Estratégia de Cache Avançada**
- **60 segundos TTL** para consultas DNS básicas
- **300 segundos TTL** para análises complexas (health, chain, algorithms)
- **Limpeza automática** a cada 60 segundos via `setInterval`
- **Chaves de cache únicas** incluindo parâmetros DNSSEC

### **Timeouts e Retries**
- **5 segundos** para consultas DNSSEC (via native-dnssec-dns)
- **2 tentativas** automáticas em caso de falha
- **Fallback inteligente** entre resolvers
- **Sem processos externos** - performance superior

### **Estratégia de Resolvers**
- **Sistema primeiro**: Lê resolvers de `/etc/resolv.conf`
- **Fallback público**: 8.8.8.8, 1.1.1.1, 9.9.9.9
- **Log automático**: Mostra resolvers detectados (desenvolvimento)
- **Performance otimizada**: Evita latência desnecessária

---

## **Troubleshooting para Frontend**

### **Estados de Loading**
```javascript
const LoadingStates = {
  IDLE: 'idle',
  LOADING_HEALTH: 'loading_health',
  LOADING_DETAILS: 'loading_details',
  ERROR: 'error',
  COMPLETE: 'complete'
};
```

### **Tratamento de Erros**
```javascript
const handleDNSSECError = (error, domain) => {
  const errorMap = {
    'TIMEOUT': `DNS timeout for ${domain}. Try again.`,
    'NXDOMAIN': `Domain ${domain} not found.`,
    'SERVFAIL': `DNS server error for ${domain}.`,
    'REFUSED': `DNS query refused for ${domain}.`,
    'UNKNOWN': `Unknown DNS error for ${domain}.`
  };
  
  return errorMap[error.code] || error.message;
};
```

### **Problemas Comuns**

#### **Status "bogus" inesperado**
```javascript
// Diagnóstico automático
const diagnoseBogusStatus = async (domain) => {
  const validation = await fetch(`/dns/validate/${domain}`).then(r => r.json());
  
  if (validation.errors.includes('signature')) {
    return 'Assinaturas DNSSEC expiradas ou inválidas';
  }
  if (validation.errors.includes('DS')) {
    return 'Problema com registros DS no domínio pai';
  }
  return 'Configuração DNSSEC inconsistente';
};
```

#### **Timeouts frequentes**
- Verificar conectividade com resolvers DNS
- Implementar retry com backoff exponencial
- Usar loading states progressivos

#### **Cache excessivo**
- Implementar cache busting para dados críticos
- Usar timestamps para invalidação inteligente

---

## **Compatibilidade**

### **Versões Suportadas**
- **Node.js**: 18.0+
- **native-dnssec-dns**: 2.1.0+ (biblioteca JavaScript nativa)
- **Sistema**: Linux, macOS, Windows (qualquer ambiente Node.js)
- **Container**: Docker, Podman, Kubernetes (auto-detecta resolver)

### **Browsers Suportados (Frontend)**
- **Chrome**: 80+
- **Firefox**: 75+
- **Safari**: 13+
- **Edge**: 80+

### **Ambientes Testados**
- **Docker Alpine**: Resolver automático via `/etc/resolv.conf`
- **Kubernetes**: DNS interno do cluster detectado automaticamente  
- **Desenvolvimento local**: Usa resolver do sistema operacional
- **Produção**: Fallback inteligente para resolvers públicos

### **Limitações Removidas**
- ❌ **dig não é mais necessário**: Implementação 100% JavaScript
- ❌ **Sem dependências de sistema**: Funciona em qualquer ambiente Node.js
- ❌ **Sem spawn de processos**: Performance superior e mais confiável
- ✅ **Frontend-ready**: APIs específicas para dashboards web
- ✅ **Real-time monitoring**: Endpoints otimizados para monitoramento contínuo
