// Utilitários para IPv6
import net from 'net';
import os from 'os';

// Função para calcular checksum ICMPv6
export function calculateICMPv6Checksum(sourceIP, targetIP, icmpPacket) {
    // Para ICMPv6, o checksum inclui um pseudo-header IPv6
    const pseudoHeader = Buffer.alloc(40);
    
    // Source address (16 bytes)
    const sourceBuffer = ipv6ToBuffer(sourceIP);
    sourceBuffer.copy(pseudoHeader, 0);
    
    // Destination address (16 bytes)
    const targetBuffer = ipv6ToBuffer(targetIP);
    targetBuffer.copy(pseudoHeader, 16);
    
    // Upper-Layer Packet Length (4 bytes)
    pseudoHeader.writeUInt32BE(icmpPacket.length, 32);
    
    // Next Header (4 bytes, último byte = 58 para ICMPv6)
    pseudoHeader.writeUInt32BE(58, 36);
    
    // Concatenar pseudo-header com pacote ICMP
    const fullPacket = Buffer.concat([pseudoHeader, icmpPacket]);
    
    let checksum = 0;
    for (let i = 0; i < fullPacket.length; i += 2) {
        checksum += (fullPacket[i] << 8) + (i + 1 < fullPacket.length ? fullPacket[i + 1] : 0);
    }
    
    while (checksum > 0xFFFF) {
        checksum = (checksum & 0xFFFF) + (checksum >> 16);
    }
    
    return (~checksum) & 0xFFFF;
}

// Converter IPv6 string para buffer
export function ipv6ToBuffer(ipv6String) {
    const buffer = Buffer.alloc(16);
    const parts = expandIPv6(ipv6String).split(':');
    
    for (let i = 0; i < 8; i++) {
        const value = parseInt(parts[i], 16);
        buffer.writeUInt16BE(value, i * 2);
    }
    
    return buffer;
}

// Expandir IPv6 comprimido para formato completo
export function expandIPv6(ipv6) {
    // Se já está expandido
    if (ipv6.indexOf('::') === -1 && ipv6.split(':').length === 8) {
        return ipv6;
    }
    
    // Lidar com ::
    if (ipv6.indexOf('::') !== -1) {
        const parts = ipv6.split('::');
        const left = parts[0] ? parts[0].split(':') : [];
        const right = parts[1] ? parts[1].split(':') : [];
        const missing = 8 - left.length - right.length;
        
        const middle = Array(missing).fill('0000');
        const full = left.concat(middle).concat(right);
        
        return full.map(part => part.padStart(4, '0')).join(':');
    }
    
    // Apenas preencher com zeros à esquerda
    return ipv6.split(':').map(part => part.padStart(4, '0')).join(':');
}

// Obter endereço IP local para IPv6
export function getLocalIPv6() {
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv6' && !iface.internal && iface.scopeid === 0) {
                return iface.address;
            }
        }
    }
    
    return '::1'; // fallback para localhost
}
