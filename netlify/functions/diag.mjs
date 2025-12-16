const cors = (o) => ({
  'Access-Control-Allow-Origin': o || '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
})
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(event.headers?.origin), body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: cors(event.headers?.origin), body: JSON.stringify({ message: 'Method Not Allowed' }) }
  return {
    statusCode: 200,
    headers: cors(event.headers?.origin),
    body: JSON.stringify({
      ok: true,
      env: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }),
  }
}
