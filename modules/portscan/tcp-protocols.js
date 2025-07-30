/**
 * Biblioteca de protocolos T	80: {
		name: 'HTTP',
		securityRisk: 'medium',
		securityNote: 'HTTP - Web server, verify content and access controls'
	},
	135: {
		name: 'RPC Endpoint Mapper',
		securityRisk: 'high',
		securityNote: 'RPC Endpoint Mapper - Windows service, should not be exposed'
	},
	139: {
		name: 'NetBIOS Session',
		securityRisk: 'high',
		securityNote: 'NetBIOS Session - Windows file sharing, should not be exposed'
	},
	143: {a teste específico de portas
 * Cada protocolo tem informações de segurança e características específicas
 */

/**
 * Mapa de protocolos TCP com suas informações de segurança
 */
export const tcpProtocols = {
	21: {
		name: 'FTP',
		securityRisk: 'high',
		securityNote: 'FTP - Unencrypted file transfer, credentials sent in plain text'
	},
	22: {
		name: 'SSH',
		securityRisk: 'low',
		securityNote: 'SSH - Secure shell, generally safe if properly configured'
	},
	23: {
		name: 'Telnet',
		securityRisk: 'high',
		securityNote: 'Telnet - Unencrypted remote access, credentials sent in plain text'
	},
	25: {
		name: 'SMTP',
		securityRisk: 'medium',
		securityNote: 'SMTP - Email server, verify if intended to be public'
	},
	53: {
		name: 'DNS',
		securityRisk: 'low',
		securityNote: 'DNS - Domain name resolution, zone transfers over TCP'
	},
	80: {
		name: 'HTTP',
		securityRisk: 'medium',
		securityNote: 'HTTP - Web server, verify content and access controls'
	},
	110: {
		name: 'POP3',
		securityRisk: 'high',
		securityNote: 'POP3 - Unencrypted email retrieval, credentials sent in plain text'
	},
	143: {
		name: 'IMAP',
		securityRisk: 'high',
		securityNote: 'IMAP - Unencrypted email access, credentials sent in plain text'
	},
	443: {
		name: 'HTTPS',
		securityRisk: 'low',
		securityNote: 'HTTPS - Secure web server, generally safe'
	},
	445: {
		name: 'SMB',
		securityRisk: 'high',
		securityNote: 'SMB - Windows file sharing, frequently targeted by attacks'
	},
	465: {
		name: 'SMTPS',
		securityRisk: 'low',
		securityNote: 'SMTPS - Secure email submission over SSL/TLS'
	},
	587: {
		name: 'SMTP Submission',
		securityRisk: 'medium',
		securityNote: 'SMTP Submission - Email submission, verify authentication'
	},
	636: {
		name: 'LDAPS',
		securityRisk: 'medium',
		securityNote: 'LDAPS - Secure LDAP, directory service over SSL/TLS'
	},
	993: {
		name: 'IMAPS',
		securityRisk: 'low',
		securityNote: 'IMAPS - Secure email access over SSL/TLS'
	},
	995: {
		name: 'POP3S',
		securityRisk: 'low',
		securityNote: 'POP3S - Secure email retrieval over SSL/TLS'
	},
	1433: {
		name: 'Microsoft SQL Server',
		securityRisk: 'high',
		securityNote: 'SQL Server - Database should not be exposed to internet'
	},
	1521: {
		name: 'Oracle Database',
		securityRisk: 'high',
		securityNote: 'Oracle Database - Should not be exposed to internet'
	},
	1723: {
		name: 'PPTP',
		securityRisk: 'high',
		securityNote: 'PPTP - Deprecated VPN with known vulnerabilities'
	},
	1935: {
		name: 'RTMP',
		securityRisk: 'medium',
		securityNote: 'RTMP - Flash streaming, check access controls'
	},
	2049: {
		name: 'NFS',
		securityRisk: 'high',
		securityNote: 'NFS - Network file system, often misconfigured'
	},
	2375: {
		name: 'Docker Daemon (unencrypted)',
		securityRisk: 'high',
		securityNote: 'Docker Daemon - Should NEVER be exposed to internet without TLS'
	},
	2376: {
		name: 'Docker Daemon (TLS)',
		securityRisk: 'medium',
		securityNote: 'Docker Daemon - Container management, verify TLS configuration'
	},
	3000: {
		name: 'Development Server',
		securityRisk: 'medium',
		securityNote: 'Development Server - Common development port, should not be public'
	},
	5000: {
		name: 'Development/UPnP',
		securityRisk: 'medium',
		securityNote: 'Development Server or UPnP - Verify if intended to be public'
	},
	3306: {
		name: 'MySQL',
		securityRisk: 'high',
		securityNote: 'MySQL - Database should not be exposed to internet'
	},
	3389: {
		name: 'RDP',
		securityRisk: 'high',
		securityNote: 'RDP - Remote Desktop, frequently targeted by attacks'
	},
	5432: {
		name: 'PostgreSQL',
		securityRisk: 'high',
		securityNote: 'PostgreSQL - Database should not be exposed to internet'
	},
	5601: {
		name: 'Kibana',
		securityRisk: 'medium',
		securityNote: 'Kibana - Data visualization, verify authentication'
	},
	5672: {
		name: 'RabbitMQ',
		securityRisk: 'medium',
		securityNote: 'RabbitMQ - Message broker, verify authentication'
	},
	5984: {
		name: 'CouchDB',
		securityRisk: 'high',
		securityNote: 'CouchDB - Database should not be exposed to internet'
	},
	6379: {
		name: 'Redis',
		securityRisk: 'high',
		securityNote: 'Redis - Often exposed without authentication, critical risk'
	},
	6443: {
		name: 'Kubernetes API',
		securityRisk: 'high',
		securityNote: 'Kubernetes API - Container orchestration, critical security'
	},
	8000: {
		name: 'Development Server',
		securityRisk: 'medium',
		securityNote: 'Development Server - Common development port, should not be public'
	},
	8008: {
		name: 'HTTP Alternate',
		securityRisk: 'medium',
		securityNote: 'HTTP Alternate - Web server on alternate port'
	},
	8080: {
		name: 'Jenkins/Tomcat/HTTP Alternate',
		securityRisk: 'high',
		securityNote: 'Jenkins/Tomcat/HTTP Alternate - CI/CD or web server, verify access controls'
	},
	8443: {
		name: 'HTTPS Alternate',
		securityRisk: 'medium',
		securityNote: 'HTTPS Alternate - Secure web server on non-standard port'
	},
	8888: {
		name: 'HTTP Alternate',
		securityRisk: 'medium',
		securityNote: 'HTTP Alternate - Common alternate web server port'
	},
	9000: {
		name: 'SonarQube/Portainer',
		securityRisk: 'high',
		securityNote: 'SonarQube/Portainer - Code analysis or container management'
	},
	9090: {
		name: 'Prometheus',
		securityRisk: 'medium',
		securityNote: 'Prometheus - Metrics collection, may expose sensitive monitoring data'
	},
	9092: {
		name: 'Kafka',
		securityRisk: 'medium',
		securityNote: 'Kafka - Message streaming, verify access controls'
	},
	9200: {
		name: 'Elasticsearch',
		securityRisk: 'high',
		securityNote: 'Elasticsearch - Search engine, often exposed without authentication'
	},
	11211: {
		name: 'Memcached',
		securityRisk: 'high',
		securityNote: 'Memcached - Often exposed without authentication'
	},
	25565: {
		name: 'Minecraft Java',
		securityRisk: 'low',
		securityNote: 'Minecraft Java - Game server, check if intended to be public'
	},
	10000: {
		name: 'Webmin',
		securityRisk: 'high',
		securityNote: 'Webmin - Web-based system administration, verify access controls'
	},
	// Protocolos de administração remota
	79: {
		name: 'Finger',
		securityRisk: 'medium',
		securityNote: 'Finger - User information service, legacy protocol'
	},
	512: {
		name: 'rexec',
		securityRisk: 'high',
		securityNote: 'rexec - Unencrypted remote execution, use SSH instead'
	},
	513: {
		name: 'rlogin',
		securityRisk: 'high',
		securityNote: 'rlogin - Unencrypted remote login, use SSH instead'
	},
	514: {
		name: 'rsh',
		securityRisk: 'high',
		securityNote: 'rsh - Unencrypted remote shell, use SSH instead'
	},
	554: {
		name: 'RTSP',
		securityRisk: 'medium',
		securityNote: 'RTSP - Streaming protocol, check if publicly accessible'
	},
	623: {
		name: 'IPMI',
		securityRisk: 'high',
		securityNote: 'IPMI - Server management, frequently vulnerable'
	},
	873: {
		name: 'rsync',
		securityRisk: 'medium',
		securityNote: 'rsync - File synchronization, verify access controls'
	},
	// Protocolos adicionais de alto risco
	135: {
		name: 'RPC Endpoint Mapper',
		securityRisk: 'high',
		securityNote: 'RPC Endpoint Mapper - Windows service, should not be exposed'
	},
	389: {
		name: 'LDAP',
		securityRisk: 'high',
		securityNote: 'LDAP - Directory service, often misconfigured'
	},
	1080: {
		name: 'SOCKS Proxy',
		securityRisk: 'high',
		securityNote: 'SOCKS Proxy - Can be abused for malicious traffic'
	},
	1433: {
		name: 'Microsoft SQL Server',
		securityRisk: 'high',
		securityNote: 'SQL Server - Database should not be exposed to internet'
	},
	1521: {
		name: 'Oracle Database',
		securityRisk: 'high',
		securityNote: 'Oracle Database - Should not be exposed to internet'
	},
	1604: {
		name: 'Citrix ICA',
		securityRisk: 'high',
		securityNote: 'Citrix ICA - Remote desktop protocol, verify security'
	},
	2000: {
		name: 'Cisco SCCP',
		securityRisk: 'high',
		securityNote: 'Cisco SCCP - VoIP control, should not be public'
	},
	2121: {
		name: 'FTP Proxy',
		securityRisk: 'high',
		securityNote: 'FTP Proxy - Unencrypted proxy service'
	},
	2222: {
		name: 'SSH Alternate',
		securityRisk: 'medium',
		securityNote: 'SSH Alternate - Secure shell on non-standard port'
	},
	2381: {
		name: 'Compaq Web Management',
		securityRisk: 'high',
		securityNote: 'Compaq Web Management - Server management interface'
	},
	2483: {
		name: 'Oracle DB SSL',
		securityRisk: 'high',
		securityNote: 'Oracle Database SSL - Database access over SSL'
	},
	3001: {
		name: 'Nessus Daemon',
		securityRisk: 'high',
		securityNote: 'Nessus Daemon - Vulnerability scanner management'
	},
	3128: {
		name: 'Squid Proxy',
		securityRisk: 'high',
		securityNote: 'Squid Proxy - HTTP proxy, can be abused'
	},
	3260: {
		name: 'iSCSI',
		securityRisk: 'high',
		securityNote: 'iSCSI - Storage protocol, should not be exposed'
	},
	3333: {
		name: 'DEC Notes',
		securityRisk: 'medium',
		securityNote: 'DEC Notes - Legacy groupware service'
	},
	3690: {
		name: 'Subversion',
		securityRisk: 'medium',
		securityNote: 'Subversion - Version control, verify access controls'
	},
	4000: {
		name: 'ICQ',
		securityRisk: 'medium',
		securityNote: 'ICQ - Legacy messaging protocol'
	},
	4369: {
		name: 'Erlang Port Mapper',
		securityRisk: 'high',
		securityNote: 'Erlang Port Mapper - Database cluster communication'
	},
	4444: {
		name: 'Metasploit',
		securityRisk: 'high',
		securityNote: 'Metasploit - Often used for malicious purposes'
	},
	4567: {
		name: 'Tram',
		securityRisk: 'medium',
		securityNote: 'Tram - File sharing protocol'
	},
	4899: {
		name: 'Radmin',
		securityRisk: 'high',
		securityNote: 'Radmin - Remote administration tool'
	},
	5000: {
		name: 'Development/UPnP',
		securityRisk: 'medium',
		securityNote: 'Development Server or UPnP - Verify if intended to be public'
	},
	5222: {
		name: 'XMPP',
		securityRisk: 'medium',
		securityNote: 'XMPP - Jabber messaging protocol'
	},
	5269: {
		name: 'XMPP Server',
		securityRisk: 'medium',
		securityNote: 'XMPP Server - Server-to-server messaging'
	},
	5357: {
		name: 'WSDAPI',
		securityRisk: 'medium',
		securityNote: 'WSDAPI - Windows web services discovery'
	},
	5432: {
		name: 'PostgreSQL',
		securityRisk: 'high',
		securityNote: 'PostgreSQL - Database should not be exposed to internet'
	},
	5555: {
		name: 'HP Data Protector',
		securityRisk: 'high',
		securityNote: 'HP Data Protector - Backup service, often vulnerable'
	},
	5800: {
		name: 'VNC HTTP',
		securityRisk: 'high',
		securityNote: 'VNC HTTP - Remote desktop over web'
	},
	5900: {
		name: 'VNC',
		securityRisk: 'high',
		securityNote: 'VNC - Remote desktop, often unencrypted'
	},
	5938: {
		name: 'TeamViewer',
		securityRisk: 'medium',
		securityNote: 'TeamViewer - Remote access software'
	},
	6000: {
		name: 'X11',
		securityRisk: 'high',
		securityNote: 'X11 - X Window System, should not be exposed'
	},
	6001: {
		name: 'X11 Forwarding',
		securityRisk: 'high',
		securityNote: 'X11 Forwarding - Remote display forwarding'
	},
	6666: {
		name: 'IRC',
		securityRisk: 'medium',
		securityNote: 'IRC - Internet Relay Chat server'
	},
	6667: {
		name: 'IRC',
		securityRisk: 'medium',
		securityNote: 'IRC - Internet Relay Chat server'
	},
	7000: {
		name: 'Cassandra',
		securityRisk: 'high',
		securityNote: 'Cassandra - Database cluster communication'
	},
	7001: {
		name: 'WebLogic',
		securityRisk: 'high',
		securityNote: 'WebLogic - Application server, verify security'
	},
	7070: {
		name: 'RealServer',
		securityRisk: 'medium',
		securityNote: 'RealServer - Media streaming server'
	},
	7443: {
		name: 'Oracle Application Server',
		securityRisk: 'high',
		securityNote: 'Oracle Application Server - Enterprise application server'
	},
	7777: {
		name: 'Oracle Application Server',
		securityRisk: 'high',
		securityNote: 'Oracle Application Server - Development/alternate port'
	},
	8020: {
		name: 'Hadoop NameNode',
		securityRisk: 'high',
		securityNote: 'Hadoop NameNode - Big data cluster management'
	},
	8086: {
		name: 'InfluxDB',
		securityRisk: 'high',
		securityNote: 'InfluxDB - Time series database, often exposed'
	},
	8181: {
		name: 'GlassFish',
		securityRisk: 'high',
		securityNote: 'GlassFish - Application server administration'
	},
	8291: {
		name: 'MikroTik RouterOS',
		securityRisk: 'high',
		securityNote: 'MikroTik RouterOS - Network device management'
	},
	8333: {
		name: 'Bitcoin',
		securityRisk: 'medium',
		securityNote: 'Bitcoin - Cryptocurrency node'
	},
	8500: {
		name: 'Adobe ColdFusion',
		securityRisk: 'high',
		securityNote: 'Adobe ColdFusion - Web application server'
	},
	8834: {
		name: 'Nessus Web UI',
		securityRisk: 'high',
		securityNote: 'Nessus Web UI - Vulnerability scanner interface'
	},
	9001: {
		name: 'Supervisor',
		securityRisk: 'high',
		securityNote: 'Supervisor - Process control system'
	},
	9080: {
		name: 'IBM WebSphere',
		securityRisk: 'high',
		securityNote: 'IBM WebSphere - Application server'
	},
	9100: {
		name: 'Printer JetDirect',
		securityRisk: 'medium',
		securityNote: 'Printer JetDirect - Network printer service'
	},
	9443: {
		name: 'VMware vSphere',
		securityRisk: 'high',
		securityNote: 'VMware vSphere - Virtualization management'
	},
	9999: {
		name: 'Urchin WebAnalytics',
		securityRisk: 'medium',
		securityNote: 'Urchin WebAnalytics - Web analytics server'
	},
	10001: {
		name: 'Ubiquiti Discovery',
		securityRisk: 'medium',
		securityNote: 'Ubiquiti Discovery - Network device discovery'
	},
	10443: {
		name: 'Symantec Intruder Alert',
		securityRisk: 'high',
		securityNote: 'Symantec Intruder Alert - Security management'
	},
	11111: {
		name: 'Memcached SSL',
		securityRisk: 'high',
		securityNote: 'Memcached SSL - Encrypted cache service'
	},
	12345: {
		name: 'NetBus',
		securityRisk: 'high',
		securityNote: 'NetBus - Often associated with malware'
	},
	27017: {
		name: 'MongoDB',
		securityRisk: 'high',
		securityNote: 'MongoDB - Database, often exposed without authentication'
	},
	27018: {
		name: 'MongoDB Shard',
		securityRisk: 'high',
		securityNote: 'MongoDB Shard - Database cluster communication'
	},
	27019: {
		name: 'MongoDB Config',
		securityRisk: 'high',
		securityNote: 'MongoDB Config - Database configuration server'
	},
	28017: {
		name: 'MongoDB Web Status',
		securityRisk: 'high',
		securityNote: 'MongoDB Web Status - Database web interface'
	},
	50000: {
		name: 'SAP Management Console',
		securityRisk: 'high',
		securityNote: 'SAP Management Console - ERP system management'
	},
	50070: {
		name: 'Hadoop NameNode Web UI',
		securityRisk: 'high',
		securityNote: 'Hadoop NameNode Web UI - Big data cluster interface'
	},
	55555: {
		name: 'HP Data Protector',
		securityRisk: 'high',
		securityNote: 'HP Data Protector - Backup service client'
	},
	60000: {
		name: 'Hyper-V',
		securityRisk: 'high',
		securityNote: 'Hyper-V - Virtualization management'
	}
};

/**
 * Obtém informações sobre um protocolo TCP específico
 * @param {number} port - Número da porta
 * @returns {object|null} Informações do protocolo incluindo nome, risco e nota de segurança
 */
export function getTcpProtocolInfo(port) {
	const protocol = tcpProtocols[port];
	if (protocol) {
		return {
			name: protocol.name,
			securityRisk: protocol.securityRisk,
			securityNote: protocol.securityNote
		};
	}
	return null;
}

/**
 * Lista todas as portas TCP suportadas
 * @returns {number[]} Array com todas as portas TCP suportadas
 */
export function getSupportedTcpPorts() {
	return Object.keys(tcpProtocols).map(port => parseInt(port));
}

/**
 * Obtém protocolos TCP por nível de risco
 * @param {string} riskLevel - Nível de risco: 'low', 'medium', 'high'
 * @returns {object[]} Array de protocolos do nível de risco especificado
 */
export function getTcpProtocolsByRisk(riskLevel) {
	return Object.entries(tcpProtocols)
		.filter(([port, info]) => info.securityRisk === riskLevel)
		.map(([port, info]) => ({
			port: parseInt(port),
			name: info.name,
			securityNote: info.securityNote
		}));
}
