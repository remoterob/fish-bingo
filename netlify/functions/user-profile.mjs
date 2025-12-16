// netlify/functions/user-profile.mjs
import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const { user_id } = event.queryStringParameters || {};
    if (!user_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing user_id' }) };
    }

    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Assumes you have a public 'profiles' table with id (uuid), display_name (text), and/or username/email fallback.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, email')
      .eq('id', user_id)
      .single();

    if (error) throw error;

    const name =
      data?.display_name?.trim() ||
      data?.username?.trim() ||
      data?.email?.split('@')[0] ||
      'Unknown Diver';

    return {
      statusCode: 200,
      body: JSON.stringify({ id: data.id, name })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
}
