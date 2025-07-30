// Módulo para criação de pacotes ICMP IPv4 e IPv6
import net from 'net';
import { calculateICMPv6Checksum, ipv6ToBuffer, getLocalIPv6 } from './ipv6-utils.js';

// Criar pacote IPv4 com Don't Fragment
export function createIPv4Packet(targetIP, size) {
    // Cabeçalho IP (20 bytes)
    const ipHeader = Buffer.alloc(20);
    ipHeader.writeUInt8(0x45, 0);  // Version (4) + Header Length (5 * 4 = 20 bytes)
    ipHeader.writeUInt8(0x00, 1);  // Type of Service
    ipHeader.writeUInt16BE(size, 2); // Total Length
    ipHeader.writeUInt16BE(Math.floor(Math.random() * 65535), 4); // Identification
    ipHeader.writeUInt16BE(0x4000, 6); // Flags: Don't Fragment (bit 1) = 0x4000
    ipHeader.writeUInt8(64, 8);     // TTL
    ipHeader.writeUInt8(1, 9);      // Protocol (ICMP)
    ipHeader.writeUInt16BE(0, 10);  // Header Checksum (será calculado)
    
    // Source IP (será preenchido pelo sistema)
    ipHeader.writeUInt32BE(0, 12);
    
    // Destination IP
    const targetParts = targetIP.split('.').map(Number);
    ipHeader.writeUInt8(targetParts[0], 16);
    ipHeader.writeUInt8(targetParts[1], 17);
    ipHeader.writeUInt8(targetParts[2], 18);
    ipHeader.writeUInt8(targetParts[3], 19);

    // Calcular checksum do cabeçalho IP
    let ipChecksum = 0;
    for (let i = 0; i < 20; i += 2) {
        if (i !== 10) { // Pular o campo checksum
            ipChecksum += ipHeader.readUInt16BE(i);
        }
    }
    while (ipChecksum > 0xFFFF) {
        ipChecksum = (ipChecksum & 0xFFFF) + (ipChecksum >> 16);
    }
    ipChecksum = (~ipChecksum) & 0xFFFF;
    ipHeader.writeUInt16BE(ipChecksum, 10);

    // Criar pacote ICMP Echo Request
    const icmpSize = size - 20; // Tamanho ICMP = tamanho total - cabeçalho IP
    const icmpHeader = Buffer.alloc(8);
    icmpHeader.writeUInt8(8, 0);  // Type: Echo Request
    icmpHeader.writeUInt8(0, 1);  // Code: 0
    icmpHeader.writeUInt16BE(0, 2); // Checksum (será calculado)
    icmpHeader.writeUInt16BE(process.pid & 0xFFFF, 4); // ID
    icmpHeader.writeUInt16BE(1, 6); // Sequence

    // Criar payload para atingir o tamanho ICMP desejado
    const payloadSize = Math.max(0, icmpSize - 8); // icmpSize - ICMP header
    const payload = Buffer.alloc(payloadSize, 0x42); // Preenche com 'B'

    const icmpPacket = Buffer.concat([icmpHeader, payload]);

    // Calcular checksum ICMP
    let icmpChecksum = 0;
    for (let i = 0; i < icmpPacket.length; i += 2) {
        icmpChecksum += (icmpPacket[i] << 8) + (i + 1 < icmpPacket.length ? icmpPacket[i + 1] : 0);
    }
    while (icmpChecksum > 0xFFFF) {
        icmpChecksum = (icmpChecksum & 0xFFFF) + (icmpChecksum >> 16);
    }
    icmpChecksum = (~icmpChecksum) & 0xFFFF;
    icmpPacket.writeUInt16BE(icmpChecksum, 2);

    // Pacote completo IP + ICMP
    return Buffer.concat([ipHeader, icmpPacket]);
}

// Criar pacote IPv6 (apenas ICMPv6, kernel gerencia IPv6 header)
export function createIPv6Packet(targetIP, size) {
    // Para IPv6, calculamos o tamanho do payload ICMPv6
    // size total - IPv6 header (40 bytes) = payload ICMPv6
    const icmpv6Size = Math.max(8, size - 40); // Mínimo 8 bytes para header ICMPv6
    
    const icmpHeader = Buffer.alloc(8);
    icmpHeader.writeUInt8(128, 0); // Type: Echo Request (ICMPv6)
    icmpHeader.writeUInt8(0, 1);   // Code: 0
    icmpHeader.writeUInt16BE(0, 2); // Checksum (será calculado)
    icmpHeader.writeUInt16BE(process.pid & 0xFFFF, 4); // ID
    icmpHeader.writeUInt16BE(1, 6); // Sequence

    // Criar payload para atingir o tamanho desejado
    const payloadSize = Math.max(0, icmpv6Size - 8); // icmpv6Size - ICMP header
    const payload = Buffer.alloc(payloadSize, 0x42);

    const icmpPacket = Buffer.concat([icmpHeader, payload]);

    // Para ICMPv6, precisamos calcular o checksum com pseudo-header
    const sourceIP = getLocalIPv6();
    const checksum = calculateICMPv6Checksum(sourceIP, targetIP, icmpPacket);
    icmpPacket.writeUInt16BE(checksum, 2);

    return icmpPacket;
}
