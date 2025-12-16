import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const ok  = (b)=>({ statusCode:200, headers:{'Content-Type':'application/json',...CORS}, body:JSON.stringify(b) })
const bad = (c,b)=>({ statusCode:c,   headers:{'Content-Type':'application/json',...CORS}, body:JSON.stringify(b) })

export async function handler(event){
  if (event.httpMethod === 'OPTIONS') return ok({ ok:true })
  if (!['GET','POST'].includes(event.httpMethod)) return bad(405, { error:'Method not allowed' })
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return bad(500, { error:'Missing SUPABASE_URL or SUPABASE_ANON_KEY' })

  const auth = event.headers?.authorization || event.headers?.Authorization
  if (!auth?.startsWith('Bearer ')) return bad(401, { error:'Missing Authorization bearer token' })
  const jwt = auth.slice('Bearer '.length)

  try{
    const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global:{ headers:{ Authorization:`Bearer ${jwt}` } },
      auth:{ persistSession:false, autoRefreshToken:false },
    })

    const { data:u, error:uErr } = await asUser.auth.getUser()
    if (uErr || !u?.user?.id) return bad(401, { error:'Invalid user token', details:uErr?.message })
    const user_id = u.user.id

    const { data: rows, error: qErr } = await asUser
      .from('claims')
      // 🧠 Added photo_url so the “View Pic” button shows immediately
      .select('id, created_at, species_slug, first_time, photo_url')
      .eq('user_id', user_id)
      .order('created_at', { ascending:false })

    if (qErr) return bad(500, { error:'Failed to load claims', details:qErr.message })
    return ok({ claims: rows || [] })
  }catch(e){
    return bad(500, { error:'Unhandled error', details:e?.message || e })
  }
}
