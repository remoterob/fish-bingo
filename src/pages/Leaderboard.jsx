import React from "react";

function LeaderboardPage({ claims }) {
  const [fishList, setFishList] = React.useState(null);
  const [bonusList, setBonusList] = React.useState(null);
  const [profilesMap, setProfilesMap] = React.useState(new Map());
  const [err, setErr] = React.useState("");

  const fetchJson = async (url) => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  };

  const clean = (x) => String(x ?? "").trim();
  const norm = (s) =>
    String(s || "").trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, "");
  const aliasSet = (raw) => {
    const n = norm(raw);
    return new Set([n, n.replace(/-/g, "")]);
  };

  React.useEffect(() => {
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

  React.useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const ids = Array.from(
          new Set((claims || []).map((c) => c.user_id || c.uid || c.id).filter(Boolean))
        );
        if (!ids.length) {
          if (!abort) setProfilesMap(new Map());
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, gender, club, age_group")
          .in("id", ids);
        if (error) throw error;
        const m = new Map();
        for (const row of data || []) {
          m.set(row.id, {
            display_name: clean(row.display_name) || "Diver",
            gender: clean(row.gender) || "Unknown",
            club: clean(row.club) || "Unknown",
            age_group: clean(row.age_group) || "Unknown",
          });
        }
        if (!abort) setProfilesMap(m);
      } catch (e) {
        if (!abort) setProfilesMap(new Map());
      }
    })();
    return () => {
      abort = true;
    };
  }, [claims]);

  const speciesIndex = React.useMemo(() => {
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
        name: obj.common_name || obj.name || obj.title || slug,
        points: Number(obj.points ?? obj.score ?? obj.base_points ?? obj.basePoints ?? 0) || 0,
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
      for (const k of keys) for (const a of aliasSet(k)) if (!idx[a]) idx[a] = entry;
    };
    if (Array.isArray(fishList)) fishList.forEach(add);
    else if (fishList && typeof fishList === "object") {
      Object.entries(fishList).forEach(([k, v]) =>
        add({ ...v, slug: v?.slug ?? v?.key ?? k }, k)
      );
    }
    return idx;
  }, [fishList]);

  const bonusIndex = React.useMemo(() => {
    const points = {};
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node === "object") {
        const slug = node.slug || node.key || node.name || node.title;
        const val = node.points ?? node.score ?? node.bonus ?? node.value;
        if (slug && val !== undefined) for (const a of aliasSet(slug)) points[a] = Number(val) || 0;
        Object.values(node).forEach(visit);
      }
    };
    visit(bonusList);
    return points;
  }, [bonusList]);

  const scoreClaim = (c) => {
    const raw = c?.species_slug ?? c?.species ?? c?.slug ?? "";
    if (!raw) return 0;
    for (const a of aliasSet(raw)) if (a in bonusIndex) return bonusIndex[a];
    for (const a of aliasSet(raw))
      if (speciesIndex[a]) {
        const base = Number(speciesIndex[a].points || 0);
        return c?.first_time ? base * 2 : base;
      }
    return 0;
  };

  // ===== Build leaderboard data =====
  const { leaderboard, byGender, byClub, byAge, clubAverages } = React.useMemo(() => {
    try {
      if (!Array.isArray(claims))
        return { leaderboard: [], byGender: new Map(), byClub: new Map(), byAge: new Map(), clubAverages: [] };

      const totals = new Map();
      const info = new Map();

      for (const c of claims) {
        const uid = c.user_id || c.uid || c.id;
        if (!uid) continue;
        const pts = scoreClaim(c);
        totals.set(uid, (totals.get(uid) || 0) + pts);
        if (!info.has(uid)) {
          const p = profilesMap.get(uid) || {};
          info.set(uid, {
            id: uid,
            name: p.display_name || c.display_name || "Diver",
            gender: p.gender || "Unknown",
            club: p.club || "Unknown",
            age_group: p.age_group || "Unknown",
          });
        }
      }

      const rows = Array.from(totals.entries()).map(([id, score]) => ({
        ...info.get(id),
        score,
      }));
      rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

      const group = (key) => {
        const m = new Map();
        for (const r of rows) {
          const k = r[key] || "Unknown";
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(r);
        }
        for (const arr of m.values())
          arr.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        return m;
      };

      // --- Compute average scores per club ---
      const clubEntries = Array.from(group("club").entries()).map(([club, members]) => {
        const count = members.length;
        const avgScore = count >= 6 ? (members.reduce((sum, m) => sum + m.score, 0) / count).toFixed(0) : null;
        return { club, count, avgScore };
      });
      clubEntries.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));

      return {
        leaderboard: rows,
        byGender: group("gender"),
        byClub: group("club"),
        byAge: group("age_group"),
        clubAverages: clubEntries,
      };
    } catch (e) {
      setErr(e.message || "Failed to compute leaderboard");
      return { leaderboard: [], byGender: new Map(), byClub: new Map(), byAge: new Map(), clubAverages: [] };
    }
  }, [claims, speciesIndex, bonusIndex, profilesMap]);

  const Section = ({ title, rows }) => (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="small muted">No leaders yet.</p>
      ) : (
        <>
          <div className="leaderboard-grid leaderboard-header" style={{ marginBottom: 8 }}>
            <div className="col-rank">#</div>
            <div className="col-name">Name</div>
            <div className="col-score">Score</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className="leaderboard-grid" style={{ padding: "6px 0", borderTop: i ? "1px solid #3F444A" : "none" }}>
              <div className="col-rank">{i + 1}</div>
              <div className="col-name">{r.name}</div>
              <div className="col-score">{r.score}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );

  const ClubLeaderboard = ({ clubs }) => (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Club Leaderboard</h3>
      {clubs.length === 0 ? (
        <p className="small muted">No clubs yet.</p>
      ) : (
        <>
          <div className="leaderboard-grid leaderboard-header" style={{ marginBottom: 8 }}>
            <div className="col-rank">#</div>
            <div className="col-name">Club</div>
            <div className="col-score">Average</div>
          </div>
          {clubs.map((c, i) => (
            <div key={c.club} className="leaderboard-grid" style={{ padding: "6px 0", borderTop: i ? "1px solid #3F444A" : "none" }}>
              <div className="col-rank">{i + 1}</div>
              <div className="col-name">
                {c.count < 6 ? (
                  <span>
                    {c.club} <span className="small muted">(Just {6 - c.count} more to sign up!)</span>
                  </span>
                ) : (
                  <strong>{c.club}</strong>
                )}
              </div>
              <div className="col-score">{c.count >= 6 ? c.avgScore : "-"}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );

  if (!fishList || !bonusList) {
    return (
      <div className="card">
        <h3>Individual Leaderboard</h3>
        <p className="small muted">Loading points config…</p>
      </div>
    );
  }

  return (
    <>
      {err && <div className="alert">{err}</div>}
      <Section title="Individual Leaderboard" rows={leaderboard} />
      <ClubLeaderboard clubs={clubAverages} />
      <Grouped title="Leaderboard by Gender" map={byGender} />
      <Grouped title="Individual Club Leaderboard" map={byClub} />
      <Grouped title="Leaderboard by Age Group" map={byAge} />
    </>
  );
}

export default LeaderboardPage;
