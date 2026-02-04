// arquivo: netlify/functions/zenia.js

exports.handler = async (event) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Responder a OPTIONS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Aceita apenas POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método não permitido' })
        };
    }

    try {
        const data = JSON.parse(event.body);

        if (!data.prompt) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Prompt é obrigatório' })
            };
        }

        const prompt = data.prompt;

        // Token fica seguro em variáveis de ambiente
        const HF_TOKEN = process.env.HUGGING_FACE_TOKEN;

        if (!HF_TOKEN) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Token não configurado no servidor' })
            };
        }

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

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!Array.isArray(result) || !result[0]?.generated_text) {
            throw new Error('Resposta inválida do modelo');
        }

        let responseText = result[0].generated_text;
        responseText = responseText.replace(prompt, '').trim();

        if (!responseText) {
            responseText = 'Processado com sucesso!';
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                response: responseText
            })
        };

    } catch (err) {
        console.error('Erro:', err);
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
