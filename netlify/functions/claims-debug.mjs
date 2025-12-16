// netlify/functions/claims-debug.mjs
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, OPTIONS' }
const ok  = (b)=>({ statusCode:200, headers:{'Content-Type':'application/json',...CORS}, body:JSON.stringify(b,null,2) })
const bad = (c,b)=>({ statusCode:c,   headers:{'Content-Type':'application/json',...CORS}, body:JSON.stringify(b,null,2) })

export async function handler(event){
  if (event.httpMethod === 'OPTIONS') return ok({ ok:true })
  if (event.httpMethod !== 'GET')     return bad(405, { error:'Method not allowed' })

  const projectRef = (SUPABASE_URL||'').match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] || null
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return bad(500, { error:'Missing envs', have:{ SUPABASE_URL:!!SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY:!!SUPABASE_SERVICE_ROLE_KEY }, projectRef })
  }

  try{
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global:{ headers:{ apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
      auth:{ persistSession:false, autoRefreshToken:false },
    })

    const { count: claims_count } = await admin.from('claims').select('id', { head:true, count:'exact' })
    const { data: sample_claims } = await admin
      .from('claims')
      .select('id,user_id,species_slug,first_time,created_at')
      .order('created_at', { ascending:false })
      .limit(5)

    const { count: profiles_count } = await admin.from('profiles').select('id', { head:true, count:'exact' })

    return ok({
      debug: { supabase_url: SUPABASE_URL, project_ref: projectRef },
      counts: { claims: claims_count ?? null, profiles: profiles_count ?? null },
      sample_claims: sample_claims ?? []
    })
  }catch(e){
    return bad(500, { error:'Unhandled error', details:e?.message || String(e) })
  }
}
