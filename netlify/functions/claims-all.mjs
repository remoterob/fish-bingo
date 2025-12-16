// netlify/functions/claims-all.mjs
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const ok  = (b)=>({ statusCode:200, headers:{'Content-Type':'application/json', ...CORS}, body:JSON.stringify(b) })
const bad = (c,b)=>({ statusCode:c,   headers:{'Content-Type':'application/json', ...CORS}, body:JSON.stringify(b) })

export async function handler(event){
  if (event.httpMethod === 'OPTIONS') return ok({ ok:true })
  if (event.httpMethod !== 'GET')     return bad(405, { error:'Method not allowed' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return bad(500, { error:'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  try{
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
      auth: { persistSession:false, autoRefreshToken:false },
    })

    // ✅ include photo_url so admin / leaderboards see uploaded pics
    const { data: claimRows, error: cErr } = await admin
      .from('claims')
      .select('user_id, species_slug, first_time, created_at, photo_url')
      .order('created_at', { ascending:false })
    if (cErr) return bad(500, { error:'Failed to load claims', details:cErr.message })

    const userIds = Array.from(new Set((claimRows||[]).map(r => r.user_id))).filter(Boolean)
    let nameById = new Map()
    if (userIds.length){
      const { data: profiles, error: pErr } = await admin
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)
      if (pErr) return bad(500, { error:'Failed to load profiles', details:pErr.message })
      for (const p of (profiles || [])) nameById.set(p.id, p.display_name || 'Diver')
    }

    const claims = (claimRows || []).map(r => ({
      ...r,
      display_name: nameById.get(r.user_id) || 'Diver'
    }))

    return ok({ claims })
  }catch(e){
    return bad(500, { error:'Unhandled error', details: e?.message || e })
  }
}
