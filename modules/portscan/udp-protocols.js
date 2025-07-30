/**
 * Biblioteca de protocolos UDP para teste específico de portas
 * Cada protocolo tem seu próprio payload para gerar respostas válidas
 */

/**
 * Gera um pacote DNS query para teste
 * @param {string} domain - Domínio para consulta (default: google.com)
 * @returns {Buffer} Pacote DNS
 */
function createDnsQuery(domain = 'google.com') {
	const labels = domain.split('.');
	let queryBuffer = [];
	
	// Header DNS
	queryBuffer.push(
		0x12, 0x34, // Transaction ID
		0x01, 0x00, // Flags: standard query
		0x00, 0x01, // Questions: 1
		0x00, 0x00, // Answer RRs: 0
		0x00, 0x00, // Authority RRs: 0
		0x00, 0x00  // Additional RRs: 0
	);
	
	// Query section
	labels.forEach(label => {
		queryBuffer.push(label.length);
		queryBuffer.push(...Buffer.from(label, 'ascii'));
	});
	
	queryBuffer.push(
		0x00,       // End of name
		0x00, 0x01, // Type: A
		0x00, 0x01  // Class: IN
	);
	
	return Buffer.from(queryBuffer);
}

/**
 * Gera um pacote NTP request
 * @returns {Buffer} Pacote NTP
 */
function createNtpRequest() {
	const packet = Buffer.alloc(48);
	packet[0] = 0x1b; // LI=0, VN=3, Mode=3 (client)
	return packet;
}

/**
 * Gera um pacote DHCP Discover
 * @returns {Buffer} Pacote DHCP
 */
function createDhcpDiscover() {
	const packet = Buffer.alloc(300);
	packet[0] = 0x01; // Boot Request
	packet[1] = 0x01; // Hardware type: Ethernet
	packet[2] = 0x06; // Hardware address length
	packet[3] = 0x00; // Hops
	
	// Transaction ID (random)
	packet.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 4);
	
	// Magic cookie
	packet[236] = 0x63;
	packet[237] = 0x82;
	packet[238] = 0x53;
	packet[239] = 0x63;
	
	// Option 53: DHCP Message Type = Discover
	packet[240] = 53;
	packet[241] = 1;
	packet[242] = 1;
	
	// End option
	packet[243] = 255;
	
	return packet;
}

/**
 * Gera um pacote TFTP Read Request
 * @returns {Buffer} Pacote TFTP
 */
function createTftpRequest() {
	const filename = 'test.txt';
	const mode = 'octet';
	const packet = Buffer.alloc(2 + filename.length + 1 + mode.length + 1);
	
	packet.writeUInt16BE(1, 0); // Opcode: Read Request
	let offset = 2;
	
	packet.write(filename, offset);
	offset += filename.length;
	packet[offset++] = 0; // Null terminator
	
	packet.write(mode, offset);
	offset += mode.length;
	packet[offset] = 0; // Null terminator
	
	return packet;
}

/**
 * Gera um pacote SNMP GetRequest
 * @returns {Buffer} Pacote SNMP
 */
function createSnmpRequest() {
	// Simple SNMP v1 GetRequest for system.sysDescr.0 (1.3.6.1.2.1.1.1.0)
	const packet = Buffer.from([
		0x30, 0x29, // SEQUENCE
		0x02, 0x01, 0x00, // INTEGER version (0 = SNMPv1)
		0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, // OCTET STRING "public"
		0xa0, 0x1c, // GetRequest PDU
		0x02, 0x04, 0x00, 0x00, 0x00, 0x01, // INTEGER request-id
		0x02, 0x01, 0x00, // INTEGER error-status
		0x02, 0x01, 0x00, // INTEGER error-index
		0x30, 0x0e, // SEQUENCE varbindlist
		0x30, 0x0c, // SEQUENCE varbind
		0x06, 0x08, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00, // OBJECT IDENTIFIER
		0x05, 0x00 // NULL
	]);
	return packet;
}

