// netlify/functions/health.mjs
export async function handler() {
  const url =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '(missing)';
  const hasAnon = !!(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      ok: true,
      supabase_url_present: url !== '(missing)',
      anon_key_present: hasAnon,
      service_role_present: hasService,
    }),
  };
}
