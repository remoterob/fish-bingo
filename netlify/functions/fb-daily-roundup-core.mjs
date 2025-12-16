// fb-daily-roundup-core.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// === CONFIG ===
const MAX_IMAGES = 6               // Hard cap to avoid timeout
const FB_API = "https://graph.facebook.com/v24.0"

export const main = async () => {
  try {
    // ------------------------------------------------------------
    // 1. DATE RANGE (NZ "yesterday")
    // ------------------------------------------------------------
    const nowUTC = new Date()
    const end = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), 11, 0, 0))
    const start = new Date(end)
    start.setUTCDate(end.getUTCDate() - 1)

    const startUTC = start.toISOString()
    const endUTC = end.toISOString()

    console.log("📅 UTC range:", startUTC, "→", endUTC)

    // ------------------------------------------------------------
    // 2. FETCH CLAIMS
    // ------------------------------------------------------------
    const { data: claims, error } = await supabase
      .from('claims')
      .select(`
        id,
        species_slug,
        thumb_url,
        first_time,
        created_at,
        profiles(display_name)
      `)
      .gte('created_at', startUTC)
      .lt('created_at', endUTC)
      .order('created_at', { ascending: true })

    if (error) throw error
    if (!claims?.length) return { statusCode: 200, body: "No claims from yesterday." }

    // ------------------------------------------------------------
    // 3. BUILD CAPTION
    // ------------------------------------------------------------
    const speciesCounts = claims.reduce((m, c) => {
      m[c.species_slug] = (m[c.species_slug] || 0) + 1
      return m
    }, {})

    const summary = Object.entries(speciesCounts)
      .map(([k, v]) => `${k} ×${v}`)
      .join(', ')

    const byDiver = claims.reduce((m, c) => {
      const name = c.profiles?.display_name || "Unknown diver"
      if (!m[name]) m[name] = []
      m[name].push(c.species_slug)
      return m
    }, {})

    const perDiver = Object.entries(byDiver)
      .map(([d, s]) => `${d}: ${s.join(', ')}`)
      .join('\n')

    const caption = [
      `🎣 Fish Bingo — Daily Roundup`,
      `Total claims: ${claims.length}`,
      `Highlights: ${summary}`,
      '',
      perDiver,
      '',
      'Play & track catches at https://fishbingo.netlify.app/latest 🐠',
      '#spearfishing #nz #fundies #fishbingo'
    ].join('\n')

    // ------------------------------------------------------------
    // 4. PREP THUMBNAILS (LIMITED + CLEANED)
    // ------------------------------------------------------------
    const thumbs = claims
      .map(c => c.thumb_url)
      .filter(Boolean)
      .slice(0, MAX_IMAGES)

    if (!thumbs.length) {
      console.log("ℹ️ No thumbnails, posting text-only update.")
      return await postToFacebook(caption, [])
    }

    // ------------------------------------------------------------
    // 5. PARALLEL IMAGE UPLOADS (FAST!)
    // ------------------------------------------------------------
    console.log(`📸 Uploading ${thumbs.length} images in parallel…`)

    const uploadPromises = thumbs.map(url =>
      fetch(`${FB_API}/${process.env.FB_PAGE_ID}/photos?published=false`, {
        method: "POST",
        body: new URLSearchParams({
          access_token: process.env.FB_PAGE_TOKEN,
          url
        })
      })
        .then(r => r.json())
        .catch(err => ({ error: err }))
    )

    const uploadResults = await Promise.all(uploadPromises)

    const uploadedMedia = uploadResults
      .filter(r => r?.id)
      .map(r => ({ media_fbid: r.id }))

    console.log(`📸 Successfully uploaded ${uploadedMedia.length}/${thumbs.length} images.`)

    // ------------------------------------------------------------
    // 6. POST ROUNDUP (FIRE & FORGET)
    // ------------------------------------------------------------
    return await postToFacebook(caption, uploadedMedia)

  } catch (err) {
    console.error("💥 Error in daily roundup:", err)
    return { statusCode: 500, body: JSON.stringify(err, null, 2) }
  }
}


// ===================================================================
// FACEBOOK POST FUNCTION (Optimised)
// ===================================================================
async function postToFacebook(caption, uploadedMedia) {
  try {
    const feedParams = new URLSearchParams({
      access_token: process.env.FB_PAGE_TOKEN,
      message: caption
    })

    uploadedMedia.forEach((m, idx) => {
      feedParams.append(`attached_media[${idx}]`, JSON.stringify(m))
    })

    // FIRE & FORGET — do not await the full FB response
    fetch(
      `${FB_API}/${process.env.FB_PAGE_ID}/feed`,
      { method: "POST", body: feedParams }
    )
      .then(res => res.json())
      .then(json => console.log("📨 FB post complete:", json))
      .catch(err => console.warn("⚠️ FB post error:", err))

    // Immediately return success to Netlify
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        images: uploadedMedia.length,
        text_only: uploadedMedia.length === 0
      })
    }

  } catch (err) {
    console.error("💥 Error posting to Facebook:", err)
    return { statusCode: 200, body: "Posted text-only due to FB error." }
  }
}