/**
 * Gera um pacote NetBIOS Name Query
 * @returns {Buffer} Pacote NetBIOS
 */
function createNetbiosQuery() {
	const packet = Buffer.alloc(50);
	
	// Transaction ID
	packet.writeUInt16BE(0x1234, 0);
	
	// Flags
	packet.writeUInt16BE(0x0110, 2); // Standard query, recursion desired
	
	// Questions
	packet.writeUInt16BE(1, 4);
	
	// NetBIOS name encoding for "*" (any name)
	let offset = 12;
	packet[offset++] = 0x20; // Length
	
	// Encoded name "*               " (16 bytes padded)
	const name = '*               ';
	for (let i = 0; i < 16; i++) {
		const char = name.charCodeAt(i);
		packet[offset++] = 0x41 + (char >> 4);
		packet[offset++] = 0x41 + (char & 0x0F);
	}
	
	packet[offset++] = 0x00; // End of name
	packet.writeUInt16BE(0x0020, offset); // Type: NetBIOS
	offset += 2;
	packet.writeUInt16BE(0x0001, offset); // Class: IN
	
	return packet.slice(0, offset + 2);
}

/**
 * Gera um pacote Syslog de teste
 * @returns {Buffer} Pacote Syslog
 */
function createSyslogPacket() {
	const message = '<14>Test message from UDP scanner';
	return Buffer.from(message, 'ascii');
}

/**
 * Gera um pacote RIP Request
 * @returns {Buffer} Pacote RIP
 */
function createRipRequest() {
	const packet = Buffer.alloc(24);
	packet[0] = 0x01; // Command: Request
	packet[1] = 0x02; // Version: RIPv2
	packet.writeUInt16BE(0x0000, 2); // Reserved
	
	// Request entry
	packet.writeUInt16BE(0x0000, 4); // Address Family: Unspecified
	packet.writeUInt16BE(0x0000, 6); // Route Tag
	// IP, Mask, Next Hop all zeros for request
	packet.writeUInt32BE(0xFFFFFFFF, 20); // Metric: Infinity (request all routes)
	
	return packet;
}

/**
 * Gera um pacote RADIUS Access-Request de teste
 * @returns {Buffer} Pacote RADIUS
 */
function createRadiusRequest() {
	const packet = Buffer.alloc(20);
	packet[0] = 0x01; // Code: Access-Request
	packet[1] = 0x01; // Identifier
	packet.writeUInt16BE(20, 2); // Length
	
	// Request Authenticator (16 bytes random)
	for (let i = 4; i < 20; i++) {
		packet[i] = Math.floor(Math.random() * 256);
	}
	
	return packet;
}

/**
 * Gera um pacote CoAP GET request
 * @returns {Buffer} Pacote CoAP
 */
function createCoapRequest() {
	const packet = Buffer.alloc(4);
	packet[0] = 0x40; // Version: 1, Type: Confirmable, Token Length: 0
	packet[1] = 0x01; // Code: GET
	packet.writeUInt16BE(0x1234, 2); // Message ID
	return packet;
}

/**
 * Gera um pacote L2TP para teste
 * @returns {Buffer} Pacote L2TP
 */
function createL2tpPacket() {
	const packet = Buffer.alloc(12);
	packet.writeUInt16BE(0xC802, 0); // Flags and version
	packet.writeUInt16BE(12, 2); // Length
	packet.writeUInt16BE(0x0000, 4); // Tunnel ID
	packet.writeUInt16BE(0x0000, 6); // Session ID
	packet.writeUInt16BE(0x0000, 8); // Ns
	packet.writeUInt16BE(0x0000, 10); // Nr
	return packet;
}

/**
 * Gera um pacote OpenVPN para teste
 * @returns {Buffer} Pacote OpenVPN
 */
function createOpenVpnPacket() {
	const packet = Buffer.alloc(14);
	packet.writeUInt32BE(0x38, 0); // Opcode: P_CONTROL_HARD_RESET_CLIENT_V1
	packet.writeUInt32BE(0x00000000, 4); // Session ID
	packet[8] = 0x00; // Packet ID length
	// Rest is padding
	return packet;
}

