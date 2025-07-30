// Módulo para testes de MTU usando raw sockets
import net from 'net';
import rawSocket from 'raw-socket';
import { createIPv4Packet, createIPv6Packet } from './packet-builder.js';

// Configuração específica do módulo MTU
const MTU_TIMEOUT = parseInt(process.env.MTU_TIMEOUT) || 1000; // 1000ms para descoberta de MTU
const MTU_TEST_DELAY = parseInt(process.env.MTU_TEST_DELAY) || 20; // 20ms de delay entre testes

// Função interna para teste de MTU usando raw socket
async function testMTUWithRawSocket(targetIP, size, timeout = MTU_TIMEOUT) {
    return new Promise((resolve) => {
        try {
            const isIPv6 = net.isIPv6(targetIP);
            
            // Criar raw socket apropriado para IPv4 ou IPv6
            const socket = rawSocket.createSocket({
                protocol: isIPv6 ? rawSocket.Protocol.ICMPv6 : rawSocket.Protocol.ICMP,
                addressFamily: isIPv6 ? rawSocket.AddressFamily.IPv6 : rawSocket.AddressFamily.IPv4
            });

            // Configurar socket para enviar cabeçalho IP completo (apenas para IPv4)
            if (!isIPv6) {
                socket.setOption(rawSocket.SocketLevel.IPPROTO_IP, rawSocket.SocketOption.IP_HDRINCL, 1);
            }

            const startTime = Date.now();
            let responseReceived = false;

            // Timeout handler
            const timeoutId = setTimeout(() => {
                if (!responseReceived) {
                    responseReceived = true;
                    try { socket.close(); } catch (e) {}
                    resolve({
                        size: size,
                        success: false,
                        responseTime: null,
                        error: "Request timed out (DF bit set)"
                    });
                }
            }, timeout);

            // Criar pacote apropriado para IPv4 ou IPv6
            const fullPacket = isIPv6 ? 
                createIPv6Packet(targetIP, size) : 
                createIPv4Packet(targetIP, size);

            // Listener para resposta ICMP/ICMPv6
            socket.on('message', (buffer, source) => {
                if (!responseReceived) {
                    let icmpType;
                    
                    if (isIPv6) {
                        // Para IPv6, o buffer já é o payload ICMPv6
                        icmpType = buffer.length > 0 ? buffer[0] : -1;
                        
                        // Verificar se é uma resposta válida para IPv6
                        if (icmpType === 129) { 
                            // Echo Reply - sucesso
                            responseReceived = true;
                            clearTimeout(timeoutId);
                            const responseTime = Date.now() - startTime;
                            try { socket.close(); } catch (e) {}
                            
                            resolve({
                                size: size,
                                success: true,
                                responseTime: Math.round(responseTime),
                                error: null,
                                icmpType: icmpType
                            });
                        } else if (icmpType === 2) {
                            // Packet Too Big - falha (MTU excedido)
                            responseReceived = true;
                            clearTimeout(timeoutId);
                            try { socket.close(); } catch (e) {}
                            
                            resolve({
                                size: size,
                                success: false,
                                responseTime: null,
                                error: "Packet too big (ICMPv6 type 2)",
                                icmpType: icmpType
                            });
                        }
                    } else {
                        // Para IPv4, precisamos pular o header IP
                        const ipHeaderLength = (buffer[0] & 0x0F) * 4;
                        icmpType = buffer.length > ipHeaderLength ? buffer[ipHeaderLength] : -1;
                        
                        // Verificar se é uma resposta válida para IPv4
                        if (icmpType === 0) {
                            // Echo Reply - sucesso
                            responseReceived = true;
                            clearTimeout(timeoutId);
                            const responseTime = Date.now() - startTime;
                            try { socket.close(); } catch (e) {}
                            
                            resolve({
                                size: size,
                                success: true,
                                responseTime: Math.round(responseTime),
                                error: null,
                                icmpType: icmpType
                            });
                        } else if (icmpType === 3) {
                            // Destination Unreachable - pode ser fragmentation needed
                            responseReceived = true;
                            clearTimeout(timeoutId);
                            try { socket.close(); } catch (e) {}
                            
                            resolve({
                                size: size,
                                success: false,
                                responseTime: null,
                                error: "Fragmentation needed (ICMP type 3)",
                                icmpType: icmpType
                            });
                        }
                    }
                }
            });

            socket.on('error', (error) => {
                if (!responseReceived) {
                    responseReceived = true;
                    clearTimeout(timeoutId);
                    try { socket.close(); } catch (e) {}
                    
                    // Erro de socket pode indicar que o MTU foi excedido
                    const errorMessage = error.message.toLowerCase();
                    const isMTURelated = errorMessage.includes('message too long') || 
                                       errorMessage.includes('packet too big') ||
                                       errorMessage.includes('fragmentation') ||
                                       errorMessage.includes('invalid argument');
                    
                    resolve({
                        size: size,
                        success: false,
                        responseTime: null,
                        error: isMTURelated ? "Packet too large (MTU exceeded)" : error.message
                    });
                }
            });

            // Enviar pacote completo
            socket.send(fullPacket, 0, fullPacket.length, targetIP, (error, bytes) => {
                if (error && !responseReceived) {
                    responseReceived = true;
                    clearTimeout(timeoutId);
                    try { socket.close(); } catch (e) {}
                    
                    // Verificar se o erro está relacionado ao MTU
                    const errorMessage = error.message.toLowerCase();
                    const isMTURelated = errorMessage.includes('message too long') || 
                                       errorMessage.includes('packet too big') ||
                                       errorMessage.includes('fragmentation') ||
                                       errorMessage.includes('invalid argument');
                    
                    resolve({
                        size: size,
                        success: false,
                        responseTime: null,
                        error: isMTURelated ? "Packet too large (MTU exceeded)" : error.message
                    });
                }
            });

        } catch (error) {
            resolve({
                size: size,
                success: false,
                responseTime: null,
                error: error.message
            });
        }
    });
}

