import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler() {
  try {
    const nowUTC = new Date()
    const start = new Date(nowUTC)
    start.setUTCDate(start.getUTCDate() - 7)
    const startISO = start.toISOString()

    // Fetch dishes from the last 7 days
    const { data: dishes, error } = await supabase
      .from('dishes')
      .select(`
        id,
        name,
        species_slug,
        description,
        recipe_url,
        thumb_url,
        created_at,
        profiles(display_name)
      `)
      .gte('created_at', startISO)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!dishes?.length)
      return { statusCode: 200, body: 'No new dishes this week.' }

    // === Compose summary text ===
    const byUser = dishes.reduce((m, d) => {
      const name = d.profiles?.display_name || 'Unknown chef'
      if (!m[name]) m[name] = []
      m[name].push(d)
      return m
    }, {})

    const dateStr = new Date().toLocaleDateString('en-NZ', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    let caption = `🍽️ Fish Bingo – Weekly Dishes Wrap-Up (${dateStr})\n\n`
    caption += `Here’s what the community cooked this week:\n\n`

    for (const [chef, list] of Object.entries(byUser)) {
      caption += `👤 ${chef}\n`
      list.forEach(dish => {
        const desc = dish.description ? `– ${dish.description}` : ''
        const link = dish.recipe_url ? ` (${dish.recipe_url})` : ''
        caption += `• ${dish.name} (${dish.species_slug}) ${desc}${link}\n`
      })
      caption += '\n'
    }

    caption += 'See more at https://fishbingo.netlify.app/activity 🍳\n'
    caption += '#catchandcook #fishbingo #fundies #spearfishing #nz'

    // === Upload thumbnails to Facebook ===
    const thumbs = dishes.map(d => d.thumb_url).filter(Boolean).slice(0, 10)
    const uploaded = []

    for (const url of thumbs) {
      const uploadRes = await fetch(
        `https://graph.facebook.com/v24.0/${process.env.FB_PAGE_ID}/photos?published=false`,
        {
          method: 'POST',
          body: new URLSearchParams({
            access_token: process.env.FB_PAGE_TOKEN,
            url
          })
        }
      )
      const uploadJson = await uploadRes.json()
      if (uploadJson.id) uploaded.push({ media_fbid: uploadJson.id })
      else console.warn('⚠️ Upload failed for', url, uploadJson)
    }

    // === Compose final post ===
    const feedParams = new URLSearchParams({
      access_token: process.env.FB_PAGE_TOKEN,
      message: caption
    })
    uploaded.forEach((m, i) =>
      feedParams.append(`attached_media[${i}]`, JSON.stringify(m))
    )

    const postRes = await fetch(
      `https://graph.facebook.com/v24.0/${process.env.FB_PAGE_ID}/feed`,
      { method: 'POST', body: feedParams }
    )

    const postJson = await postRes.json()
    console.log('✅ FB post result:', postJson)

    return { statusCode: 200, body: JSON.stringify(postJson) }
  } catch (err) {
    console.error('💥 Weekly dishes error:', err)
    return { statusCode: 500, body: JSON.stringify(err, null, 2) }
  }
}
