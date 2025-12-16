import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const handler = async (event) => {
  try {
    const { email, display_name } = JSON.parse(event.body)

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) }
    }

    // Check if a profile already exists for this email
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('email', email)
      .maybeSingle()

    if (fetchError) {
      console.error('Fetch error:', fetchError)
      return { statusCode: 500, body: JSON.stringify({ error: 'Database lookup failed' }) }
    }

    // Always send the magic link
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.URL || 'https://fishbingo.netlify.app'}` },
    })

    if (signInError) {
      console.error('Sign-in error:', signInError)
      return { statusCode: 400, body: JSON.stringify({ error: 'Failed to send magic link' }) }
    }

// If no profile exists yet, create one with the new name and default prompt
if (!existingProfile) {
  const { error: insertError } = await supabase
    .from('profiles')
    .insert([
      {
        email,
        display_name,
        demo_prompted: false, // 👈 ensures first-time registration prompt shows
      },
    ])


      if (insertError) {
        console.error('Insert error:', insertError)
        return { statusCode: 400, body: JSON.stringify({ error: 'Failed to create profile' }) }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: existingProfile
          ? `Magic link sent — welcome back ${existingProfile.display_name || ''}`
          : 'Magic link sent — new profile created!',
      }),
    }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) }
  }
}