// Função para descobrir MTU usando binary search otimizado
export async function discoverMTU(targetIP, timeout = MTU_TIMEOUT) {
    const isIPv6 = net.isIPv6(targetIP);
    
    // Ajustar limites para IPv4 vs IPv6
    const minSize = isIPv6 ? 48 : 28; // IPv6: 40 bytes header + 8 ICMP, IPv4: 20 + 8
    let maxSize = 1500; // MTU Ethernet padrão
    let optimalMTU = 0;
    const results = [];
    
    // Função para testar um tamanho específico de pacote
    const testPacketSize = async (size) => {
        return await testMTUWithRawSocket(targetIP, size, timeout);
    };

    // OTIMIZAÇÃO 1: Teste rápido de valores comuns primeiro
    const commonMTUs = isIPv6 ? [1280, 1410, 1500] : [576, 1280, 1460, 1500];
    let quickTestResult = null;
    
    for (const mtu of commonMTUs) {
        const result = await testPacketSize(mtu);
        results.push(result);
        
        if (result.success) {
            quickTestResult = mtu;
        } else {
            // Se falhou, o MTU está entre o último sucesso e este
            break;
        }
        
        await new Promise(resolve => setTimeout(resolve, MTU_TEST_DELAY));
    }
    
    // OTIMIZAÇÃO 2: Ajustar range baseado no teste rápido
    let searchMin = minSize;
    let searchMax = maxSize;
    
    if (quickTestResult) {
        // Se encontrou sucesso, buscar entre último sucesso e próximo valor comum
        const index = commonMTUs.indexOf(quickTestResult);
        if (index < commonMTUs.length - 1) {
            searchMin = quickTestResult;
            searchMax = commonMTUs[index + 1];
        } else {
            // Se passou de todos os comuns, já temos o MTU
            optimalMTU = quickTestResult;
        }
    } else {
        // Se falhou no primeiro, buscar abaixo do primeiro valor
        searchMax = commonMTUs[0] - 1;
    }
    
    // FASE 1: Binary search otimizado no range reduzido
    if (optimalMTU === 0) {
        while (searchMin <= searchMax) {
            const testSize = Math.floor((searchMin + searchMax) / 2);
            
            // Evitar testar tamanhos já testados
            if (results.some(r => r.size === testSize)) {
                if (results.find(r => r.size === testSize).success) {
                    searchMin = testSize + 1;
                    // Atualizar optimalMTU se encontrou um sucesso
                    optimalMTU = Math.max(optimalMTU, testSize);
                } else {
                    searchMax = testSize - 1;
                }
                continue;
            }
            
            const result = await testPacketSize(testSize);
            results.push(result);
            
            if (result.success) {
                optimalMTU = testSize;
                searchMin = testSize + 1;
            } else {
                searchMax = testSize - 1;
            }
            
            await new Promise(resolve => setTimeout(resolve, MTU_TEST_DELAY));
        }
    }
    
    // Se ainda não encontrou MTU, usar o maior sucesso dos testes rápidos
    if (optimalMTU === 0 && quickTestResult) {
        optimalMTU = quickTestResult;
    }
    
    // Garantir que temos o maior MTU possível dos resultados
    const allSuccessfulSizes = results.filter(r => r.success).map(r => r.size);
    if (allSuccessfulSizes.length > 0) {
        const maxSuccessful = Math.max(...allSuccessfulSizes);
        optimalMTU = Math.max(optimalMTU, maxSuccessful);
    }
    
    // FASE 2: Testar jumbo frames apenas se MTU básico >= 1500
    let supportsJumbo = false;
    if (optimalMTU >= 1500) {
        const jumboSizes = [4352, 8192, 9000];
        
        for (const jumboSize of jumboSizes) {
            const result = await testPacketSize(jumboSize);
            results.push(result);
            
            if (result.success) {
                optimalMTU = jumboSize;
                supportsJumbo = true;
            } else {
                break; // Para no primeiro jumbo frame que falhar
            }
            
            await new Promise(resolve => setTimeout(resolve, MTU_TEST_DELAY));
        }
    }
    
    // OTIMIZAÇÃO 3: Validação mínima e inteligente
    const validationTests = [];
    if (optimalMTU > 0) {
        // Testar apenas os tamanhos críticos
        const criticalSizes = [
            optimalMTU - 1,  // deve passar
            optimalMTU,      // deve passar
            optimalMTU + 1   // deve falhar
        ].filter(size => size >= minSize);
        
        for (const size of criticalSizes) {
            // Evitar reteste se já foi testado
            const existingTest = results.find(r => r.size === size);
            if (existingTest) {
                validationTests.push(existingTest);
                continue;
            }
            
            const validationResult = await testPacketSize(size);
            validationTests.push(validationResult);
            results.push(validationResult);
            
            await new Promise(resolve => setTimeout(resolve, MTU_TEST_DELAY));
        }
        
        // Verificação de consistência rápida
        const mtuPlusOne = validationTests.find(v => v.size === optimalMTU + 1);
        if (mtuPlusOne && mtuPlusOne.success) {
            // Se MTU+1 passou, recalcular
            optimalMTU = mtuPlusOne.size;
        }
    }
    
    return {
        mtu: optimalMTU,
        tests: results.sort((a, b) => a.size - b.size),
        validation: validationTests,
        ipVersion: isIPv6 ? 6 : 4,
        supportsJumbo: supportsJumbo
    };
}
