// netlify/functions/claude.js
// ブラウザ → この関数 → OpenAI API の順で中継する

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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:    'gpt-4o-mini', // 低コスト・高速
        messages: body.messages,
        max_tokens: body.max_tokens || 1000,
      }),
    });

    const data = await response.json();

    console.log('OpenAI status:', response.status);
    console.log('OpenAI response:', JSON.stringify(data));

    // app.js側がAnthropicフォーマットを期待しているので変換する
    const converted = {
      content: [
        { type: 'text', text: data.choices?.[0]?.message?.content || '' }
      ]
    };

    return {
      statusCode: response.status,
      headers: corsHeaders(),
      body: JSON.stringify(converted),
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
