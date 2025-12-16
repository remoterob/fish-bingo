// src/components/ProfilePrompt.jsx
import React, { useEffect, useState } from 'react'

export default function ProfilePrompt({ onClose }) {
  const supabase = window.supabase

  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false) // fallback if no onClose is provided

  const [ageGroup, setAgeGroup] = useState('')
  const [gender, setGender] = useState('')
  const [club, setClub] = useState('')
  const [bio, setBio] = useState('')
  const [clubOptions, setClubOptions] = useState([]) // <-- no TS generic here
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // preload existing profile values
      const { data } = await supabase
        .from('profiles')
        .select('age_group, gender, club, bio')
        .eq('id', user.id)
        .single()

      if (alive && data) {
        setAgeGroup(data.age_group ?? '')
        setGender(data.gender ?? '')
        setClub(data.club ?? '')
        setBio(data.bio ?? '')
      }

      // fetch clubs in use
      const { data: clubs } = await supabase
        .from('profiles')
        .select('club')
        .not('club', 'is', null)

      if (alive) {
        // your default options
        const defaults = [
          'Auckland Freediving Club',
          'Spearfishing Fundamentals',
          'Lazy Seals',
          'Port Valley',
          'Spearo & Diving Tauranga',
          'Bluefins',
          'Wettie',
          'Mercury Bay Spearfishing',
          'Taranaki Occasional Spearos',
          'Wairarapa Underwater Club',
          'Wellington Spearfishing & Diving',
          'Nelson Underwater Club',
          'Queenstown Freediving Club',
          'Freedivers NZ',
          'Southland Freediving Club',
          'GCDC',
        ]

        const dbClubs = (clubs?.map(c => c.club).filter(Boolean) ?? [])
        const distinct = [...new Set([...defaults, ...dbClubs])].sort()
        setClubOptions(distinct)
      }
    })()

    return () => { alive = false }
  }, [supabase])

const closeNow = async () => {
  localStorage.setItem('fb_profile_prompted', 'true')
  try {
    const me = JSON.parse(localStorage.getItem('fb_me') || '{}')
    if (me?.id) {
      const { error } = await supabase
        .from('profiles')
        .update({ demo_prompted: true })
        .eq('id', me.id)
      if (error) console.warn('Failed to mark demo_prompted true:', error)
      else console.log('✅ demo_prompted marked true for', me.id)
    }
  } catch (err) {
    console.warn('Profile close update failed:', err)
  }

  if (onClose) onClose()
  else setDismissed(true)
}



  const onSave = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // Save always marks demo_prompted = true (per your schema)
      const update = {
        demo_prompted: true,
        age_group: ageGroup || null,
        gender: gender || null,
        club: club || null,
        bio: bio || null,
        updated_at: new Date().toISOString(),
      }

      const { error: upErr } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id)

      if (upErr) throw upErr

      // immediately dismiss the prompt
      closeNow()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  if (dismissed) return null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <form onSubmit={onSave} style={{
        width: '100%', maxWidth: 520,
        background: '#0f1115', border: '1px solid #2a2a2a',
        borderRadius: 12, padding: 16, color: '#e6edf3',
      }}>
        <h2 style={{ margin: '0 0 8px' }}>Complete your profile</h2>
        <p style={{ margin: '0 0 16px', color: '#a0a6ad' }}>
          Leave anything blank if you like — just hit Save.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Age group</span>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              style={{ background: '#0b0d11', border: '1px solid #2a2a2a', padding: 8, borderRadius: 8, color: 'inherit' }}
            >
              <option value="">—</option>
              <option value="Under 18">Under 18</option>
              <option value="19-40">19–40</option>
              <option value="40+">40+</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Gender</span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              style={{ background: '#0b0d11', border: '1px solid #2a2a2a', padding: 8, borderRadius: 8, color: 'inherit' }}
            >
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Club</span>
            <input
              list="club-options"
              placeholder="Pick or type a club…"
              value={club}
              onChange={(e) => setClub(e.target.value)}
              style={{ background: '#0b0d11', border: '1px solid #2a2a2a', padding: 8, borderRadius: 8, color: 'inherit' }}
            />
            <datalist id="club-options">
              {clubOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Bio</span>
            <textarea
              rows={3}
              placeholder="Couple of lines about you…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{ background: '#0b0d11', border: '1px solid #2a2a2a', padding: 8, borderRadius: 8, color: 'inherit', resize: 'vertical' }}
            />
          </label>
        </div>

        {error ? <div style={{ marginTop: 10, color: '#ff7171' }}>{error}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          {/* Save only */}
          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#2b7fff',
              border: 'none',
              padding: '10px 14px',
              borderRadius: 8,
              color: 'white',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
