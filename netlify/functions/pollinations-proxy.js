const TEXT_API = 'https://text.pollinations.ai/';

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

exports.handler = async (event) => {
  const origin = event.headers && event.headers.origin ? event.headers.origin : '*';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors(origin), body: '' };
  }

  try {
    const body = event.body || '{}';
    const resp = await fetch(TEXT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const text = await resp.text();
    const statusCode = resp.ok ? 200 : resp.status || 502;
    return {
      statusCode,
      headers: { ...cors(origin), 'Content-Type': 'text/plain' },
      body: text,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: cors(origin),
      body: 'Erro ao contactar Pollinations',
    };
  }
};
