<?php
// arquivo: api/zenia.php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Aceita apenas POST
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido']);
    exit();
}

try {
    // Pegar dados do request
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($data['prompt']) || empty($data['prompt'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Prompt é obrigatório']);
        exit();
    }

    $prompt = $data['prompt'];

    // Token fica seguro em variável de ambiente ou arquivo de configuração
    // Opção 1: Variável de ambiente
    $HF_TOKEN = getenv('HUGGING_FACE_TOKEN');
    
    // Opção 2: Se não estiver em variável de ambiente, use arquivo de config (não commitar no git!)
    if (empty($HF_TOKEN)) {
        if (file_exists(__DIR__ . '/config.php')) {
            require_once __DIR__ . '/config.php';
            $HF_TOKEN = defined('HUGGING_FACE_TOKEN') ? HUGGING_FACE_TOKEN : '';
        }
    }

    if (empty($HF_TOKEN)) {
        http_response_code(500);
        echo json_encode(['error' => 'Token não configurado no servidor']);
        exit();
    }

    // Fazer requisição ao Hugging Face
    $url = 'https://api-inference.huggingface.co/models/Zenia-projects/ZENIA';
    
    $ch = curl_init($url);
    
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $HF_TOKEN,
            'Content-Type: application/json'
        ],
        CURLOPT_POSTFIELDS => json_encode(['inputs' => $prompt])
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        throw new Exception('Erro de conexão: ' . $curlError);
    }

    if ($httpCode !== 200) {
        $errorData = json_decode($response, true);
        throw new Exception($errorData['error'] ?? 'Modelo indisponível (HTTP ' . $httpCode . ')');
    }

    $result = json_decode($response, true);

    if (!is_array($result) || !isset($result[0]['generated_text'])) {
        throw new Exception('Resposta inválida do modelo');
    }

    $responseText = $result[0]['generated_text'];
    
    // Remover a prompt da resposta
    $responseText = str_replace($prompt, '', $responseText);
    $responseText = trim($responseText);

    if (empty($responseText)) {
        $responseText = "Processado com sucesso!";
    }

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'response' => $responseText
    ]);

} catch (Exception $err) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erro ao processar: ' . $err->getMessage()
    ]);
}
?>
