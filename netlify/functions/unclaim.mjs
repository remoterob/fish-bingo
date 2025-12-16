import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ok  = (b)=>({ statusCode:200, headers:{'Content-Type':'application/json',...CORS}, body:JSON.stringify(b) })
const bad = (c,b)=>({ statusCode:c,   headers:{'Content-Type':'application/json',...CORS}, body:JSON.stringify(b) })

export async function handler(event){
  if (event.httpMethod === 'OPTIONS') return ok({ ok:true })
  if (event.httpMethod !== 'POST')   return bad(405, { error:'Method not allowed' })
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return bad(500,{ error:'Missing SUPABASE_URL or SUPABASE_ANON_KEY' })

  const authHeader = event.headers?.authorization || event.headers?.Authorization
  if (!authHeader?.startsWith('Bearer ')) return bad(401,{ error:'Missing Authorization bearer token' })
  const jwt = authHeader.slice('Bearer '.length)

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return bad(400, { error:'Invalid JSON body' }) }
  const species_slug = (body.species_slug || body.speciesSlug || '').trim()
  if (!species_slug) return bad(400, { error:'species_slug is required' })

  try {
    const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession:false, autoRefreshToken:false },
    })

    const { data: u, error: uErr } = await asUser.auth.getUser()
    if (uErr || !u?.user?.id) return bad(401, { error:'Invalid user token', details:uErr?.message })
    const user_id = u.user.id

    // Find the most recent claim for this species
    const { data: rows, error: qErr } = await asUser
      .from('claims')
      .select('id, created_at')
      .eq('user_id', user_id)
      .eq('species_slug', species_slug)
      .order('created_at', { ascending:false })
      .limit(1)

    if (qErr) return bad(500, { error:'Failed to find claim', details:qErr.message })
    if (!rows || rows.length === 0) return ok({ ok:true, deleted:false }) // nothing to delete

    const claimId = rows[0].id
    const { error: dErr } = await asUser
      .from('claims')
      .delete()
      .eq('id', claimId)

    if (dErr) return bad(500, { error:'Failed to delete claim', details:dErr.message })
    return ok({ ok:true, deleted:true })
  } catch (e) {
    return bad(500, { error:'Unhandled error', details: e?.message || e })
  }
}