/**
 * Gera um pacote WireGuard para teste
 * @returns {Buffer} Pacote WireGuard
 */
function createWireGuardPacket() {
	const packet = Buffer.alloc(32);
	packet[0] = 0x01; // Message type: Handshake Initiation
	packet[1] = 0x00; // Reserved
	packet[2] = 0x00; // Reserved
	packet[3] = 0x00; // Reserved
	// Rest would be cryptographic data, but we use zeros for test
	return packet;
}

/**
 * Gera um pacote mDNS query
 * @returns {Buffer} Pacote mDNS
 */
function createMdnsQuery() {
	// Similar to DNS but for multicast
	return createDnsQuery('_services._dns-sd._udp.local');
}

/**
 * Gera um pacote LLMNR query
 * @returns {Buffer} Pacote LLMNR
 */
function createLlmnrQuery() {
	// Similar to DNS
	return createDnsQuery('test');
}

/**
 * Gera um pacote Minecraft Bedrock ping
 * @returns {Buffer} Pacote Minecraft Bedrock
 */
function createMinecraftBedrockPing() {
	const packet = Buffer.alloc(25);
	packet[0] = 0x01; // Ping packet ID
	
	// Timestamp
	const timestamp = BigInt(Date.now());
	packet.writeBigUInt64BE(timestamp, 1);
	
	// Magic bytes
	const magic = Buffer.from([0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE, 0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78]);
	magic.copy(packet, 9);
	
	return packet;
}

/**
 * Gera um pacote BACnet para teste
 * @returns {Buffer} Pacote BACnet
 */
function createBacnetPacket() {
	const packet = Buffer.alloc(12);
	packet[0] = 0x81; // BACnet/IP
	packet[1] = 0x0B; // Function: Original-Broadcast-NPDU
	packet.writeUInt16BE(12, 2); // Length
	
	// NPDU
	packet[4] = 0x01; // Version
	packet[5] = 0x20; // Control: Expecting reply, Priority normal
	
	// APDU (Who-Is request)
	packet[6] = 0x10; // PDU Type: Unconfirmed request
	packet[7] = 0x08; // Service: Who-Is
	
	return packet;
}

/**
 * Mapa de protocolos UDP com suas funções de criação de pacotes
 * Contém apenas protocolos que realmente usam UDP
 */
