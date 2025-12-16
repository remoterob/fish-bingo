// netlify/functions/key-role-debug.mjs
export async function handler(){
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const projectFromUrl = (SUPABASE_URL||'').match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] || null;

  function decode(jwt){
    try{
      const b64 = jwt.split('.')[1]?.replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(Buffer.from(b64,'base64').toString('utf8'));
    }catch{ return null }
  }
  const payload = decode(SUPABASE_SERVICE_ROLE_KEY||'');
  const role = payload?.role || payload?.user_role || null;
  const iss = payload?.iss || null; // e.g. https://hwbfxsnahyvlyarupfwe.supabase.co/auth/v1
  const projectFromKey = iss?.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] || null;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      url_project: projectFromUrl,
      key_role: role,
      key_iss: iss,
      key_project: projectFromKey
    }, null, 2)
  };
}
