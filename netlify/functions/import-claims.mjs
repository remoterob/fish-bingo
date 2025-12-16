// netlify/functions/import-claims.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE // service role key
const ADMIN_KEY = process.env.IMPORT_ADMIN_KEY || process.env.ADMIN_KEY // set one of these in Netlify

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    // Simple admin gate
    const headerKey =
      event.headers['x-admin-key'] ||
      event.headers['X-Admin-Key'] ||
      event.headers['x-Admin-Key']
    if (!ADMIN_KEY || headerKey !== ADMIN_KEY) {
      return { statusCode: 401, body: 'Unauthorized' }
    }

    let payload
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return { statusCode: 400, body: 'Invalid JSON body' }
    }

    const claims = Array.isArray(payload?.claims) ? payload.claims : null
    if (!claims) {
      return { statusCode: 400, body: 'Expected { "claims": [...] }' }
    }

    // Figure out which users are affected
    const affectedIds = Array.from(
      new Set(
        claims
          .map((c) => c.user_id || c.uid || c.userId)
          .filter(Boolean)
      )
    )
    if (affectedIds.length === 0) {
      return { statusCode: 400, body: 'No user_id values in claims' }
    }

    // Replace existing claims for affected users
    // 1) delete existing
    const { error: delErr } = await supabase
      .from('claims')
      .delete()
      .in('user_id', affectedIds)
    if (delErr) {
      return { statusCode: 500, body: `Delete failed: ${delErr.message}` }
    }

    // 2) insert new
    const rows = claims.map((c) => ({
      user_id: c.user_id || c.uid || c.userId,
      species_slug: c.species_slug || c.species || c.slug,
      first_time:
        typeof c.first_time === 'boolean'
          ? c.first_time
          : !!(c.firstTime || c.first || c.is_first_time),
      created_at: c.created_at || c.createdAt || new Date().toISOString(),
    }))

    // Filter out any with missing required fields
    const valid = rows.filter((r) => r.user_id && r.species_slug)
    if (valid.length === 0) {
      return { statusCode: 400, body: 'No valid claim rows to insert' }
    }

    const { error: insErr } = await supabase.from('claims').insert(valid)
    if (insErr) {
      return { statusCode: 500, body: `Insert failed: ${insErr.message}` }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, replaced_users: affectedIds.length, inserted: valid.length }),
    }
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e?.message || e}` }
  }
}
