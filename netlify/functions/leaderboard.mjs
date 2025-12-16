// netlify/functions/leaderboard.mjs
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function loadFishList() {
  // Try reading from the repo: ../../data/fish_list.json (relative to this file)
  try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const filePath = path.resolve(__dirname, '../../data/fish_list.json')
    const buf = await readFile(filePath, 'utf8')
    return JSON.parse(buf)
  } catch {
    // Fallback: fetch from deployed site
    const base = process.env.DEPLOY_PRIME_URL || process.env.URL // Netlify envs
    if (!base) throw new Error('Could not locate fish_list.json (no filesystem or URL).')
    const res = await fetch(`${base}/data/fish_list.json`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to fetch fish_list.json: ${res.status}`)
    return await res.json()
  }
}

function buildPointsMap(fishList) {
  // Expecting entries with { code, points, name } — we’ll index by code and name (case-insensitive)
  const map = new Map()
  for (const item of fishList || []) {
    const code = (item.code || '').toString().trim()
    const name = (item.name || '').toString().trim()
    const pts = Number(item.points) || 0
    if (code) map.set(code.toLowerCase(), pts)
    if (name) map.set(name.toLowerCase(), pts)
  }
  return map
}

function getSpeciesKey(claim) {
  // Support multiple possible claim field names
  // e.g. species_code (preferred), code, species, fish_code, fish
  return (
    claim.species_code ??
    claim.code ??
    claim.species ??
    claim.fish_code ??
    claim.fish ??
    ''
  )
}

export async function handler() {
  try {
    // 1) Load species → points map
    const fishList = await loadFishList()
    const pointsMap = buildPointsMap(fishList)

    // 2) Pull claims (limit high to cover season; adjust if needed)
    // Select "*" to tolerate unknown column names; we’ll only use what we need.
    const { data: claims, error: claimsErr } = await supabase
      .from('claims')
      .select('*') // if you know exact columns, you can narrow this
      .limit(10000)

    if (claimsErr) throw claimsErr

    // 3) Aggregate scores by user_id
    const byUser = new Map() // user_id -> { score, claims }
    for (const c of claims || []) {
      const userId = c.user_id
      if (!userId) continue

      const rawKey = getSpeciesKey(c)
      const key = (rawKey || '').toString().trim().toLowerCase()

      // default scoring: 1 per claim if species unknown; else use points map
      const basePoints = key ? (pointsMap.get(key) ?? 1) : 1

      // If you later add per-claim overrides (e.g., c.points), prefer it here:
      // const pts = Number(c.points ?? basePoints) || 0
      const pts = basePoints

      const current = byUser.get(userId) || { score: 0, claims: 0 }
      current.score += pts
      current.claims += 1
      byUser.set(userId, current)
    }

    // If no claims, just return empty list
    if (byUser.size === 0) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }

    // 4) Pull profile display names for those users
    const userIds = Array.from(byUser.keys())
    // Split into chunks if needed (Supabase `in` supports decent lists; keep it safe)
    const chunkSize = 1000
    const profileMap = new Map() // id -> display_name
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize)
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', chunk)

      if (profErr) throw profErr
      for (const p of profs || []) {
        profileMap.set(p.id, (p.display_name || '').trim())
      }
    }

    // 5) Build rows
    const rows = userIds.map((id) => {
      const agg = byUser.get(id)
      const name = profileMap.get(id) || 'Diver'
      return { id, name, score: Math.round(agg.score), claims: agg.claims }
    })

    // 6) Sort & cap
    rows.sort((a, b) => b.score - a.score || b.claims - a.claims || a.name.localeCompare(b.name))
    const top = rows.slice(0, 100)

    return new Response(JSON.stringify(top), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
