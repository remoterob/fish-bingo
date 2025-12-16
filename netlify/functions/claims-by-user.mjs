// netlify/functions/claims-by-user.mjs
import { createClient } from "@supabase/supabase-js";

const allowOrigin = "*";

const json = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const params = event.queryStringParameters || {};
    const user_id = params.user_id || params.uid;
    const debug = params.debug === "1";

    if (!user_id) {
      return json(400, { error: "Missing user_id", hint: "Pass ?user_id=<uuid> or ?uid=<uuid>" });
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Supabase env vars not set" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-client-info": "claims-by-user/1.0" } },
    });

    // ✅ include photo_url here too
    const { data, error } = await supabase
      .from("claims")
      .select("id,user_id,species_slug,first_time,fish_length,fish_weight,created_at,photo_url")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) return json(500, { error: "Supabase query failed", details: error.message });

    const { count, error: countError } = await supabase
      .from("claims")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id);

    return json(200, {
      claims: data || [],
      meta: {
        filteredCount: typeof count === "number" ? count : null,
        countError: countError ? countError.message : null,
      },
    });
  } catch (e) {
    return json(500, { error: "Unhandled error", details: String(e?.message || e) });
  }
}
