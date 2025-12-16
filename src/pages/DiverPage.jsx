// src/pages/DiverPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const API_URL = "/.netlify/functions/claims-by-user";

const PLAY_IMAGE_BASE_PX = 512;
const TILE = Math.round(PLAY_IMAGE_BASE_PX / 4); // 128

// --- supabase client (same config as App.jsx) ---
const supabase = window.supabase;

/* -------------------- utils -------------------- */
const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
const aliasSet = (raw) => {
  const n = norm(raw);
  return new Set([n, n.replace(/-/g, "")]);
};
const fmtTitle = (s) =>
  String(s || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

async function fetchJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const toCandidatesFromPath = (p) => {
  if (!p) return [];
  const ensureSlash = (x) =>
    x.startsWith("/") || x.startsWith("http") ? x : `/${x}`;
  const stripPublic = (x) => x.replace(/^\/?public\//, "");
  return [
    ...new Set([
      p,
      ensureSlash(p),
      stripPublic(p),
      ensureSlash(stripPublic(p)),
    ]),
  ];
};
const toGuessCandidatesFromSlug = (slug) => {
  const s = norm(slug),
    noHy = s.replace(/-/g, "");
  const exts = ["webp", "jpg", "jpeg", "png"];
  const out = [];
  for (const ext of exts) {
    out.push(`/images/species/${s}.${ext}`, `/images/species/${noHy}.${ext}`);
    out.push(`/images/fish/${s}.${ext}`, `/images/fish/${noHy}.${ext}`);
  }
  return out;
};

/* -------------------- Demographic pills -------------------- */
const pillStyle = {
  padding: "4px 10px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid #3F444A",
  borderRadius: 9999,
  lineHeight: 1.1,
};
const DemographicInfo = ({ profile }) => {
  const age = profile?.age_group ?? profile?.age ?? null;
  const gender = profile?.gender ?? null;
  const club = profile?.club ?? null;

  if (!age && !gender && !club) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        fontSize: 14,
        color: "#F2F4F5",
      }}
    >
      {age && <span style={pillStyle}>{age}</span>}
      {gender && <span style={pillStyle}>{gender}</span>}
      {club && <span style={pillStyle}>{club}</span>}
    </div>
  );
};

/* -------------------- SmartImg -------------------- */
function SmartImg({ candidates = [], alt }) {
  const [idx, setIdx] = useState(0);
  const src = candidates?.[idx] || null;

  useEffect(() => {
    setIdx(0);
  }, [JSON.stringify(candidates)]);

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{
        width: TILE,
        height: TILE,
        border: "1px solid #3F444A",
        borderRadius: 10,
        background: "#33383D",
        boxSizing: "border-box",
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt || ""}
          className="object-contain"
          style={{ width: "100%", height: "100%", display: "block" }}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (idx + 1 < candidates.length) setIdx(idx + 1);
          }}
        />
      ) : (
        <div style={{ color: "#A8B0B6", fontSize: 11 }}>No image</div>
      )}
    </div>
  );
}

