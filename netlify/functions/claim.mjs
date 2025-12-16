// netlify/functions/claim.mjs
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
}
const ok  = (b)=>({ statusCode:200, headers:{'Content-Type':'application/json',...CORS}, body:JSON.stringify(b) })
const bad = (c,b)=>({ statusCode:c,   headers:{'Content-Type':'application/json',...CORS}, body:JSON.stringify(b) })

function getJwt(event){
  const a = event.headers?.authorization || event.headers?.Authorization
  if (!a?.startsWith('Bearer ')) return null
  return a.slice('Bearer '.length)
}

function getSpeciesSlug(event){
  const qp = event.queryStringParameters || {}
  const fromQuery = (qp.species_slug || qp.speciesSlug || '').trim()
  if (fromQuery) return fromQuery
  try{
    const body = event.body ? JSON.parse(event.body) : {}
    const fromBody = (body.species_slug || body.speciesSlug || '').trim()
    if (fromBody) return fromBody
  }catch{}
  return ''
}

function getFirstTimeFlag(event){
  try{
    const body = event.body ? JSON.parse(event.body) : {}
    const v = body.first_time ?? body.firstTime
    if (v === true || v === 'true' || v === 1 || v === '1') return true
    if (v === false || v === 'false' || v === 0 || v === '0') return false
  }catch{}
  return false
}

function isBonusSlug(slug){ return typeof slug === 'string' && slug.startsWith('bonus-') }

async function asUserClient(jwt){
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global:{ headers:{ Authorization:`Bearer ${jwt}` } },
    auth:{ persistSession:false, autoRefreshToken:false },
  })
}

export async function handler(event){
  if (event.httpMethod === 'OPTIONS') return ok({ ok:true })
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return bad(500,{ error:'Missing SUPABASE_URL or SUPABASE_ANON_KEY' })

  const jwt = getJwt(event)
  if (!jwt) return bad(401,{ error:'Missing Authorization bearer token' })

  const species_slug = getSpeciesSlug(event)
  if (!species_slug) return bad(400,{ error:'species_slug is required' })

  try{
    const client = await asUserClient(jwt)
    const { data:u, error:uErr } = await client.auth.getUser()
    if (uErr || !u?.user?.id) return bad(401,{ error:'Invalid user token', details:uErr?.message })
    const user_id = u.user.id

    if (event.httpMethod === 'DELETE') {
      const { data: rows, error: qErr } = await client
        .from('claims')
        .select('id, created_at')
        .eq('user_id', user_id)
        .eq('species_slug', species_slug)
        .order('created_at', { ascending:false })
        .limit(1)
      if (qErr) return bad(500,{ error:'Failed to find claim', details:qErr.message })
      if (!rows || rows.length === 0) return ok({ ok:true, deleted:false })
      const { error: dErr } = await client.from('claims').delete().eq('id', rows[0].id)
      if (dErr) return bad(500,{ error:'Failed to delete claim', details:dErr.message })
      return ok({ ok:true, deleted:true })
    }

    if (event.httpMethod === 'POST') {
      const requestedFirstTime = getFirstTimeFlag(event)
      const first_time_to_save = isBonusSlug(species_slug) ? false : !!requestedFirstTime

      const { data: existing } = await client
        .from('claims')
        .select('id, first_time, created_at, photo_url')
        .eq('user_id', user_id)
        .eq('species_slug', species_slug)
        .order('created_at', { ascending:false })
        .limit(1)

      if (existing && existing.length > 0) {
        return ok({ ok:true, already_claimed:true, claim: existing[0] })
      }

      const { data: inserted, error: insErr } = await client
        .from('claims')
        .insert({ user_id, species_slug, first_time: first_time_to_save })
        .select('id, user_id, species_slug, first_time, created_at, photo_url')
        .single()

      if (insErr) return bad(409,{ error:'Failed to insert claim', details:insErr.message })
      return ok({ ok:true, claim: inserted })
    }

    return bad(405,{ error:'Method not allowed' })
  }catch(e){
    return bad(500,{ error:'Unhandled error', details:e?.message || e })
  }
}
