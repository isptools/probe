// Teste simples para validar URLs malformadas
import { httpModule } from './modules/http/main.js';

// Mock do request e reply para testar
const mockRequest = {
    params: {
        id: 'https:///%20177.155.136.161' // URL problemática do erro
    }
};

const mockReply = {};

console.log('Testando URL malformada...');
console.log('URL de entrada:', mockRequest.params.id);

try {
    const result = await httpModule.handler(mockRequest, mockReply);
    console.log('Resultado:', JSON.stringify(result, null, 2));
} catch (error) {
    console.error('Erro capturado:', error);
}
