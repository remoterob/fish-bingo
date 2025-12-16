import { createClient } from '@supabase/supabase-js'

// ---------- Setup ----------
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ---------- Helpers ----------
const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

const aliasSet = (raw) => {
  const n = norm(raw)
  return new Set([n, n.replace(/-/g, '')])
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return await res.json()
}

export async function handler() {
  try {
    // === 1) Load claims with profile info ===
    const { data: claims, error } = await supabase
      .from('claims')
      .select(
        'user_id, species_slug, first_time, profiles(display_name, gender, club)'
      )
    if (error) throw error

    if (!claims?.length)
      return { statusCode: 200, body: 'No claims found.' }

    // === 2) Load species + bonus config ===
    const [fishList, bonusList] = await Promise.all([
      fetchJson('https://fishbingo.netlify.app/fish_list.json'),
      fetchJson('https://fishbingo.netlify.app/bonus_fish.json'),
    ])

    // === 3) Build species + bonus lookup ===
    const speciesIndex = {}
    const addSpecies = (obj, key) => {
      if (!obj) return
      const slug =
        obj.slug ?? obj.key ?? obj.species_slug ?? obj.species ?? obj.name ?? key
      if (!slug) return

      const entry = {
        slug: norm(slug),
        points:
          Number(
            obj.points ?? obj.score ?? obj.base_points ?? obj.basePoints ?? 0
          ) || 0,
      }

      const keys = [
        slug,
        obj.key,
        obj.slug,
        obj.species_slug,
        obj.species,
        obj.name,
      ].filter(Boolean)

      for (const k of keys)
        for (const a of aliasSet(k)) if (!speciesIndex[a]) speciesIndex[a] = entry
    }

    if (Array.isArray(fishList)) fishList.forEach((s) => addSpecies(s, s.slug))
    else if (typeof fishList === 'object')
      Object.entries(fishList).forEach(([k, v]) => addSpecies(v, k))

    const bonusIndex = {}
    const visitBonus = (node) => {
      if (!node) return
      if (Array.isArray(node)) return node.forEach(visitBonus)

      if (typeof node === 'object') {
        const slug = node.slug || node.key || node.name || node.title
        const val = node.points ?? node.score ?? node.bonus ?? node.value
        if (slug && val !== undefined)
          for (const a of aliasSet(slug)) bonusIndex[a] = Number(val) || 0

        Object.values(node).forEach(visitBonus)
      }
    }

    visitBonus(bonusList)

    // === 4) Score calculator ===
    const scoreClaim = (c) => {
      const raw = c?.species_slug ?? ''
      if (!raw) return 0

      for (const a of aliasSet(raw)) if (bonusIndex[a]) return bonusIndex[a]

      for (const a of aliasSet(raw)) {
        if (speciesIndex[a]) {
          const base = speciesIndex[a].points || 0
          return c.first_time ? base * 2 : base
        }
      }
      return 0
    }

    // === 5) Total score per user ===
    const totals = new Map()
    const profiles = new Map()

    for (const c of claims) {
      const uid = c.user_id
      if (!uid) continue

      const pts = scoreClaim(c)
      totals.set(uid, (totals.get(uid) || 0) + pts)

      if (!profiles.has(uid)) {
        profiles.set(uid, {
          name: c.profiles?.display_name || 'Diver',
          gender: c.profiles?.gender || 'Unknown',
          club: c.profiles?.club || 'Unknown',
        })
      }
    }

    // === 6) Build sorted leaderboard ===
    const sorted = Array.from(totals.entries())
      .map(([id, score]) => ({
        id,
        score,
        ...profiles.get(id),
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

    const top20 = sorted.slice(0, 20)

    // === 7) Top per gender ===
    const genders = ['Male', 'Female', 'Other']
    const genderTop = {}

    for (const g of genders) {
      const list = sorted.filter((p) => p.gender === g)
      if (list.length > 0) genderTop[g] = list.slice(0, 3)
    }

    // === 8) Club summary — EXACT logic from Leaderboard.jsx ===
    const clubMap = new Map()
    for (const p of sorted) {
      const club = p.club
      if (!club || club.toLowerCase() === 'unknown') continue
      if (!clubMap.has(club)) clubMap.set(club, [])
      clubMap.get(club).push(p.score)
    }

    const clubRows = []
    for (const [club, scores] of clubMap.entries()) {
      const count = scores.length

      if (count >= 6) {
        const avg = Math.round(
          scores.reduce((a, b) => a + b, 0) / count
        )
        clubRows.push({
          club,
          count,
          avgScore: avg,
          ok: true,
        })
      } else {
        clubRows.push({
          club,
          count,
          avgScore: null,
          ok: false,
          missing: 6 - count,
        })
      }
    }

    const clubRanked = [
      ...clubRows.filter((c) => c.ok).sort((a, b) => b.avgScore - a.avgScore),
      ...clubRows.filter((c) => !c.ok),
    ]

    // === 9) Build caption ===
    const dateStr = new Date().toLocaleDateString('en-NZ', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    let caption = `🏆 Fish Bingo – Weekly Leaderboard Update (${dateStr})\n\n`

    caption += `🔥 **Top 20 Spearos**\n`
    top20.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      caption += `${medal} ${p.name} — ${p.score} pts\n`
    })

    caption += `\n🎯 **Top Spearos by Gender**`
    for (const g of Object.keys(genderTop)) {
      caption += `\n\n${g}:\n`
      genderTop[g].forEach((p, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'
        caption += `${medal} ${p.name} — ${p.score} pts\n`
      })
    }

    caption += `\n🏛 **Club Rankings**\n`
    clubRanked.forEach((c, i) => {
      if (c.ok) {
        caption += `${i + 1}. ${c.club} — ${c.avgScore} avg pts (${c.count} members)\n`
      } else {
        caption += `${c.club}: Needs ${c.missing} more members to log a claim to score\n`
      }
    })

    caption += `\nView full leaderboard at https://fishbingo.netlify.app/leader`

    // === 10) Post to Facebook ===
    const feedParams = new URLSearchParams({
      access_token: process.env.FB_PAGE_TOKEN,
      message: caption,
    })

    const postRes = await fetch(
      `https://graph.facebook.com/v24.0/${process.env.FB_PAGE_ID}/feed`,
      { method: 'POST', body: feedParams }
    )

    const postJson = await postRes.json()
    console.log('✅ FB leaderboard post result:', postJson)

    return { statusCode: 200, body: JSON.stringify(postJson) }
  } catch (err) {
    console.error('💥 Weekly leaderboard error:', err)
    return { statusCode: 500, body: JSON.stringify(err, null, 2) }
  }
}
