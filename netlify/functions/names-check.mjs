// netlify/functions/names-check.mjs
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ok  = (b)=>({ statusCode:200, headers:{ 'Content-Type':'application/json', ...CORS }, body: JSON.stringify(b) })
const bad = (c,b)=>({ statusCode:c,   headers:{ 'Content-Type':'application/json', ...CORS }, body: JSON.stringify(b) })

export async function handler(event){
  if (event.httpMethod === 'OPTIONS') return ok({ ok:true })
  if (event.httpMethod !== 'POST')     return bad(405, { error:'Method not allowed' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return bad(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  let body = {}
  try { body = JSON.parse(event.body||'{}') } catch { return bad(400,{ error:'Invalid JSON' }) }
  const name  = (body.name  || body.display_name || '').trim()
  const email = (body.email || '').trim().toLowerCase()

  if (!name)  return bad(400, { error:'Name is required' })
  if (!email) return bad(400, { error:'Email is required' })

  try{
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global:{ headers:{ apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
      auth:{ persistSession:false, autoRefreshToken:false },
    })

    // Case-insensitive exact match on display_name
    const { data: matches, error: pErr } = await admin
      .from('profiles')
      .select('id, display_name')
      .ilike('display_name', name)    // exact string, case-insensitive (no % wildcards)
      .limit(2)

    if (pErr) return bad(500, { error:'Failed to check name', details:pErr.message })

    if (!matches || matches.length === 0) {
      // Name does not exist anywhere → free to use
      return ok({ available:true, sameOwner:false })
    }

    // Name exists — check if the owner email matches the email provided.
    const ownerProfile = matches[0]
    const { data: ownerUser, error: uErr } = await admin.auth.admin.getUserById(ownerProfile.id)
    if (uErr) {
      // If we can’t fetch user for some reason, play it safe: mark as taken.
      return ok({ available:false, sameOwner:false, message:'sorry that name is already taken, try another.' })
    }

    const ownerEmail = (ownerUser?.user?.email || '').toLowerCase()
    if (ownerEmail && ownerEmail === email) {
      // Same person → allow (they’re just reusing their name)
      return ok({ available:true, sameOwner:true })
    }

    // Different email → block
    return ok({ available:false, sameOwner:false, message:'sorry that name is already taken, try another.' })
  }catch(e){
    return bad(500, { error:'Unhandled error', details: e?.message || String(e) })
  }
}
