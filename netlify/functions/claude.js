// netlify/functions/claude.js
// ブラウザ → この関数 → Anthropic API の順で中継する

exports.handler = async (event) => {
  // CORS プリフライト対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);

    console.log('Received messages:', JSON.stringify(body.messages));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      body.model      || 'claude-haiku-4-5-20251001',
        max_tokens: body.max_tokens || 1000,
        messages:   body.messages,
      }),
    });

    const data = await response.json();

    console.log('Anthropic status:', response.status);
    console.log('Anthropic response:', JSON.stringify(data));

    return {
      statusCode: response.status,
      headers: corsHeaders(),
      body: JSON.stringify(data),
    };

  } catch (err) {
    console.log('Error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type':                 'application/json',
  };
}
