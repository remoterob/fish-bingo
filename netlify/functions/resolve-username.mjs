import { createClient } from "@supabase/supabase-js";

const reply = (code, body) => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return reply(200, { ok: true });

  // 1) Read query robustly: ?name= OR ?username= OR ?display_name= OR ?q=
  const qp = event.queryStringParameters || {};
  let q = qp.name ?? qp.username ?? qp.display_name ?? qp.q ?? "";
  if (!q && event.rawQueryString) {
    const p = new URLSearchParams(event.rawQueryString);
    q = p.get("name") || p.get("username") || p.get("display_name") || p.get("q") || "";
  }
  q = decodeURIComponent((q || "").trim());
  if (!q) return reply(400, { error: "Missing ?name= (or ?username= / ?display_name= / ?q=)" });

  // 2) Env — prefer service role key (bypasses RLS safely on server)
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return reply(500, { error: "Missing SUPABASE_URL or SUPABASE_(SERVICE_ROLE|ANON)_KEY" });
  }

  // 3) Query profiles.display_name -> id, with resilient fallbacks
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Exact match first
    let { data, error } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("display_name", q)
      .limit(1);

    if (error) throw error;

    // Case-insensitive exact
    if (!data || data.length === 0) {
      const r2 = await supabase
        .from("profiles")
        .select("id, display_name")
        .ilike("display_name", q)
        .limit(1);
      if (r2.error) throw r2.error;
      data = r2.data;
    }

    // Contains match (last resort)
    if (!data || data.length === 0) {
      const r3 = await supabase
        .from("profiles")
        .select("id, display_name")
        .ilike("display_name", `%${q}%`)
        .limit(1);
      if (r3.error) throw r3.error;
      data = r3.data;
    }

    if (!data || data.length === 0) {
      // Fallback: try existing leaderboard to extract id by name (if available)
      try {
        const base = process.env.SITE_ORIGIN || "https://fishbingo.netlify.app";
        const res = await fetch(`${base}/.netlify/functions/leaderboard`, { headers: { accept: "application/json" } });
        if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) {
          const payload = await res.json();
          const list = Array.isArray(payload) ? payload : (payload.rows || payload.data || payload.result || []);
          const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
          const row = (list || []).find(r => norm(r.display_name || r.name || "") === norm(q));
          if (row && (row.user_id || row.id)) {
            return reply(200, { user_id: row.user_id || row.id, display_name: row.display_name || row.name || q, source: "leaderboard" });
          }
        }
      } catch {}
      return reply(404, { error: "No user found" });
    }

    return reply(200, { user_id: data[0].id, display_name: data[0].display_name, source: "profiles" });
  } catch (err) {
    console.error("resolve-username error:", err);
    return reply(500, { error: String(err?.message || err) });
  }
}