export const udpProtocols = {
	53: {
		name: 'DNS',
		createPacket: (host) => createDnsQuery(),
		securityRisk: 'low',
		securityNote: 'DNS - Essential service, generally safe'
	},
	67: {
		name: 'DHCP Server',
		createPacket: (host) => createDhcpDiscover(),
		securityRisk: 'medium',
		securityNote: 'DHCP Server - May leak network information'
	},
	68: {
		name: 'DHCP Client',
		createPacket: (host) => createDhcpDiscover(),
		securityRisk: 'medium',
		securityNote: 'DHCP Client - May leak network information'
	},
	69: {
		name: 'TFTP',
		createPacket: (host) => createTftpRequest(),
		securityRisk: 'high',
		securityNote: 'TFTP - Insecure protocol without authentication'
	},
	123: {
		name: 'NTP',
		createPacket: (host) => createNtpRequest(),
		securityRisk: 'low',
		securityNote: 'NTP - Essential service, low risk'
	},
	137: {
		name: 'NetBIOS Name Service',
		createPacket: (host) => createNetbiosQuery(),
		securityRisk: 'medium',
		securityNote: 'NetBIOS - May expose system information'
	},
	138: {
		name: 'NetBIOS Datagram',
		createPacket: (host) => createNetbiosQuery(),
		securityRisk: 'medium',
		securityNote: 'NetBIOS - May expose system information'
	},
	161: {
		name: 'SNMP',
		createPacket: (host) => createSnmpRequest(),
		securityRisk: 'high',
		securityNote: 'SNMP - Often misconfigured, may expose sensitive information'
	},
	162: {
		name: 'SNMP Trap',
		createPacket: (host) => createSnmpRequest(),
		securityRisk: 'medium',
		securityNote: 'SNMP Trap - Monitoring service, verify configuration'
	},
	514: {
		name: 'Syslog',
		createPacket: (host) => createSyslogPacket(),
		securityRisk: 'medium',
		securityNote: 'Syslog - Log collection, may expose sensitive information'
	},
	520: {
		name: 'RIP',
		createPacket: (host) => createRipRequest(),
		securityRisk: 'medium',
		securityNote: 'RIP - Routing protocol, may expose network topology'
	},
	1645: {
		name: 'RADIUS Authentication',
		createPacket: (host) => createRadiusRequest(),
		securityRisk: 'high',
		securityNote: 'RADIUS - Authentication service, critical security component'
	},
	1646: {
		name: 'RADIUS Accounting',
		createPacket: (host) => createRadiusRequest(),
		securityRisk: 'medium',
		securityNote: 'RADIUS Accounting - User activity tracking'
	},
	1812: {
		name: 'RADIUS Authentication (New)',
		createPacket: (host) => createRadiusRequest(),
		securityRisk: 'high',
		securityNote: 'RADIUS - Authentication service, critical security component'
	},
	1813: {
		name: 'RADIUS Accounting (New)',
		createPacket: (host) => createRadiusRequest(),
		securityRisk: 'medium',
		securityNote: 'RADIUS Accounting - User activity tracking'
	},
	1701: {
		name: 'L2TP',
		createPacket: (host) => createL2tpPacket(),
		securityRisk: 'medium',
		securityNote: 'L2TP - VPN protocol, verify security configuration'
	},
	1194: {
		name: 'OpenVPN',
		createPacket: (host) => createOpenVpnPacket(),
		securityRisk: 'medium',
		securityNote: 'OpenVPN - VPN service, verify configuration'
	},
	51820: {
		name: 'WireGuard',
		createPacket: (host) => createWireGuardPacket(),
		securityRisk: 'low',
		securityNote: 'WireGuard - Modern VPN protocol, generally secure'
	},
	5353: {
		name: 'mDNS',
		createPacket: (host) => createMdnsQuery(),
		securityRisk: 'low',
		securityNote: 'mDNS - Multicast DNS for local network discovery'
	},
	5355: {
		name: 'LLMNR',
		createPacket: (host) => createLlmnrQuery(),
		securityRisk: 'medium',
		securityNote: 'LLMNR - Name resolution, may be exploited for credential theft'
	},
	5683: {
		name: 'CoAP',
		createPacket: (host) => createCoapRequest(),
		securityRisk: 'medium',
		securityNote: 'CoAP - IoT protocol, verify device security'
	},
	5684: {
		name: 'CoAPS',
		createPacket: (host) => createCoapRequest(),
		securityRisk: 'low',
		securityNote: 'CoAPS - Secure CoAP over DTLS'
	},
	19132: {
		name: 'Minecraft Bedrock',
		createPacket: (host) => createMinecraftBedrockPing(),
		securityRisk: 'low',
		securityNote: 'Minecraft Bedrock - Game server, check if intended to be public'
	},
	47808: {
		name: 'BACnet',
		createPacket: (host) => createBacnetPacket(),
		securityRisk: 'high',
		securityNote: 'BACnet - Building automation, should not be exposed to internet'
	},
	500: {
		name: 'IKE',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x10, 0x02, 0x00]),
		securityRisk: 'medium',
		securityNote: 'IKE - IPSec key exchange, verify VPN configuration'
	},
	4500: {
		name: 'IPSec NAT-T',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x10, 0x02, 0x00]),
		securityRisk: 'medium',
		securityNote: 'IPSec NAT-T - VPN over NAT, verify configuration'
	},
	// Protocolos de jogos que usam UDP
	7777: {
		name: 'Game Server',
		createPacket: (host) => Buffer.from('ping'),
		securityRisk: 'low',
		securityNote: 'Game Server - Various games use this port'
	},
	27015: {
		name: 'Steam/Source Games',
		createPacket: (host) => Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54, 0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20, 0x45, 0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51, 0x75, 0x65, 0x72, 0x79, 0x00]),
		securityRisk: 'low',
		securityNote: 'Steam/Source Games - Game server, check if intended to be public'
	},
	// Protocolos de VoIP
	5060: {
		name: 'SIP',
		createPacket: (host) => Buffer.from('OPTIONS sip:test@' + host + ' SIP/2.0\r\n\r\n'),
		securityRisk: 'medium',
		securityNote: 'SIP - VoIP protocol, may be exploited for fraud'
	},
	// Protocolos de streaming
	1935: {
		name: 'RTMP',
		createPacket: (host) => Buffer.from([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'RTMP - Flash streaming protocol'
	},
	// Protocolos UDP adicionais de alto risco
	37: {
		name: 'Time Protocol',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'Time Protocol - May expose system time information'
	},
	88: {
		name: 'Kerberos',
		createPacket: (host) => Buffer.from([0x6a, 0x81, 0x1e, 0x30, 0x1b, 0xa1, 0x03, 0x02, 0x01, 0x05]),
		securityRisk: 'high',
		securityNote: 'Kerberos - Authentication protocol, critical security component'
	},
	111: {
		name: 'RPC Portmapper',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x86, 0xa0]),
		securityRisk: 'high',
		securityNote: 'RPC Portmapper - May expose running services'
	},
	135: {
		name: 'Microsoft RPC',
		createPacket: (host) => Buffer.from([0x05, 0x00, 0x0b, 0x03, 0x10, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Microsoft RPC - Windows service, should not be exposed'
	},
	177: {
		name: 'XDMCP',
		createPacket: (host) => Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'XDMCP - X Display Manager, allows remote X11 access'
	},
	389: {
		name: 'LDAP',
		createPacket: (host) => Buffer.from([0x30, 0x0c, 0x02, 0x01, 0x01, 0x60, 0x07, 0x02, 0x01, 0x03, 0x04, 0x00, 0x80, 0x00]),
		securityRisk: 'high',
		securityNote: 'LDAP - Directory service, often misconfigured'
	},
	427: {
		name: 'SLP',
		createPacket: (host) => Buffer.from([0x02, 0x01, 0x00, 0x00, 0x00, 0x11, 0x00, 0x00, 0x00, 0x00, 0x65, 0x6e, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'SLP - Service Location Protocol, may expose services'
	},
	443: {
		name: 'HTTPS/QUIC',
		createPacket: (host) => Buffer.from([0xc0, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'low',
		securityNote: 'HTTPS/QUIC - Secure web protocol over UDP'
	},
	445: {
		name: 'Microsoft SMB',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x85, 0xff, 0x53, 0x4d, 0x42, 0x72, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Microsoft SMB - File sharing, frequently targeted'
	},
	464: {
		name: 'Kerberos Change Password',
		createPacket: (host) => Buffer.from([0x6a, 0x81, 0x1e, 0x30, 0x1b, 0xa1, 0x03, 0x02, 0x01, 0x05]),
		securityRisk: 'high',
		securityNote: 'Kerberos Change Password - Authentication service'
	},
	500: {
		name: 'IKE',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x10, 0x02, 0x00]),
		securityRisk: 'medium',
		securityNote: 'IKE - IPSec key exchange, verify VPN configuration'
	},
	631: {
		name: 'IPP',
		createPacket: (host) => Buffer.from('POST /ipp HTTP/1.1\r\nHost: ' + host + '\r\n\r\n'),
		securityRisk: 'medium',
		securityNote: 'IPP - Internet Printing Protocol'
	},
	749: {
		name: 'Kerberos Admin',
		createPacket: (host) => Buffer.from([0x6a, 0x81, 0x1e, 0x30, 0x1b, 0xa1, 0x03, 0x02, 0x01, 0x05]),
		securityRisk: 'high',
		securityNote: 'Kerberos Admin - Kerberos administration'
	},
	1024: {
		name: 'Dynamic RPC',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Dynamic RPC - Windows dynamic port range'
	},
	1025: {
		name: 'Dynamic RPC',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Dynamic RPC - Windows dynamic port range'
	},
	1026: {
		name: 'Dynamic RPC',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Dynamic RPC - Windows dynamic port range'
	},
	1027: {
		name: 'Dynamic RPC',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Dynamic RPC - Windows dynamic port range'
	},
	1028: {
		name: 'Dynamic RPC',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Dynamic RPC - Windows dynamic port range'
	},
	1029: {
		name: 'Dynamic RPC',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Dynamic RPC - Windows dynamic port range'
	},
	1030: {
		name: 'Dynamic RPC',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Dynamic RPC - Windows dynamic port range'
	},
	1433: {
		name: 'SQL Server Browser',
		createPacket: (host) => Buffer.from([0x02]),
		securityRisk: 'high',
		securityNote: 'SQL Server Browser - Database discovery service'
	},
	1434: {
		name: 'SQL Server Browser',
		createPacket: (host) => Buffer.from([0x02]),
		securityRisk: 'high',
		securityNote: 'SQL Server Browser - Database discovery service'
	},
	1900: {
		name: 'UPnP',
		createPacket: (host) => Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nST: upnp:rootdevice\r\nMX: 3\r\n\r\n'),
		securityRisk: 'high',
		securityNote: 'UPnP - Universal Plug and Play, often exploitable'
	},
	2049: {
		name: 'NFS',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x86, 0xa3]),
		securityRisk: 'high',
		securityNote: 'NFS - Network File System, often misconfigured'
	},
	2302: {
		name: 'Halo',
		createPacket: (host) => Buffer.from([0xfe, 0xfd, 0x09, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'low',
		securityNote: 'Halo - Game server query protocol'
	},
	2483: {
		name: 'Oracle DB SSL',
		createPacket: (host) => Buffer.from([0x00, 0x57, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x36]),
		securityRisk: 'high',
		securityNote: 'Oracle Database SSL - Database access'
	},
	3283: {
		name: 'Apple Remote Desktop',
		createPacket: (host) => Buffer.from([0x00, 0x0e, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02]),
		securityRisk: 'high',
		securityNote: 'Apple Remote Desktop - Remote access service'
	},
	3389: {
		name: 'RDP',
		createPacket: (host) => Buffer.from([0x03, 0x00, 0x00, 0x13, 0x0e, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x0b, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'RDP - Remote Desktop Protocol over UDP'
	},
	3784: {
		name: 'Bfd Control',
		createPacket: (host) => Buffer.from([0x20, 0xc0, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'BFD Control - Bidirectional Forwarding Detection'
	},
	3785: {
		name: 'Bfd Echo',
		createPacket: (host) => Buffer.from([0x20, 0xc0, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'BFD Echo - Bidirectional Forwarding Detection'
	},
	4500: {
		name: 'IPSec NAT-T',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x10, 0x02, 0x00]),
		securityRisk: 'medium',
		securityNote: 'IPSec NAT-T - VPN over NAT, verify configuration'
	},
	4665: {
		name: 'eMule',
		createPacket: (host) => Buffer.from([0xe3, 0x91, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'eMule - Peer-to-peer file sharing'
	},
	4672: {
		name: 'eMule',
		createPacket: (host) => Buffer.from([0xe3, 0x91, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'eMule - Peer-to-peer file sharing'
	},
	5004: {
		name: 'RTP',
		createPacket: (host) => Buffer.from([0x80, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'RTP - Real-time Transport Protocol'
	},
	5005: {
		name: 'RTCP',
		createPacket: (host) => Buffer.from([0x80, 0xc8, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'RTCP - Real-time Control Protocol'
	},
	5351: {
		name: 'NAT-PMP',
		createPacket: (host) => Buffer.from([0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'NAT-PMP - NAT Port Mapping Protocol, router exploitation'
	},
	5354: {
		name: 'Multicast DNS',
		createPacket: (host) => createMdnsQuery(),
		securityRisk: 'medium',
		securityNote: 'Multicast DNS - Service discovery protocol'
	},
	5632: {
		name: 'PCAnywhere',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'PCAnywhere - Remote access software'
	},
	6112: {
		name: 'Battle.net',
		createPacket: (host) => Buffer.from([0xf7, 0x2f, 0x00, 0x00, 0x50, 0x58, 0x33, 0x57]),
		securityRisk: 'low',
		securityNote: 'Battle.net - Gaming service'
	},
	6346: {
		name: 'Gnutella',
		createPacket: (host) => Buffer.from('GNUTELLA CONNECT/0.6\r\n\r\n'),
		securityRisk: 'medium',
		securityNote: 'Gnutella - Peer-to-peer file sharing'
	},
	6347: {
		name: 'Gnutella',
		createPacket: (host) => Buffer.from('GNUTELLA CONNECT/0.6\r\n\r\n'),
		securityRisk: 'medium',
		securityNote: 'Gnutella - Peer-to-peer file sharing'
	},
	6881: {
		name: 'BitTorrent',
		createPacket: (host) => Buffer.from([0x13, 0x42, 0x69, 0x74, 0x54, 0x6f, 0x72, 0x72, 0x65, 0x6e, 0x74, 0x20, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x63, 0x6f, 0x6c]),
		securityRisk: 'medium',
		securityNote: 'BitTorrent - Peer-to-peer file sharing'
	},
	6999: {
		name: 'BitTorrent',
		createPacket: (host) => Buffer.from([0x13, 0x42, 0x69, 0x74, 0x54, 0x6f, 0x72, 0x72, 0x65, 0x6e, 0x74, 0x20, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x63, 0x6f, 0x6c]),
		securityRisk: 'medium',
		securityNote: 'BitTorrent - Peer-to-peer file sharing'
	},
	7001: {
		name: 'Cassandra',
		createPacket: (host) => Buffer.from([0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Cassandra - Database cluster communication'
	},
	7777: {
		name: 'Game Server',
		createPacket: (host) => Buffer.from('ping'),
		securityRisk: 'low',
		securityNote: 'Game Server - Various games use this port'
	},
	8000: {
		name: 'iRDMI',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'medium',
		securityNote: 'iRDMI - Intelligent Platform Management'
	},
	8080: {
		name: 'HTTP Alternate',
		createPacket: (host) => Buffer.from('GET / HTTP/1.1\r\nHost: ' + host + '\r\n\r\n'),
		securityRisk: 'medium',
		securityNote: 'HTTP Alternate - Web server on non-standard port'
	},
	8443: {
		name: 'HTTPS Alternate',
		createPacket: (host) => Buffer.from([0x16, 0x03, 0x01, 0x00, 0x2f, 0x01, 0x00, 0x00, 0x2b]),
		securityRisk: 'medium',
		securityNote: 'HTTPS Alternate - Secure web server on non-standard port'
	},
	9001: {
		name: 'Tor ORPort',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x03]),
		securityRisk: 'medium',
		securityNote: 'Tor ORPort - Tor network communication'
	},
	9030: {
		name: 'Tor DirPort',
		createPacket: (host) => Buffer.from('GET /tor/status-vote/current/consensus HTTP/1.1\r\nHost: ' + host + '\r\n\r\n'),
		securityRisk: 'medium',
		securityNote: 'Tor DirPort - Tor directory service'
	},
	10000: {
		name: 'Network Data Management',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Network Data Management - Backup/management service'
	},
	11211: {
		name: 'Memcached',
		createPacket: (host) => Buffer.from('stats\r\n'),
		securityRisk: 'high',
		securityNote: 'Memcached - Often exposed without authentication'
	},
	13720: {
		name: 'NetBackup',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'NetBackup - Backup service, often vulnerable'
	},
	13721: {
		name: 'NetBackup',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'NetBackup - Backup service, often vulnerable'
	},
	17185: {
		name: 'VxWorks Debug',
		createPacket: (host) => Buffer.from([0x50, 0x26, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'VxWorks Debug - Embedded system debugging'
	},
	19540: {
		name: 'TES Entertainment',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'low',
		securityNote: 'TES Entertainment - Game server'
	},
	20000: {
		name: 'DNP3',
		createPacket: (host) => Buffer.from([0x05, 0x64, 0x05, 0xc9, 0x01, 0x00, 0x00, 0x04]),
		securityRisk: 'high',
		securityNote: 'DNP3 - Industrial control protocol'
	},
	26000: {
		name: 'Quake',
		createPacket: (host) => Buffer.from([0xff, 0xff, 0xff, 0xff, 0x67, 0x65, 0x74, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73]),
		securityRisk: 'low',
		securityNote: 'Quake - Game server'
	},
	27960: {
		name: 'Quake III',
		createPacket: (host) => Buffer.from([0xff, 0xff, 0xff, 0xff, 0x67, 0x65, 0x74, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73]),
		securityRisk: 'low',
		securityNote: 'Quake III - Game server'
	},
	28960: {
		name: 'Call of Duty',
		createPacket: (host) => Buffer.from([0xff, 0xff, 0xff, 0xff, 0x67, 0x65, 0x74, 0x73, 0x74, 0x61, 0x74, 0x75, 0x73]),
		securityRisk: 'low',
		securityNote: 'Call of Duty - Game server'
	},
	33434: {
		name: 'Traceroute',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'low',
		securityNote: 'Traceroute - Network diagnostic tool'
	},
	41794: {
		name: 'Crestron Control',
		createPacket: (host) => Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Crestron Control - Building automation system'
	},
	44818: {
		name: 'EtherNet/IP',
		createPacket: (host) => Buffer.from([0x65, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'EtherNet/IP - Industrial automation protocol'
	},
	54321: {
		name: 'Bo2k',
		createPacket: (host) => Buffer.from([0x00, 0x00, 0x00, 0x00]),
		securityRisk: 'high',
		securityNote: 'Bo2k - Often associated with malware'
	},
	623: {
		name: 'IPMI',
		createPacket: (host) => Buffer.from([0x06, 0x00, 0xff, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0x20, 0x18, 0xc8, 0x81, 0x00, 0x38, 0x8e, 0x04, 0xb5]),
		securityRisk: 'high',
		securityNote: 'IPMI - Intelligent Platform Management Interface'
	},
	7547: {
		name: 'CWMP',
		createPacket: (host) => Buffer.from('GET /acs HTTP/1.1\r\nHost: ' + host + '\r\n\r\n'),
		securityRisk: 'high',
		securityNote: 'CWMP - TR-069 device management protocol'
	}
};

/**
 * Gera um pacote UDP para um protocolo específico
 * @param {number} port - Porta do protocolo
 * @param {string} host - Host de destino
 * @returns {Buffer|null} Pacote UDP ou null se protocolo não suportado
 */
export function getUdpPacket(port, host = 'localhost') {
	const protocol = udpProtocols[port];
	if (protocol && protocol.createPacket) {
		return protocol.createPacket(host);
	}
	return null;
}

/**
 * Obtém informações sobre um protocolo UDP específico
 * @param {number} port - Número da porta
 * @returns {object|null} Informações do protocolo incluindo nome, risco e nota de segurança
 */
export function getProtocolInfo(port) {
	const protocol = udpProtocols[port];
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
 * Lista todas as portas UDP suportadas
 * @returns {number[]} Array com todas as portas UDP suportadas
 */
export function getSupportedPorts() {
	return Object.keys(udpProtocols).map(port => parseInt(port));
}

/**
 * Obtém protocolos UDP por nível de risco
 * @param {string} riskLevel - Nível de risco: 'low', 'medium', 'high'
 * @returns {object[]} Array de protocolos do nível de risco especificado
 */
export function getProtocolsByRisk(riskLevel) {
	return Object.entries(udpProtocols)
		.filter(([port, info]) => info.securityRisk === riskLevel)
		.map(([port, info]) => ({
			port: parseInt(port),
			name: info.name,
			securityNote: info.securityNote
		}));
}
