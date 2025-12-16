// src/safeJson.js
export async function safeJson(url, opts) {
  try {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return await r.json();
  } catch (e) {
    console.warn('safeJson failed:', e.message);
    return null; // <- never throws up into React
  }
}
