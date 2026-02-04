// arquivo: netlify/functions/zenia.js

exports.handler = async (event) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json; charset=utf-8'
    };

    // Responder a OPTIONS
    if (event.httpMethod === 'OPTIONS') {
        return { 
            statusCode: 200, 
            headers, 
            body: JSON.stringify({ ok: true })
        };
    }

    // Aceita apenas POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Método não permitido' })
        };
    }

    try {
        let data;
        try {
            data = JSON.parse(event.body || '{}');
        } catch (e) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Body inválido' })
            };
        }

        if (!data.prompt) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Prompt é obrigatório' })
            };
        }

        const prompt = data.prompt;
        console.log('Prompt recebido:', prompt.substring(0, 50));

        // Token fica seguro em variáveis de ambiente
        const HF_TOKEN = process.env.HUGGING_FACE_TOKEN;

        if (!HF_TOKEN) {
            console.error('Token não configurado!');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, error: 'Token não configurado no servidor' })
            };
        }

        console.log('Enviando para Hugging Face...');

        // Fazer requisição ao Hugging Face
        const response = await fetch(
            'https://api-inference.huggingface.co/models/Zenia-projects/ZENIA',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HF_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputs: prompt })
            }
        );

        const responseText = await response.text();
        console.log('Resposta HF status:', response.status);
        console.log('Resposta HF raw:', responseText.substring(0, 200));

        if (!response.ok) {
            try {
                const errorData = JSON.parse(responseText);
                throw new Error(errorData.error || `HTTP ${response.status}`);
            } catch (e) {
                throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 100)}`);
            }
        }

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            throw new Error('Resposta não é JSON válido');
        }

        if (!Array.isArray(result) || !result[0] || !result[0].generated_text) {
            console.error('Formato de resposta inválido:', result);
            throw new Error('Formato de resposta inesperado');
        }

        let generatedText = result[0].generated_text;
        
        // Remover a prompt da resposta
        if (generatedText.includes(prompt)) {
            generatedText = generatedText.replace(prompt, '').trim();
        }

        if (!generatedText) {
            generatedText = 'Processado com sucesso!';
        }

        console.log('Resposta gerada:', generatedText.substring(0, 100));

        const responseBody = {
            success: true,
            response: generatedText
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseBody)
        };

    } catch (err) {
        console.error('Erro completo:', err.message, err.stack);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Erro ao processar: ' + err.message
            })
        };
    }
};
