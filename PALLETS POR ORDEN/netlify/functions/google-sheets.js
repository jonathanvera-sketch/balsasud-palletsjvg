exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { Allow: 'POST, OPTIONS', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' })
    };
  }

  const endpoint = process.env.GOOGLE_SHEETS_ENDPOINT || 'https://script.google.com/macros/s/AKfycbx8bJtetPbpniXy1zabpwBtJbJKyJoyAQ8qiE4UmTAkThyXoO72VWp1A7-QkKKtM1wgLw/exec';
  if (!endpoint) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'GOOGLE_SHEETS_ENDPOINT no está configurado.' })
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: event.body || '{}'
    });

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = { ok: false, error: 'Respuesta no JSON del backend', raw: text.slice(0, 500) };
    }

    return {
      statusCode: response.ok ? 200 : 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(body)
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'No fue posible contactar el backend: ' + error.message })
    };
  }
};