/* -------------------- page -------------------- */
export default function DiverPage(props) {
  const { me, token } = props || {};
  const query = useQuery();
  const userId = props?.userId || query.get("uid") || query.get("user_id") || "";
  const diverName = props?.diverName || query.get("name") || "Diver";

  const [claims, setClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [err, setErr] = useState("");

  const [fishList, setFishList] = useState(null);
  const [bonusList, setBonusList] = useState(null);

  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let abort = false;
    (async () => {
      const [fish, bonus] = await Promise.all([
        fetchJson("/fish_list.json"),
        fetchJson("/bonus_fish.json"),
      ]);
      if (!abort) {
        setFishList(fish);
        setBonusList(bonus);
      }
    })();
    return () => {
      abort = true;
    };
  }, []);

  // fetch diver profile
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!userId) return;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, gender, club, age_group, bio")
          .eq("id", userId)
          .single();
        if (error) throw error;
        if (!abort) setProfile(data);
      } catch (e) {
        if (!abort) setProfile(null);
      }
    })();
    return () => {
      abort = true;
    };
  }, [userId]);

  const speciesIndex = useMemo(() => {
    const idx = {};
    const add = (obj, objKey) => {
      if (!obj) return;
      const slug =
        obj.slug ??
        obj.key ??
        obj.species_slug ??
        obj.species ??
        obj.name ??
        obj.common_name ??
        obj.title ??
        objKey;
      if (!slug) return;
      const entry = {
        slug: norm(slug),
        name: obj.common_name || obj.name || obj.title || fmtTitle(slug),
        image:
          obj.image ||
          obj.img ||
          obj.image_path ||
          obj.thumbnail ||
          obj.imageUrl ||
          obj.photo_url ||
          null,
        points:
          Number(
            obj.points ?? obj.score ?? obj.base_points ?? obj.basePoints ?? 0
          ) || 0,
      };
      const keys = [
        slug,
        obj.key,
        obj.slug,
        obj.species_slug,
        obj.species,
        obj.name,
        obj.common_name,
        obj.title,
        objKey,
      ].filter(Boolean);
      for (const k of keys)
        for (const a of aliasSet(k)) if (!idx[a]) idx[a] = entry;
    };
    if (Array.isArray(fishList)) fishList.forEach(add);
    else if (fishList && typeof fishList === "object") {
      Object.entries(fishList).forEach(([k, v]) =>
        add({ ...v, slug: v?.slug ?? v?.key ?? k }, k)
      );
    }
    return idx;
  }, [fishList]);

  const bonusIndex = useMemo(() => {
    const points = {},
      titles = {};
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node === "object") {
        const slug = node.slug || node.key || node.name || node.title;
        const val = node.points ?? node.score ?? node.bonus ?? node.value;
        if (slug && val !== undefined) {
          const title = node.title || node.name || fmtTitle(slug);
          for (const a of aliasSet(slug)) {
            points[a] = Number(val) || 0;
            titles[a] = title;
          }
        }
        Object.values(node).forEach(visit);
      }
    };
    visit(bonusList);
    return { points, titles };
  }, [bonusList]);

  useEffect(() => {
    let abort = false;
    (async () => {
      setLoadingClaims(true);
      setErr("");
      try {
        if (!userId) throw new Error("No user id provided.");
        const res = await fetch(
          `${API_URL}?user_id=${encodeURIComponent(userId)}`,
          { cache: "no-store" }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `claims-by-user ${res.status}`);
        if (!abort) setClaims(Array.isArray(body?.claims) ? body.claims : []);
      } catch (e) {
        if (!abort) setErr(e.message || "Failed to load claims.");
      } finally {
        if (!abort) setLoadingClaims(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [userId]);

  const { catches, bonuses, totalScore } = useMemo(() => {
    const c = [],
      b = [];
    let total = 0;
    for (const row of claims) {
      const raw = row?.species_slug ?? row?.species ?? row?.slug ?? "";
      if (!raw) continue;

      // bonus?
      let bonusPts = null,
        bonusTitle = null;
      for (const a of aliasSet(raw)) {
        if (a in (bonusIndex.points || {})) {
          bonusPts = bonusIndex.points[a];
          bonusTitle = bonusIndex.titles[a] || fmtTitle(raw);
          break;
        }
      }
      if (bonusPts !== null) {
        total += bonusPts;
        b.push({ ...row, _displayName: bonusTitle, _points: bonusPts });
        continue;
      }

      // regular species
      let sp = null;
      for (const a of aliasSet(raw)) {
        if (speciesIndex[a]) {
          sp = speciesIndex[a];
          break;
        }
      }
      if (sp) {
        const base = Number(sp.points || 0);
        const pts = row?.first_time ? base * 2 : base;
        total += pts;
     // Prefer uploaded photo/thumbnail if present
const uploadedCandidates = [];
if (row.thumb_url) uploadedCandidates.push(row.thumb_url);
if (row.photo_url) uploadedCandidates.push(row.photo_url);

const imgCandidates = [
  ...uploadedCandidates,
  ...toCandidatesFromPath(sp.image),
  ...toGuessCandidatesFromSlug(sp.slug || raw),
];

        c.push({
          ...row,
          _displayName: sp.name || fmtTitle(raw),
          _imageCandidates: imgCandidates,
          _points: pts,
          _isFirst: !!row.first_time,
        });
      } else {
        b.push({ ...row, _displayName: fmtTitle(raw), _points: 0 });
      }
    }
    return { catches: c, bonuses: b, totalScore: total };
  }, [claims, speciesIndex, bonusIndex]);

  // 🔧 Admin unclaim handler
  const unclaimCatch = async (claimId) => {
    if (!me || me.role?.toLowerCase() !== "admin") {
      alert("Admin only");
      return;
    }
    if (!window.confirm("Remove this claim?")) return;

    try {
   const claimRow = claims.find(c => c.id === claimId);
const slug = claimRow?.species_slug;
if (!slug) throw new Error('Missing species slug for claim.');

const r = await fetch(
  `/.netlify/functions/claim?species_slug=${encodeURIComponent(slug)}`,
  {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }
);

      if (!r.ok) throw new Error(await r.text());
      alert("✅ Claim removed.");
      setClaims((prev) => prev.filter((c) => c.id !== claimId));
    } catch (e) {
      alert("❌ Failed to remove claim: " + (e.message || e));
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#2B2F33", color: "#F2F4F5" }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .diver-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
          @media(min-width:768px){.diver-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
          @media(min-width:1024px){.diver-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
          .diver-card{
            padding:6px;
            border:1px solid #3F444A;
            border-radius:10px;
            background:#33383D;
            display:inline-block;
          }
          .diver-caption{
            width:100%;
            font-size:9px;
            line-height:1.3;
            text-align:center;
            color:#A8B0B6;
            margin-top:6px;
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:2px;
          }
          .diver-caption span{display:block}
          .diver-caption .points{ color:#F2F4F5; }
          .diver-caption .points-first{ color:#009688; font-weight:600; }
        `,
        }}
      />

      <div className="max-w-6xl mx-auto px-3 md:px-4 pt-4 md:pt-6">
        <div
          style={{
            margin: "0 0 16px 0",
            padding: 16,
            background: "#33383D",
            border: "1px solid #3F444A",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h1 className="text-lg md:text-2xl font-semibold m-0">
              {profile?.display_name || diverName}
            </h1>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
              }}
            >
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#A8B0B6",
                  fontSize: 11,
                }}
              >
                Total Score
              </span>
              <span
                style={{
                  padding: "4px 10px",
                  background: "#33383D",
                  border: "1px solid #009688",
                  borderRadius: 9999,
                  fontWeight: 700,
                  color: "#009688",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {totalScore?.toLocaleString?.() ?? totalScore} pts
              </span>
            </div>
          </div>

          <DemographicInfo profile={profile} />

          {profile?.bio && String(profile.bio).trim().length > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                background: "#2B2F33",
                border: "1px solid #3F444A",
                borderRadius: 10,
                color: "#A8B0B6",
                fontSize: 13,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
              }}
            >
              {profile.bio}
            </div>
          )}
        </div>
      </div>

      <main className="px-2 sm:px-3 md:px-6 pb-16 max-w-6xl mx-auto">
        <section className="mb-10">
          <h2 className="text-sm md:text-base font-semibold mb-3 md:mb-4 px-1">
            Catches
          </h2>

          {loadingClaims && <p style={{ color: "#A8B0B6" }}>Loading…</p>}
          {err && <p style={{ color: "#E57373" }}>{err}</p>}
          {!loadingClaims && !err && catches.length === 0 && (
            <p style={{ color: "#A8B0B6" }}>No catches yet.</p>
          )}

          <div className="diver-grid">
            {catches.map((cl) => (
              <div key={cl.id} className="flex flex-col items-center">
                <div className="diver-card mx-auto">
                  <SmartImg candidates={cl._imageCandidates} alt={cl._displayName} />
                  <div className="diver-caption">
                    <span className="inline-block max-w-full truncate">{cl._displayName}</span>
                    <span
                      className={`tabular-nums points ${cl._isFirst ? "points-first" : ""}`}
                    >
                      {cl._points} pts
                    </span>
                    <span className="inline-block max-w-full truncate">
                      {new Date(cl.created_at).toLocaleString()}
                    </span>

                    {me && me.role && me.role.toLowerCase() === "admin" && (
                      <button
                        className="btn small"
                        style={{
                          marginTop: 4,
                          background: "#E57373",
                          color: "#fff",
                          border: "none",
                          fontSize: 11,
                          padding: "4px 6px",
                        }}
                        onClick={() => unclaimCatch(cl.id)}
                      >
                        Unclaim
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm md:text-base font-semibold mb-3 px-1">
            Bonuses
          </h2>
          {!loadingClaims && bonuses.length === 0 && (
            <p style={{ color: "#A8B0B6" }}>No bonuses claimed yet.</p>
          )}
          <ul
            style={{
              border: "1px solid #3F444A",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {bonuses.map((b) => (
              <li
                key={b.id}
                style={{
                  background: "#33383D",
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 500 }}>{b._displayName}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "#F2F4F5",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span>{b._points} pts</span>
                  {me && me.role && me.role.toLowerCase() === "admin" && (
                    <button
                      className="btn small"
                      style={{
                        background: "#E57373",
                        color: "#fff",
                        border: "none",
                        fontSize: 10,
                        padding: "3px 5px",
                        borderRadius: 4,
                      }}
                      onClick={() => unclaimCatch(b.id)}
                    >
                      Unclaim
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
