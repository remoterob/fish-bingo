/* FULL FILE STARTS */
import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import Bonus from './BingoBonuses'
import { createClient } from '@supabase/supabase-js'
import DiverPage from "./pages/DiverPage"
import ProfilePrompt from './components/ProfilePrompt'



// --- Lightweight toasts (no deps) ---
const ToastBus = {
  subs: new Set(),
  push(msg) { this.subs.forEach(fn => fn(msg)) }
}
export function notify(text, type='info') {
  ToastBus.push({ id: Date.now()+Math.random(), text, type })
  try { window.fbNotify = (t, ty='info') => ToastBus.push({ id: Date.now()+Math.random(), text: t, type: ty }) } catch {}
}
function Toasts(){
  const [items, setItems] = React.useState([])
  React.useEffect(()=>{
    const sub = (m)=> {
      setItems(prev => [...prev, m])
      setTimeout(()=> setItems(prev => prev.filter(x => x.id !== m.id)), 3000)
    }
    ToastBus.subs.add(sub)
    return ()=> ToastBus.subs.delete(sub)
  },[])
  return (
    <div style={{
      position:'fixed', left:0, right:0, bottom:12, display:'grid', placeItems:'center',
      pointerEvents:'none', zIndex:1000
    }}>
      <div style={{display:'grid', gap:8, width:'min(520px, 92vw)'}}>
        {items.map(m=>(
          <div key={m.id} role="status"
               style={{
                 pointerEvents:'auto',
                 background: m.type==='error' ? '#b00020' : (m.type==='success' ? '#2e7d32' : '#37474f'),
                 color:'#fff', padding:'10px 12px', borderRadius:10, boxShadow:'0 6px 20px rgba(0,0,0,0.35)'
               }}>
            {m.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// =========================
/** API + Helpers **/
// =========================
const API = {
  auth: '/.netlify/functions/auth-name',
  claim: '/.netlify/functions/claim',
  myClaims: '/.netlify/functions/claims-mine',
  allClaims: '/.netlify/functions/claims-all',
  nameCheck: '/.netlify/functions/names-check',
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'fishbingo-auth', // 👈 unique key silences the warning
  },
})

window.supabase = supabase

async function loadJsonAny(paths, fallback){
  for (const url of paths){
    try{
      const r = await fetch(url, { cache:'no-store' })
      if(!r.ok) throw new Error(url+' '+r.status)
      return await r.json()
    }catch{}
  }
  return fallback
}

const isBonusSlug = (slug) => typeof slug==='string' && slug.startsWith('bonus-')

// Fallback bonus points
const BONUS_POINTS = new Map([
  ['bonus-month-august',150],
  ['bonus-month-september',200],
  ['bonus-month-october',250],
  ['bonus-month-november',300],
  ['bonus-month-december',350],
  ['bonus-month-january',400],
  ['bonus-month-february',450],
  ['bonus-month-march',500],
  ['bonus-month-april',550],
  ['bonus-evergreen-weedline-wonders',350],
  ['bonus-evergreen-pelagic-posse',250],
  ['bonus-evergreen-shore-dive',500],
  ['bonus-evergreen-south-island',500],
  ['bonus-evergreen-bluewater',1000],
  ['bonus-evergreen-kids',750],
  ['bonus-evergreen-big3',750],
  ['bonus-evergreen-monsters',1000],
  ['bonus-evergreen-estuary',750],
  ['bonus-evergreen-creepy-crawlies',750],
])

const pointsMapFromSpecies = (species) => new Map((species||[]).map(s=> [s.slug, s.points]))
const pointsForSlug = (slug, pMap) => {
  if (!slug) return 0
  const norm = String(slug).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const P = (pMap && typeof pMap.get === 'function') ? pMap : new Map()

  // 🔍 loose match helper (matches bluecod ↔ blue-cod)
  const looseFind = () => {
    const stripped = norm.replace(/-/g, '')
    for (const [key, val] of P.entries()) {
      const keyNorm = String(key).toLowerCase().replace(/[^a-z0-9]/g, '')
      if (keyNorm === stripped) return val
    }
    return undefined
  }

  return (
    P.get(slug) ??
    P.get(norm) ??
    looseFind() ??
    BONUS_POINTS.get(slug) ??
    BONUS_POINTS.get(norm) ??
    0
  )
}

const scoreForClaims = (claims, pMap) =>
  claims.reduce((sum,c)=>{
    const base = pointsForSlug(c.species_slug, pMap)
    const mult = isBonusSlug(c.species_slug) ? 1 : (c.first_time ? 2 : 1)
    return sum + base * mult
  }, 0)

const imgFor = (s) => s.image || `/fish/${s.slug}.jpg`
const infoFor = (infoMap, name) => {
  const v = infoMap[name] || infoMap[(name||'').trim()] || null
  return v ? { tips: v.tips || '', recipe: v.recipe || '' } : null
}

// ===== Competition window helpers (client precheck; server is authoritative) =====
function nzFormat(iso){
  try{
    return new Date(iso).toLocaleString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      dateStyle: 'long',
      timeStyle: 'short',
    })
  }catch{ return String(iso) }
}
function windowState(nowIso, startIso, endIso){
  const now   = new Date(nowIso)
  const start = new Date(startIso)
  const end   = new Date(endIso)
  if (now < start) return { ok:false, state:'before' }
  if (now > end)   return { ok:false, state:'after' }
  return { ok:true, state:'open' }
}

// Force-open Profile prompt once if profile.demo_prompted=false
function ForceProfilePrompt({ uid, onDone }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try { localStorage.removeItem('fb_profile_prompted') } catch {}
    const t = setTimeout(() => setReady(true), 0)
    return () => clearTimeout(t)
  }, [])
  if (!ready) return null
  return (
    <ProfilePrompt
      key={`pp-${uid}`}
      open={true}
      isOpen={true}
      show={true}
      defaultOpen={true}
  onClose={async () => {
  try {
    if (uid) {
      const { error } = await supabase
        .from('profiles')
        .update({ demo_prompted: true })
        .eq('id', uid)
      if (error) console.warn('Failed to mark demo_prompted true:', error)
      else console.log('✅ demo_prompted marked true for', uid)
    }
  } catch (err) {
    console.warn('Profile update failed:', err)
  } finally {
    if (onDone) onDone()
  }
}}

    />
  )
}

// =========================
// ProfileGate: ONLY show ProfilePrompt when demo_prompted === false
function ProfileGate({ uid, ready }) {
  const [val, setVal] = useState(undefined)
  useEffect(() => {
    if (!ready || !uid) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("demo_prompted")
          .eq("id", uid)
          .single()
        if (cancelled) return
        if (error) { console.warn("[ProfileGate] select error:", error); setVal(true); return }
        console.log("[ProfileGate] demo_prompted =", data?.demo_prompted, "(type:", typeof data?.demo_prompted, ")")
        setVal(data?.demo_prompted)
      } catch (e) {
        if (!cancelled) { console.warn("[ProfileGate] exception:", e); setVal(true) }
      }
    })()
    return () => { cancelled = true }
  }, [uid, ready])
  // 👇 Don't render anything until we've fetched a definite value
  if (val === undefined) return null

  // 👇 Only show the prompt when explicitly false
  if (val === true) return null

  // 👇 Otherwise (false) show it
  return <ForceProfilePrompt uid={uid} onDone={() => setVal(true)} />

}

// =========================

function AppShell(){
  const [tab, setTabState] = useState(()=> localStorage.getItem('fb_tab') || 'play')
  const setTab = (t)=> { setTabState(t); localStorage.setItem('fb_tab', t) }

  const [species, setSpecies] = useState(null)
  const [infoMapState, setInfoMap] = useState({})

  // Persisted auth view
  const [token, setToken] = useState(localStorage.getItem('fb_token') || '')
  const [me, setMe] = useState(JSON.parse(localStorage.getItem('fb_me') || 'null'))
  const signedIn = !!token && !!me
  const [authReady, setAuthReady] = useState(false)

  const [name, setName] = useState('')
  const [authMsg, setAuthMsg] = useState('')
  const [email, setEmail] = useState('')
  const [magicSent, setMagicSent] = useState(false)

  const [claims, setClaims] = useState([])
  const [myClaims, setMyClaims] = useState([])
  const [apiError, setApiError] = useState('')

  const [firstChoice, setFirstChoice] = useState({})
  const [openInfoSlug, setOpenInfoSlug] = useState(null)

  // NEW: active competition window
  const [compCfg, setCompCfg] = useState(null)

  useEffect(()=>{
    (async ()=>{
      const fish = await loadJsonAny(['/data/fish_list.json', '/fish_list.json'], [])
      const arr = Array.isArray(fish) ? fish : (fish?.species||[])
      const bonusFish = await loadJsonAny(['/data/bonus_fish.json', '/bonus_fish.json'], [])
      setSpecies([...(Array.isArray(arr)?arr:[]), ...(Array.isArray(bonusFish)?bonusFish:[])])
      setInfoMap(await loadJsonAny(['/data/species_info.json', '/species_info.json'], {}))
    })()
  }, [])

  // Load active comp window
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try{
        const { data, error } = await supabase
          .from('comp_config')
          .select('season, comp_start, comp_end')
          .eq('is_active', true)
          .single()
        if (!cancelled && !error && data) setCompCfg(data)
      }catch{}
    })()
    return () => { cancelled = true }
  }, [])

  const loadAllClaims = async () => {
    try{
      const r = await fetch(API.allClaims, { cache:'no-store' })
      if(!r.ok) throw new Error(`claims-all ${r.status}`)
      const data = await r.json()
      setClaims(Array.isArray(data?.claims) ? data.claims : [])
      setApiError('')
    }catch(err){
      console.error('claims-all failed', err)
      (()=>{ const msg='Server is unavailable. Claims/leaderboard may be empty until it comes back.'; setApiError(msg); notify(msg,'error') })()
    }
  }

  const loadMyClaims = async () => {
    if(!authReady || !signedIn) return
    try{
      const r = await fetch(API.myClaims, { headers:{ Authorization:`Bearer ${token}` }, cache:'no-store' })
      if(!r.ok) throw new Error(`claims-mine ${r.status}`)
      const data = await r.json()
      setMyClaims(Array.isArray(data?.claims) ? data.claims : [])
      setApiError('')
    }catch(err){
      console.error('claims-mine failed', err)
      (()=>{ const msg='Server is unavailable. Your claims may not load yet.'; setApiError(msg); notify(msg,'error') })()
    }
  }

  useEffect(()=>{ loadAllClaims() }, [])
useEffect(() => { 
  loadMyClaims(); 
}, [signedIn, authReady, token]);

// --- Recheck role from Supabase once auth is ready ---
useEffect(() => {
  if (!authReady || !me?.id) return;
  (async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', me.id)
        .single();
      if (!error && data?.role && data.role !== me.role) {
        const updated = { ...me, role: data.role };
        localStorage.setItem('fb_me', JSON.stringify(updated));
        setMe(updated);
        console.log('🔄 Refreshed role from DB:', data.role);
      }
    } catch (e) {
      console.warn('Role refresh failed', e);
    }
  })();
}, [authReady, me?.id]);
  
  // --- Recheck role from Supabase once auth is ready ---
	useEffect(() => {
  if (!authReady || !me?.id) return;
  (async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', me.id)
        .single();
      if (!error && data?.role && data.role !== me.role) {
        const updated = { ...me, role: data.role };
        localStorage.setItem('fb_me', JSON.stringify(updated));
        setMe(updated);
        console.log('🔄 Refreshed role from DB:', data.role);
      }
    } catch (e) {
      console.warn('Role refresh failed', e);
    }
  })();
}, [authReady, me?.id]);


// ---------- Auth (clean baseline) ----------
const syncFromSession = async (session) => {
  try {
    if (!session?.user) return;
    const u = session.user;

    const displayName =
      u.user_metadata?.display_name ||
      u.user_metadata?.name ||
      (u.email ? u.email.split("@")[0] : "Diver");

    // pull role from profiles if exists
    let role = "user";
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.id)
        .single();
      if (!error && data?.role) role = data.role;
    } catch (e) {
      console.warn("role lookup failed", e);
    }

    const meObj = { id: u.id, name: displayName, email: u.email, role };
    localStorage.setItem("fb_token", session.access_token);
    localStorage.setItem("fb_me", JSON.stringify(meObj));
    setToken(session.access_token);
    setMe(meObj);

    console.log("✅ signed in as", meObj);

    // ensure profile exists
    const { error: insertErr } = await supabase
      .from("profiles")
      .insert(
        {
          id: u.id,
          email: u.email,
          display_name: displayName,
          demo_prompted: false,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
    if (insertErr) console.warn("profile ensure failed:", insertErr);

    await Promise.all([loadAllClaims(), loadMyClaims()]);
  } catch (err) {
    console.error("syncFromSession failed:", err);
  }
};

// --- standard auth init effect ---
useEffect(() => {
  (async () => {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");

      // handle modern magic-link forms
      if (code) {
        await supabase.auth.exchangeCodeForSession(window.location.href);
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url);
      } else if (tokenHash) {
        try {
          await supabase.auth.verifyOtp({
            type: "email", // ✅ correct for email magic link
            token_hash: tokenHash,
          });
        } catch (e) {
          console.warn("verifyOtp failed", e);
        }
        url.searchParams.delete("token_hash");
        window.history.replaceState({}, "", url);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await syncFromSession(session);
    } catch (e) {
      console.error("auth init failed", e);
    } finally {
      setAuthReady(true);
    }

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) syncFromSession(session);
        else {
          localStorage.removeItem("fb_token");
          localStorage.removeItem("fb_me");
          setToken("");
          setMe(null);
          setMyClaims([]);
        }
        setAuthReady(true);
      }
    );
    return () => listener.subscription?.unsubscribe?.();
  })();
}, []);


  const sendMagicLink = async () => {
    setAuthMsg('')
    const cleanName = name.trim()
    const cleanEmail = email.trim()
    if(!cleanName){ setAuthMsg('Enter a name'); return }
    if(!cleanEmail){ setAuthMsg('Enter an email'); return }
    try{
      const chkRes = await fetch(API.nameCheck, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ name: cleanName, email: cleanEmail })
      })
      const chk = await chkRes.json()
      if(!chkRes.ok){ setAuthMsg(chk?.error || 'Could not verify name. Try again.'); return }
      if (!chk.available && !chk.sameOwner){
        setAuthMsg(chk?.message || 'sorry that name is already taken, try another.')
        return
      }
      localStorage.setItem('pending_display_name', cleanName || '')
      localStorage.setItem('pending_email', cleanEmail)
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: window.location.origin, data: { display_name: cleanName } }
      })
      if(error) throw error
      setMagicSent(true)
      setAuthMsg('Magic link sent. Please check your email.')
      notify('Magic link sent. Check your email.','success')
    }catch(e){ const m=String(e.message||e); setAuthMsg(m); notify(m,'error') }
  }

  const pMap = useMemo(()=> pointsMapFromSpecies(species||[]), [species])

  if (species === null){
    return (<div className='container'><h1 className='h1'>FUNdamentals Fish Bingo</h1><div className='card'><p>Loading data…</p></div></div>)
  }
  if (!Array.isArray(species)){
    return (<div className='container'><h1 className='h1'>FUNdamentals Fish Bingo</h1><div className='errwrap'><strong>Data error:</strong><pre>fish_list.json is not an array. Fix your data or re-download the zip.</pre></div></div>)
  }

return (
  <>
<header
  style={{
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "#2B2F33",
    borderBottom: "1px solid #3F444A",
  }}
>
  <div
    className="container"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 16px 6px 16px",
    }}
  >
    <h1 className="h1" style={{ margin: 0, fontSize: "26px" }}>
      FUNdees Fish Bingo
    </h1>
    <img
      src="/fundees-mark.jpg"
      alt="Fundees Logo"
      style={{
        height: "42px",
        width: "42px",
        borderRadius: "50%",
        boxShadow: "0 0 6px rgba(0,0,0,0.3)",
      }}
    />
  </div>

  {/* ✅ Tabs directly below the title inside header */}
  <NavTabs tab={tab} setTab={setTab} signedIn={signedIn} />
</header>


    {apiError && <div className='alert'>{apiError}</div>}
  {signedIn && me && me.id && <ProfileGate uid={me.id} ready={authReady} />}

  {/* ✅ Add this line */}
  <div className="container">

    <Routes>
      <Route
        path="/"
        element={
          <PlayPage
            species={species}
            infoMap={infoMapState}
            signedIn={signedIn}
            me={me}
            token={token}
            name={name}
            setName={setName}
            authMsg={authMsg}
            sendMagicLink={sendMagicLink}
            email={email}
            setEmail={setEmail}
            magicSent={magicSent}
            myClaims={myClaims}
            firstChoice={firstChoice}
            setFirstChoice={setFirstChoice}
            openInfoSlug={openInfoSlug}
            setOpenInfoSlug={setOpenInfoSlug}
            reloadAll={loadAllClaims}
            reloadMine={loadMyClaims}
            pMap={pMap}
            compCfg={compCfg}
          />
        }
      />
  <Route path='/bonuses' element={<Bonus />} />
  <Route path='/leader' element={<LeaderboardPage species={species} claims={claims} pMap={pMap} />} />
  <Route path='/rules' element={<RulesPage />} />
  <Route path='/data' element={<DataPage claims={claims} reloadAll={loadAllClaims} />} />
  <Route path="/diver" element={<DiverPage me={me} token={token} />} />
  <Route path='/dishes' element={<DishesPage species={species} me={me} token={token} signedIn={signedIn} />} />
      <Route
  path="/latest"
  element={<LatestCatchesPage claims={claims} pMap={pMap} />}
/>
      {/* NEW: Inspiration route */}
      <Route
        path="/inspiration"
        element={<InspirationPage signedIn={signedIn} me={me} species={species} />}
      />
	  
	  </Routes>
      <Toasts />
    </div>
  </>
)

}

function NavTabs({ tab, setTab, signedIn }) {
  const navigate = useNavigate();
  const go = (t, path) => {
    setTab(t);
    navigate(path);
  };

  useEffect(() => {
    const activeTab = document.querySelector(".tab.active");
    activeTab?.scrollIntoView({ behavior: "smooth", inline: "center" });
  }, [tab]);

  return (
<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    background: "#33383D",
    borderBottom: "1px solid #3F444A",
  }}
>




      <style>{`
        .tabs::-webkit-scrollbar { display: none; }
        .tabs { scroll-behavior: smooth; }
        .tabs::after {
          content: '›';
          position: sticky;
          right: 0;
          top: 0;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          width: 24px;
          background: linear-gradient(to right, transparent, rgba(0,0,0,0.3));
          color: #80cbc4;
          font-size: 18px;
          pointer-events: none;
        }
        .tab {
          background: transparent;
          border: none;
          color: #ccc;
          font-size: 14px;
          padding: 6px 10px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
        }
        .tab-link { text-decoration: none; color: inherit; }
        .tab.active {
          color: #00bfa5;
          border-bottom: 2px solid #00bfa5;
          font-weight: 600;
          transform: scale(1.08);
        }
        .tab:hover:not(.active) { color: #80cbc4; }
      `}</style>

      <div className="tabs-scroll">
        <div className="tabs">
          <button
            className={tab === "rules" ? "tab active" : "tab"}
            onClick={() => go("rules", "/rules")}
          >
            Rules
          </button>
          <button
            className={tab === "play" ? "tab active" : "tab"}
            onClick={() => go("play", "/")}
          >
            Play
          </button>
          <button
            className={tab === "bonuses" ? "tab active" : "tab"}
            onClick={() => go("bonuses", "/bonuses")}
          >
            Bonus
          </button>
          <button
            className={tab === "leader" ? "tab active" : "tab"}
            onClick={() => go("leader", "/leader")}
          >
            Leaderboard
          </button>
         <button
  className={tab === "latest" ? "tab active" : "tab"}
  onClick={() => go("latest", "/latest")}
>
  Activity
</button>

          <button
            className={tab === "dishes" ? "tab active" : "tab"}
            onClick={() => go("dishes", "/dishes")}
          >
            Dishes
          </button>

          {/* NEW tab button */}
          <button
            className={tab === "inspiration" ? "tab active" : "tab"}
            onClick={() => go("inspiration", "/inspiration")}
          >
            Inspiration
          </button>
        </div>
      </div>
    </div>
  );
}


function PlayPage(props){
  const {
    species, infoMap, signedIn, me, token, name, setName, authMsg,
    sendMagicLink, email, setEmail, magicSent,
    myClaims, firstChoice, setFirstChoice, openInfoSlug, setOpenInfoSlug,
    reloadAll, reloadMine, pMap, compCfg
  } = props

  const NO_FIRST_TIME = new Set(['rescue', 'Dishes']);
  
  const myClaimFor = (slug) => signedIn ? (myClaims.find(c=> c.species_slug === slug) || null) : null

  const precheckWindow = () => {
    if (!compCfg) return { ok:true, state:'unknown' }
    return windowState(new Date().toISOString(), compCfg.comp_start, compCfg.comp_end)
  }

  const claim = async (slug) => {
    if(!signedIn){ notify('Please sign in first.','info'); return }
    if(myClaimFor(slug)) return
    const gate = precheckWindow()
 if (!gate.ok) {
  if (gate.state === 'before') {
    notify("Almost comp time, you cant claim yet, but you can study the species, come up with a game plan and devise your plan for world domination.")
  } else {
    notify('Sorry the Competition has finished for this round. We will be back again next year though so keep an eye out!','info')
  }
  return
}

    const firstSelected = NO_FIRST_TIME.has(slug) ? false : !!firstChoice[slug];
	

    try{
      const r = await fetch(API.claim, {
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body: JSON.stringify({ species_slug: slug, first_time: firstSelected })
      })
      if (r.status === 409) {
        setFirstChoice(prev => ({ ...prev, [slug]: false }))
        await Promise.all([reloadAll(), reloadMine()])
        notify('You’ve already claimed this species.','info')
        return
      }
      if(!r.ok){
        let msg = ''
        try { msg = (await r.json())?.message || '' } catch {}
        if (!msg) { try { msg = await r.text() } catch {} }
        throw new Error(msg || `Claim failed (${r.status})`)
      }
      setFirstChoice(prev=>({ ...prev, [slug]: false }))
      await Promise.all([reloadAll(), reloadMine()])
    }catch(e){
      notify(String(e.message||e),'error')
    }
  }

  // UPDATED: also deletes storage photo if present
  const unclaimBySlug = async (slug) => {
    if(!signedIn) return
    try{
      // grab photo url before delete
      const claimRow = myClaims.find(c => c.species_slug === slug)
      const photoUrl = claimRow?.photo_url || null

      const r = await fetch(API.claim + `?species_slug=${encodeURIComponent(slug)}`, { method:'DELETE', headers:{ Authorization:`Bearer ${token}` } })
      if(!r.ok) throw new Error(await r.text())

      if (photoUrl) {
        try {
          const pathParts = new URL(photoUrl).pathname.split('/')
          const idx = pathParts.findIndex(x => x === 'fish-uploads')
          const filePath = idx >= 0 ? pathParts.slice(idx + 1).join('/') : null
          if (filePath) {
            await supabase.storage.from('fish-uploads').remove([filePath])
          }
        } catch (err) {
          console.warn('Storage remove failed (continuing):', err)
        }
      }

      await Promise.all([reloadAll(), reloadMine()])
    }catch(e){ notify(String(e.message||e),'error') }
  }

const signOut = async () => {
  try {
    console.log('Signing out…');

    // Properly destroy Supabase session
    await supabase.auth.signOut();

    // Remove Supabase's persisted session
    localStorage.removeItem('fishbingo-auth');

    // Remove your app's local items
    localStorage.removeItem('fb_me');
    localStorage.removeItem('fb_token');
    localStorage.removeItem('pending_email');
    localStorage.removeItem('pending_display_name');

    // Reset all relevant local state (safe optional chaining)
    try {
      setName?.('');
      setEmail?.('');
      setFirstChoice?.({});
      setOpenInfoSlug?.(null);
    } catch {}

    // Hard reload to reset AppShell completely
    window.location.replace('/');
  } catch (err) {
    console.error('Sign-out failed:', err);
    notify('Sign-out failed: ' + (err.message || err),'error');
  }
};



  const windowGate = compCfg ? windowState(new Date().toISOString(), compCfg.comp_start, compCfg.comp_end) : { ok:true, state:'unknown' }
  const claimDisabled = compCfg && !windowGate.ok
  const claimTooltip = compCfg && !windowGate.ok
    ? (windowGate.state === 'before'
        ? `Claims open ${nzFormat(compCfg.comp_start)}`
        : `Claims closed ${nzFormat(compCfg.comp_end)}`)
    : 'Make a claim'

  return (
    <div>
      {/* SLIM Register / Sign in */}
      <div className='card' style={{ marginBottom: 8, padding: 10 }}>
        {!signedIn ? (
          <>
            <div className='signup-grid' style={{ gap: 6 }}>
              <input className='input signup-name' placeholder='Name' value={name} onChange={e=>setName(e.target.value)} />
              <input className='input signup-email' placeholder='Email' value={email} onChange={e=>setEmail(e.target.value)} />
              <button className='btn signup-btn' onClick={sendMagicLink} style={{ padding: '6px 10px' }}>Magic link</button>
            </div>
            {authMsg && (
              <div className='small' style={{ color: magicSent ? '#009688' : '#E57373', marginTop: 4 }}>
                {authMsg}
              </div>
            )}
          </>
        ) : (
          <div className='row' style={{ alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 14 }}>
              <strong>{me.name}</strong>
              {me.email && <span className='small muted' style={{ marginLeft: 6 }}>{me.email}</span>}
            </div>
            <button className='btn' onClick={signOut} style={{ padding: '4px 8px', fontSize: 13 }}>Sign out</button>
          </div>
        )}
      </div>

      {signedIn && (
        <div className='card' style={{ marginBottom: 12, padding: 10 }}>
          <div className='row' style={{ alignItems: 'center' }}>
            <strong>Your score</strong>
            <div className='right badge' style={{ fontSize: 13 }}>
              {scoreForClaims(myClaims, pMap)} pts
            </div>
          </div>
        </div>
      )}

      <div className='card' style={{marginBottom:12}}>
        <div className='row' style={{alignItems:'baseline'}}>
          <h3 style={{marginRight:8}}>Claim a Fish</h3>
          {compCfg && (
            <span className='small muted'>
              Season window: {nzFormat(compCfg.comp_start)} — {nzFormat(compCfg.comp_end)}
            </span>
          )}
        </div>
        <p className='small muted'>Tick "First time" if it’s your first claim for that species. (You’ll get double points.)</p>
        <div className='grid grid-3'>
          {species.filter(s=> !isBonusSlug(s.slug)).map(s=>{
            const mine = myClaimFor(s.slug)
            const checked = !!firstChoice[s.slug]
            const pts = mine ? (s.points * (mine.first_time ? 2 : 1)) : 0
            const info = infoFor(infoMap, s.name)
            return (
              <div key={s.slug} className='card'>
                <div className='img-box'>
                  <img src={imgFor(s)} alt={s.name} onError={(e)=>{ e.currentTarget.style.opacity=0.3; e.currentTarget.parentElement.textContent='No image' }} />
                </div>
                <div className='row' style={{marginTop:8, alignItems:'baseline'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
                      <strong style={{flex:'0 1 auto'}}>{s.name}</strong>
                      {info && (info.tips || info.recipe) && (
                        <button
                          onClick={()=> setOpenInfoSlug(openInfoSlug===s.slug ? null : s.slug)}
                          className='small'
                          style={{all:'unset',cursor:'pointer',color:'#009688',borderBottom:'1px dashed #009688'}}
                          title='Tips & recipes'
                        >
                          Tips & recipes
                        </button>
                      )}
                    </div>
                    <div className='small muted'>{s.points} pts</div>
                  </div>
                  {mine && <div className='right badge'>Claimed</div>}
                </div>

                {openInfoSlug===s.slug && (
                  <div
                    className='small'
                    style={{ marginTop: 8, background: '#2B2F33', border: '1px solid #3F444A', padding: 8, borderRadius: 8 }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      <strong>Tips:</strong>{' '}
                      <span
                        className='muted'
                        style={{ color: '#A8B0B6' }}
                        dangerouslySetInnerHTML={{ __html: (info && info.tips) || '—' }}
                      />
                    </div>
                    <div>
                      <strong>Recipes:</strong>{' '}
                      {(info && info.recipe) ? (
                        <a href={info.recipe} target='_blank' rel='noreferrer' style={{color:'#009688'}}>
                          {(()=>{ try{ return new URL(info.recipe).hostname } catch { return 'Open link' }})()}
                        </a>
                      ) : '—'}
                    </div>
                  </div>
                )}

 {!mine ? (
  <div className='row' style={{marginTop:8,alignItems:'center'}}>
  
  {!NO_FIRST_TIME.has(s.slug) && (
  <>
    <input
      type='checkbox'
      id={`ft-${s.slug}`}
      checked={checked}
      onChange={(e)=> 
        setFirstChoice(prev => ({ ...prev, [s.slug]: e.target.checked }))
      }
    />
    <label htmlFor={`ft-${s.slug}`} className='small' style={{ marginLeft:6 }}>
      First time (double points)
    </label>
  </>
)}

  
<button
  className='btn primary right'
  onClick={() => { setFirstChoice(prev => ({ ...prev, [s.slug]: false })); claim(s.slug) }}
  title={claimTooltip}
>
  Claim
</button>

  </div>
) : (
  <div className='row' style={{ marginTop: 8, alignItems: 'center', justifyContent: 'space-between' }}>
    {/* Left side: points info */}
    <div className="small" style={{ flex: '1 1 auto' }}>
      <strong>{pts}</strong> points allocated {mine.first_time ? '(first-time x2)' : ''}
    </div>

    {/* Right side: Add/View Pic button */}
    <div style={{ flexShrink: 0 }}>
      {mine.photo_url ? (
        <a
          href={mine.photo_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn small"
          style={{
            background: '#009688',
            color: '#fff',
            minWidth: 90,
            textAlign: 'center',
          }}
        >
          View Pic
        </a>
      ) : (
        <>
          <input
            type="file"
            accept="image/*"
            id={`upload-${s.slug}`}
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                notify('File too large – max 10 MB.','error');
                return;
              }

              const ext = file.name.split('.').pop();
              const filePath = `${me.id}/${s.slug}-${Date.now()}.${ext}`;

              try {
				  // --- Generate client-side thumbnail (~400 px width) ---
async function makeThumbnail(file, maxWidth = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Canvas failed'));
        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.8);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const thumbFile = await makeThumbnail(file);
const thumbPath = `thumbs/${me.id}/${s.slug}-${Date.now()}.jpg`;

// Upload thumbnail first
const { error: thumbError } = await supabase.storage
  .from('fish-uploads')
  .upload(thumbPath, thumbFile, { upsert: true });
if (thumbError) console.warn('Thumbnail upload failed:', thumbError);

// Get public URL for thumbnail
const { data: { publicUrl: thumbUrl } } = supabase
  .storage
  .from('fish-uploads')
  .getPublicUrl(thumbPath);

				  
                const { error: uploadError } = await supabase.storage
                  .from('fish-uploads')
                  .upload(filePath, file, { upsert: true });
                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase
                  .storage
                  .from('fish-uploads')
                  .getPublicUrl(filePath);

             const { error: updateError } = await supabase
			.from('claims')
			.update({ photo_url: publicUrl, thumb_url: thumbUrl })
			.eq('user_id', me.id)
			.eq('species_slug', s.slug);


                if (updateError) throw updateError;

                notify('✅ Photo uploaded!','success');
                await reloadMine();
              } catch (err) {
                notify('Upload failed: ' + (err.message || err),'error');
              }
            }}
          />
          <label
            htmlFor={`upload-${s.slug}`}
            className="btn small"
            style={{
              background: '#444',
              color: '#fff',
              minWidth: 90,
              textAlign: 'center',
            }}
          >
            Add Pic
          </label>
        </>
      )}
    </div>
  </div>
)}



              </div>
            )
          })}
        </div>
      </div>

      <div className='card'>
        <h3>Your Claims</h3>
        {!signedIn ? <p className='small muted'>Sign in to see and manage your claims.</p> : (
          <table className='table'>
            <thead><tr><th>Time</th><th>Species</th><th>Points</th><th></th></tr></thead>
            <tbody>
              {myClaims.map(c=>{
                const sp = species.find(s=> s.slug===c.species_slug)
                const isBonus = isBonusSlug(c.species_slug)
                const fallbackName = isBonus
                  ? "[Bonus] " + (c.species_slug.replace(/^bonus-/, "").replace(/evergreen-/, "").replace(/month-/, "").replace(/-/g, " ").replace(/\b\w/g, ch => ch.toUpperCase()))
                  : (c.species_slug || "")
                const nameForRow = isBonus ? (`[Bonus] ${sp?.name?.replace(/^\[Bonus\]\s*/, "") || fallbackName.replace(/^\[Bonus\]\s*/, "")}`) : (sp ? sp.name : fallbackName)
                const basePts = pointsForSlug(c.species_slug, pMap)
                const pts = basePts * (isBonus ? 1 : (c.first_time ? 2 : 1))
                return (<tr key={(c.id || '') + (c.created_at || '') + c.species_slug}>
                  <td>{c?.created_at ? new Date(c.created_at).toLocaleString() : ''}</td>
                  <td>{nameForRow} {!isBonus && c.first_time ? '(first-time)' : ''}</td>
                  <td><strong>{pts}</strong></td>
                  <td><button className='btn' onClick={()=>unclaimBySlug(c.species_slug)}>Unclaim</button></td>
                </tr>)
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ======== UPDATED LEADERBOARD PAGE ========
function LeaderboardPage({ claims }) {
  const [fishList, setFishList] = React.useState(null)
  const [bonusList, setBonusList] = React.useState(null)
  const [profilesMap, setProfilesMap] = React.useState(new Map())
  const [err, setErr] = React.useState("")

  const fetchJson = async (url) => {
    try {
      const r = await fetch(url, { cache: "no-store" })
      if (!r.ok) return null
      return await r.json()
    } catch { return null }
  }

  // Load points config from /public
  React.useEffect(() => {
    let abort = false
    ;(async () => {
      const [fish, bonus] = await Promise.all([
        fetchJson("/fish_list.json"),
        fetchJson("/bonus_fish.json"),
      ])
      if (!abort) { setFishList(fish); setBonusList(bonus) }
    })()
    return () => { abort = true }
  }, [])

  // --- points lookup helpers ---
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, "")
  const aliasSet = (raw) => { const n = norm(raw); return new Set([n, n.replace(/-/g, "")]) }

  const speciesIndex = React.useMemo(() => {
    const idx = {}
    const add = (obj, objKey) => {
      if (!obj) return
      const slug = obj.slug ?? obj.key ?? obj.species_slug ?? obj.species ?? obj.name ?? obj.common_name ?? obj.title ?? objKey
      if (!slug) return
      const entry = {
        slug: norm(slug),
        name: obj.common_name || obj.name || obj.title || slug,
        points: Number(obj.points ?? obj.score ?? obj.base_points ?? obj.basePoints ?? 0) || 0,
      }
      const keys = [slug, obj.key, obj.slug, obj.species_slug, obj.species, obj.name, obj.common_name, obj.title, objKey].filter(Boolean)
      for (const k of keys) for (const a of aliasSet(k)) if (!idx[a]) idx[a] = entry
    }
    if (Array.isArray(fishList)) fishList.forEach(add)
    else if (fishList && typeof fishList === "object") Object.entries(fishList).forEach(([k, v]) => add({ ...v, slug: v?.slug ?? v?.key ?? k }, k))
    return idx
  }, [fishList])

  const bonusIndex = React.useMemo(() => {
    const points = {}
    const visit = (node) => {
      if (!node) return
      if (Array.isArray(node)) return node.forEach(visit)
      if (typeof node === "object") {
        const slug = node.slug || node.key || node.name || node.title
        const val = node.points ?? node.score ?? node.bonus ?? node.value
        if (slug && (val !== undefined)) for (const a of aliasSet(slug)) points[a] = Number(val) || 0
        Object.values(node).forEach(visit)
      }
    }
    visit(bonusList)
    return points
  }, [bonusList])

  const scoreClaim = (c) => {
    const raw = c?.species_slug ?? c?.species ?? c?.slug ?? ""
    if (!raw) return 0
    for (const a of aliasSet(raw)) if (a in bonusIndex) return bonusIndex[a]
    for (const a of aliasSet(raw)) if (speciesIndex[a]) {
      const base = Number(speciesIndex[a].points || 0)
      return c?.first_time ? base * 2 : base
    }
    return 0
  }

  // -------- PROFILES --------
  React.useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const ids = Array.from(new Set((claims || []).map(c => c.user_id || c.uid || c.id).filter(Boolean)))
        if (!ids.length) { if (!abort) setProfilesMap(new Map()); return }
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, gender, club, age_group')
          .in('id', ids)
        if (error) throw error
        const m = new Map()
        for (const row of (data || [])) m.set(row.id, row)
        if (!abort) setProfilesMap(m)
        setErr("")
      } catch (e) {
        if (!abort) {
          setProfilesMap(new Map())
          setErr(`Profiles load failed: ${e.message || e}`)
        }
      }
    })()
    return () => { abort = true }
  }, [claims])

  // Build totals + groupings + club averages
  const rows = React.useMemo(() => {
    if (!Array.isArray(claims)) return []
    const totals = new Map()
    for (const c of claims) {
      const uid = c.user_id || c.uid || c.id
      if (!uid) continue
      totals.set(uid, (totals.get(uid) || 0) + scoreClaim(c))
    }
    const out = []
    for (const [id, score] of totals.entries()) {
      const p = profilesMap.get(id) || {}
      out.push({
        id,
        name: p.display_name || 'Diver',
        score,
        gender: String(p.gender ?? '').trim() || 'Unknown',
        club: String(p.club ?? '').trim() || 'Unknown',
        age_group: String(p.age_group ?? '').trim() || 'Unknown',
      })
    }
    out.sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name))
    return out
  }, [claims, profilesMap, speciesIndex, bonusIndex])

  const groupBy = (arr, key) => {
    const m = new Map()
    for (const r of arr) {
      const k = r[key] || 'Unknown'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    for (const v of m.values()) v.sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name))
    return m
  }

  const byGender = React.useMemo(()=> groupBy(rows, 'gender'), [rows])
  const byClub   = React.useMemo(()=> groupBy(rows, 'club'),   [rows])
  const byAge    = React.useMemo(()=> groupBy(rows, 'age_group'), [rows])

  // ---- Club averages (≥6 members; otherwise show "Just X more to sign up!") ----
  const clubAverages = React.useMemo(() => {
    const list = []
    for (const [clubName, members] of byClub.entries()) {
      const count = members.length
      const avg = count >= 6 ? Math.round(members.reduce((s,m)=>s+m.score,0)/count) : null
      list.push({ club: clubName || 'Unknown', count, avg })
    }
    list.sort((a,b)=> (b.avg || 0) - (a.avg || 0) || a.club.localeCompare(b.club))
    return list
  }, [byClub])

  const diverHref = (r) => {
    const base = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin : ""
    const url = new URL("/diver", base)
    url.searchParams.set("uid", r.id)
    url.searchParams.set("name", r.name || "Diver")
    return url.pathname + url.search
  }

  const Section = ({ title, rows }) => (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="small muted">No leaders yet.</p> : (
        <>
          <div className="leaderboard-grid leaderboard-header" style={{ marginBottom: 8 }}>
            <div className="col-rank">#</div>
            <div className="col-name">Name</div>
            <div className="col-score">Score</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className="leaderboard-grid" style={{ padding: '6px 0', borderTop: i ? '1px solid #3F444A' : 'none' }}>
              <div className="col-rank">{i+1}</div>
              <div className="col-name">
                <a href={diverHref(r)} target="_blank" rel="noopener noreferrer" style={{ color:'#009688', textDecoration:'underline', textUnderlineOffset:'2px', wordBreak:'break-word' }}>
                  {r.name}
                </a>
              </div>
              <div className="col-score">{r.score}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )

  const Grouped = ({ title, map }) => {
    const entries = Array.from(map.entries()).sort((a,b)=> String(a[0]).localeCompare(String(b[0])))
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <h3>{title}</h3>
        {entries.length === 0 ? <p className="small muted">No data.</p> : entries.map(([groupName, arr]) => (
          <div key={groupName} style={{ marginTop: 12 }}>
            <h4 style={{ margin: '8px 0' }}>{groupName || 'Unknown'}</h4>
            <div className="leaderboard-grid leaderboard-header" style={{ marginBottom: 6 }}>
              <div className="col-rank">#</div>
              <div className="col-name">Name</div>
              <div className="col-score">Score</div>
            </div>
            {arr.map((r, i) => (
              <div key={r.id} className="leaderboard-grid" style={{ padding:'6px 0', borderTop: i ? '1px solid #3F444A' : 'none' }}>
                <div className="col-rank">{i+1}</div>
                <div className="col-name"><a href={diverHref(r)} target="_blank" rel="noopener noreferrer" style={{ color:'#009688', textDecoration:'underline', textUnderlineOffset:'2px', wordBreak:'break-word' }}>{r.name}</a></div>
                <div className="col-score">{r.score}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const ClubLeaderboard = ({ clubs }) => (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Club Leaderboard (min 6 to score)</h3>
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
            <div key={c.club} className="leaderboard-grid" style={{ padding: '6px 0', borderTop: i ? '1px solid #3F444A' : 'none' }}>
              <div className="col-rank">{i+1}</div>
              <div className="col-name">
                {c.count < 6
                  ? (<span>{c.club} <span className="small muted">(Just {6 - c.count} more to sign up!)</span></span>)
                  : (<strong>{c.club}</strong>)
                }
              </div>
              <div className="col-score">{c.count >= 6 ? c.avg : '-'}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )

  if (!fishList || !bonusList) {
    return (
      <div className="card">
        <h3>Individual Leaderboard</h3>
        <p className="small muted">Loading points config…</p>
      </div>
    )
  }

  return (
    <>
      {err && <div className="alert" style={{ marginBottom: 8 }}>{err}</div>}
      <Section title="Individual Leaderboard" rows={rows} />
      <ClubLeaderboard clubs={clubAverages} />
      <Grouped title="Leaderboard by Gender" map={byGender} />
      <Grouped title="Individual Club Leaderboard" map={byClub} />
      <Grouped title="Leaderboard by Age Group" map={byAge} />
    </>
  )
}

function RulesPage(){
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="rules-container" style={{ maxWidth: 800, margin: "0 auto" }}>
              

        {/* Fun rules */}
        <h1>🎣 Fish Bingo Rules</h1>
        <p><em>(a.k.a. The Fine Print You’ll Pretend to Read)</em></p>

        <h2>📅 Dates</h2>
        <p>The competition runs <strong>1 November – 30 April</strong>. You can register early, but you won’t be able to claim points until kickoff.</p>

        <h2>1️⃣ Participation & Risk</h2>
        <p><strong>Participation in Fish Bingo is entirely at your own risk.</strong> Spearfishing and freediving are inherently dangerous activities that carry the risk of serious injury or death. By registering for or participating in Fish Bingo, you acknowledge you accept all risks, agree the organisers have no responsibility or liability for any injury, loss, or death, and confirm you’ll comply with all relevant laws and safety practices (including diving with a competent buddy and staying within your limits). Participants under 18 must be accompanied <em>in the water</em> and directly supervised by a parent or legal guardian, who assumes full responsibility. Any advice, tips, or recipes are general information only and are not professional instruction or training.</p>
		<p>You enter at your own risk. Event organisers accept no liability for injury, loss, or damage. <strong>Translation: dive safe, with a good buddy.</strong></p>

        <h2>2️⃣ Eligibility</h2>
        <p>Open to all spearos, freedivers, and ocean enthusiasts. Kids can join too – just make sure an adult is buddying and closely supervising.</p>
		<p>Fish must be speared in New Zealand waters only – anything outside our territorial waters doesn’t count.</p>

        <h2>3️⃣ How to Play</h2>
        <p>Register through the Bingo app (it’s free!).</p>
		<p>Find your fish, and then claim it.</p>
        <p> 📸 Upload a pic against your claim in this App within 7 days of claiming the fish. </p>
          
        <p>Fish must be caught by you, while freediving (no tanks, no tackle, no “my mate shot it but I’m holding it” nonsense).</p>

        <h2>4️⃣ Scoring & Badges</h2>
        <p>Points = species and how difficult it can be to acquire. These are <strong>double</strong> if it truly is the first time you have ever slayed one of these.</p>
		<p>Some species unlock bonus theme cards (e.g. <strong>Weedline Warriors</strong>).</p>
		<p>Club leaderboards mean your crew can battle it out amongst yourselves. </p>
		<p>Judges (a.k.a. the Fundies competition admin crew) have the final say.</p>

        <h2>5️⃣ Safety & Fair Play</h2>
        <p>All local laws and size limits apply. Treat the ocean with respect – no waste, no overfishing, no bad behaviour.</p>

        <h2>6️⃣ Participation &gt; Prizes</h2>
        <p>This comp is about stoke, species, and community. Yes, there’ll be some goodies, but the real prize is bragging rights, learning and better recipes.</p>
		<p>By participating in this competition and uploading pictures, you give your consent for us to share your pictures and catch with others via Fundees social media and potentially as the  face for that species / catch in future bingos.</p>

        <h2>7️⃣ Recipes & Tips</h2>
        <p>Each species has tips on how to actually find them. We’ll also drop recipes so you can make the most of your catch.</p>
       
        <h2>9️⃣ The Spirit of Bingo</h2>
        <p>Give your mate tips, bring them out on trips, and help them target new species too — spreading the stoke is part of the game. It’s meant to be fun. Be safe, be honest, cheer on others, and remember: the ocean always wins in the end.</p>
      </div>
    </div>
  )
}

function DataPage({ claims, reloadAll }) {
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const users = useMemo(() => {
    const m = new Map()
    for (const c of (claims || [])) {
      if (!m.has(c.user_id)) m.set(c.user_id, { id: c.user_id, name: c.display_name || 'Diver', count: 0 })
      m.get(c.user_id).count++
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [claims])

  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const dl = (rows, filename) => {
    const blob = new Blob([JSON.stringify({ claims: rows }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
  }
  const exportAll = () => dl(claims || [], 'fishbingo-ALL.json')
  const exportSelected = () => { const ids = new Set(selected); dl((claims || []).filter(c => ids.has(c.user_id)), `fishbingo-selected-${ids.size}.json`) }

  const onImportFile = async (file) => {
    if (!file) return
    try {
      setBusy(true); setMsg('')
      const payload = JSON.parse(await file.text())
      if (!payload || !Array.isArray(payload.claims)) { setMsg('Invalid file: expected { "claims": [...] }'); return }
      const adminKey = window.prompt('Admin key to confirm import (replaces claims for users present in file):')
      if (!adminKey) return
      const r = await fetch('/.netlify/functions/import-claims', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify(payload) })
      const text = await r.text()
      if (!r.ok) throw new Error(text || `Import failed (${r.status})`)
      setMsg('Import complete. Reloading…'); await reloadAll()
    } catch (e) { setMsg(String(e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div className='card'>
      <h3>Data: Export / Import</h3>
      <div className='row' style={{alignItems:'center', marginBottom: 8}}>
        <button className='btn' onClick={exportAll}>Export all</button>
        <button className='btn' onClick={exportSelected} disabled={selected.size===0}>Export selected</button>
      </div>
      <div className='card' style={{marginTop:10, marginBottom:12}}>
        <div className='small muted' style={{marginBottom:8}}>Select users to include in “Export selected”:</div>
        {users.length===0 ? (<div className='small muted'>No users found.</div>) : (
          <div style={{display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:6}}>
            {users.map(u=>(
              <label key={u.id} className='row' style={{alignItems:'center'}}>
                <input type='checkbox' checked={selected.has(u.id)} onChange={()=>toggle(u.id)} />
                <span style={{marginLeft:6}}>{u.name}</span>
                <span className='small muted' style={{marginLeft:6}}>({u.count} claims)</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className='row' style={{alignItems:'center'}}>
        <strong>Import</strong>
        <input className='right' type='file' accept='application/json' disabled={busy} onChange={e=>onImportFile(e.target.files?.[0])} />
      </div>
      {msg && <div className='alert' style={{marginTop:10}}>{msg}</div>}
      {busy && <div className='small muted' style={{marginTop:8}}>Working…</div>}
      <div className='small muted' style={{marginTop:10}}>Import will REPLACE existing claims for any users present in the file.</div>
    </div>
  )
}


// ======== UPDATED LATEST PAGE: Catches + Recipes ========
function LatestCatchesPage({ claims, pMap }) {
  // ---------- Existing Catches Section ----------
  const P = (pMap && typeof pMap.get === 'function') ? pMap : new Map();
  const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const pointsForAny = (slug) => {
    if (!slug) return 0;
    const norm = normalize(slug);
    const keyMatch =
      P.get(slug) ??
      P.get(norm) ??
      BONUS_POINTS.get(slug) ??
      BONUS_POINTS.get(norm);
    return keyMatch ?? 0;
  };
  const claimPoints = (c) => {
    const base = pointsForAny(c.species_slug);
    const mult = isBonusSlug(c.species_slug) ? 1 : c.first_time ? 2 : 1;
    return base * mult;
  };
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const nzYmd = (iso) => {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value || '0000';
    const m = parts.find((p) => p.type === 'month')?.value || '01';
    const da = parts.find((p) => p.type === 'day')?.value || '01';
    return `${y}-${m}-${da}`;
  };
  const nzLabel = (ymd) => {
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    const tmp = new Date(Date.UTC(y, m - 1, d));
    return tmp.toLocaleDateString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const recent = (claims || [])
    .filter((c) => !!c.photo_url && c.created_at && new Date(c.created_at) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const byDate = new Map();
  for (const c of recent) {
    const dateKey = nzYmd(c.created_at);
    if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
    const users = byDate.get(dateKey);
    const uid = c.user_id || 'unknown';
    const uname = c.display_name || 'Diver';
    if (!users.has(uid)) users.set(uid, { name: uname, items: [] });
    users.get(uid).items.push(c);
  }
  const dateKeys = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));

  // ---------- New Recipes Section ----------
  const [recipes, setRecipes] = React.useState([]);
  React.useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('dishes')
          .select('id, user_id, name, species_slug, recipe_url, description, photo_url, thumb_url, created_at')
          .order('created_at', { ascending: false })
          .limit(20);
        if (error) throw error;
        setRecipes(Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn('Failed to load latest recipes:', err);
      }
    })();
  }, []);

  // Group recipes by user
  const byUser = new Map();
  for (const r of recipes) {
    const uid = r.user_id || 'unknown';
    const uname = 'Diver';
    if (!byUser.has(uid)) byUser.set(uid, { name: uname, items: [] });
    byUser.get(uid).items.push(r);
  }
  const userKeys = Array.from(byUser.keys());

  // ---------- Render ----------
  return (
    <div className="card">
      <h3>Catches</h3>

      {/* === CATCHES === */}
      {recent.length === 0 ? (
        <p className="small muted">No catches in the last 7 days.</p>
      ) : (
        dateKeys.map((dk) => {
          const users = byDate.get(dk);
          const userEntries = Array.from(users.entries()).sort((a, b) =>
            String(a[1].name || '').localeCompare(String(b[1].name || ''))
          );
          return (
            <div key={dk} style={{ marginTop: 16 }}>
              <h4 style={{ margin: '8px 0' }}>{nzLabel(dk)}</h4>
              {userEntries.map(([uid, { name, items }]) => {
                items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                return (
                  <div key={uid} style={{ marginBottom: 12 }}>
                    <div className="row" style={{ alignItems: 'baseline', margin: '6px 0' }}>
                      <strong>{name}</strong>
                      <span className="small muted" style={{ marginLeft: 8 }}>
                        {items.length} photo{items.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: 12,
                      }}
                    >
                      {items.map((c) => {
                        const pts = claimPoints(c);
                        const imgSrc = c.thumb_url?.trim() ? c.thumb_url : c.photo_url;
                        return (
                          <div key={(c.id || '') + (c.created_at || '')} style={{ textAlign: 'center' }}>
                            <a
                              href={c.photo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View full image"
                              style={{ position: 'relative', display: 'block' }}
                            >
                              <img
                                src={imgSrc}
                                alt={c.species_slug}
                                style={{
                                  width: '100%',
                                  height: 'auto',
                                  borderRadius: 8,
                                }}
                                loading="lazy"
                              />
                              <div
                                className="badge"
                                style={{
                                  position: 'absolute',
                                  top: 6,
                                  right: 6,
                                  background: '#009688',
                                  color: '#fff',
                                  padding: '2px 6px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                }}
                                title={`${pts} pts`}
                              >
                                {pts} pts
                              </div>
                            </a>
                            <div style={{ marginTop: 4, fontSize: 13 }}>{c.species_slug}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      {/* === RECIPES === */}
      <div style={{ marginTop: 32 }}>
        <h3>Dishes</h3>
        {recipes.length === 0 ? (
          <p className="small muted">No recipes added yet.</p>
        ) : (
          userKeys.map((uid) => {
            const { name, items } = byUser.get(uid);
            return (
              <div key={uid} style={{ marginTop: 16 }}>
                <h4 style={{ marginBottom: 8 }}>{name}</h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 12,
                  }}
                >
                  {items.map((r) => (
                    <div key={r.id} className="card" style={{ padding: 8 }}>
                      <a
                        href={r.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', position: 'relative' }}
                      >
                        <img
                          src={r.thumb_url || r.photo_url}
                          alt={r.name}
                          style={{ width: '100%', borderRadius: 8 }}
                          loading="lazy"
                        />
                        <div className="badge" style={{ position: 'absolute', top: 6, right: 6 }}>
                          {r.species_slug}
                        </div>
                      </a>
                      <div style={{ marginTop: 6 }}>
                        <strong>{r.name}</strong>
                      </div>
                      {r.recipe_url && (
                        <div className="small">
                          <a
                            href={r.recipe_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#009688' }}
                          >
                            View Recipe
                          </a>
                        </div>
                      )}
                      {r.description && (
                        <div className="small muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
                          {r.description.length > 140
                            ? r.description.slice(0, 140) + '…'
                            : r.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* -----------------------------
   NEW: Inspiration Page (species filter + inline comments)
   Notes:
   - No join to profiles on *dishes* (per your instruction).
   - Comments *do* join to profiles so we can show commenter names.
--------------------------------*/
function InspirationPage({ signedIn, me, species }) {
  const [speciesSlug, setSpeciesSlug] = React.useState('')
  const [dishes, setDishes] = React.useState([])
  const [commentsMap, setCommentsMap] = React.useState(new Map()) // dish_id -> comments[]
  const [drafts, setDrafts] = React.useState(new Map()) // dish_id -> text
  const [loading, setLoading] = React.useState(false)

  const edible = Array.isArray(species) ? species.filter(s => !isBonusSlug(s.slug)) : []

  const loadDishes = React.useCallback(async () => {
    setLoading(true)
    try {
      const q = supabase
        .from('dishes')
        .select('id, name, species_slug, description, recipe_url, photo_url, thumb_url, created_at, profiles!inner(display_name)')
        .order('created_at', { ascending: false })
      if (speciesSlug) q.eq('species_slug', speciesSlug)

      const { data, error } = await q
      if (error) throw error
      const list = Array.isArray(data) ? data : []
      setDishes(list)

      // Fetch comments for all returned dishes in one go
      const ids = list.map(d => d.id).filter(Boolean)
      if (ids.length) {
        const { data: crows, error: cerr } = await supabase
          .from('dish_comments')
          .select('id, dish_id, user_id, comment, created_at, profiles!inner(display_name)')
          .in('dish_id', ids)
          .order('created_at', { ascending: true })
        if (cerr) throw cerr
        const map = new Map()
        for (const c of (crows || [])) {
          if (!map.has(c.dish_id)) map.set(c.dish_id, [])
          map.get(c.dish_id).push(c)
        }
        setCommentsMap(map)
      } else {
        setCommentsMap(new Map())
      }
    } catch (e) {
      console.warn('Inspiration load failed', e)
      notify('Could not load Inspiration right now.','error')
    } finally {
      setLoading(false)
    }
  }, [speciesSlug])

  useEffect(() => { loadDishes() }, [loadDishes])

  const setDraft = (dishId, text) => {
    setDrafts(prev => {
      const n = new Map(prev)
      n.set(dishId, text)
      return n
    })
  }

  const addComment = async (dishId) => {
    if (!signedIn || !me?.id) { notify('Please sign in to comment.','info'); return }
    const text = (drafts.get(dishId) || '').trim()
    if (!text) return
    try {
      const { error } = await supabase
        .from('dish_comments')
        .insert({ dish_id: dishId, user_id: me.id, comment: text })
      if (error) throw error
      setDraft(dishId, '')
      // Reload comments for this dish
      const { data: rows, error: cerr } = await supabase
        .from('dish_comments')
        .select('id, dish_id, user_id, comment, created_at, profiles!inner(display_name)')
        .eq('dish_id', dishId)
        .order('created_at', { ascending: true })
      if (cerr) throw cerr
      setCommentsMap(prev => {
        const n = new Map(prev)
        n.set(dishId, rows || [])
        return n
      })
      notify('Comment posted.','success')
    } catch (e) {
      notify('Failed to post comment: ' + (e.message || e),'error')
    }
  }

  return (
    <div className="card">
      <h3>Inspiration</h3>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <select
          className="input"
          value={speciesSlug}
          onChange={(e) => setSpeciesSlug(e.target.value)}
        >
          <option value="">All species</option>
          {edible.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
        <button className="btn" onClick={loadDishes} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {dishes.length === 0 ? (
        <p className="small muted">{loading ? 'Loading…' : 'No dishes found.'}</p>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:12 }}>
          {dishes.map(d => {
            const comments = commentsMap.get(d.id) || []
            return (
              <div key={d.id} className="card" style={{ padding:8 }}>
              <a
  href={d.photo_url}
  target="_blank"
  rel="noopener noreferrer"
  style={{ display: 'block', position: 'relative' }}
>
  <img
    src={d.thumb_url || d.photo_url}
    alt={d.name}
    style={{ width: '100%', borderRadius: 8 }}
    loading="lazy"
  />

  {/* Top-right species tag */}
  <div
    className="badge"
    style={{
      position: 'absolute',
      top: 6,
      right: 6,
      background: '#009688',
      color: '#fff',
      padding: '2px 6px',
      borderRadius: 6,
      fontSize: 12,
      opacity: 0.85,
    }}
  >
    {d.species_slug}
  </div>

  {/* Top-left diver name tag */}
  <span
    style={{
      position: 'absolute',
      top: 6,
      left: 6,
      background: '#009688', // match species tag
      color: '#fff',
      padding: '2px 6px',
      borderRadius: 6,
      fontSize: 12,
      opacity: 0.85,
    }}
  >
    {d.profiles?.display_name || 'Diver'}
  </span>

</a>

                <div style={{ marginTop:6 }}>
                  <strong>{d.name}</strong>
                </div>
                {d.recipe_url && (
                  <div className="small">
                    <a href={d.recipe_url} target="_blank" rel="noopener noreferrer" style={{ color:'#009688' }}>
                      View Recipe
                    </a>
                  </div>
                )}
                {d.description && (
                  <div className="small muted" style={{ marginTop:4, whiteSpace:'pre-wrap' }}>
                    {d.description}
                  </div>
                )}

                {/* Inline comments */}
                <div style={{ marginTop:10 }}>
                  <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Comments</div>
                  {comments.length === 0 ? (
                    <div className="tiny muted">No comments yet.</div>
                  ) : (
                    <div style={{ display:'grid', gap:6 }}>
                      {comments.map(c => (
                        <div key={c.id} style={{ fontSize:13, background:'#2B2F33', border:'1px solid #3F444A', padding:6, borderRadius:8 }}>
                          <strong>{c?.profiles?.display_name || 'Diver'}:</strong> {c.comment}
                          <div className="tiny muted" style={{ marginTop:2 }}>
                            {c.created_at ? new Date(c.created_at).toLocaleString('en-NZ') : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {signedIn && (
                    <div className="row" style={{ marginTop:8, gap:6 }}>
                      <input
                        className="input small"
                        placeholder="Add a comment…"
                        value={drafts.get(d.id) || ''}
                        onChange={(e)=> setDraft(d.id, e.target.value)}
                      />
                      <button className="btn small" onClick={()=>addComment(d.id)}>Post</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// =========================
// Dishes Page: add & list user's dishes
// =========================
function DishesPage({ species, me, token, signedIn }) {
  const [name, setName] = React.useState('')
  const [speciesSlug, setSpeciesSlug] = React.useState('')
  const [recipeUrl, setRecipeUrl] = React.useState('')
  const [desc, setDesc] = React.useState('')
  const [file, setFile] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [mine, setMine] = React.useState([])

  const edibleSpecies = React.useMemo(
    () => (Array.isArray(species) ? species.filter(s => !isBonusSlug(s.slug)) : []),
    [species]
  )

  const speciesName = (slug) => {
    const s = edibleSpecies.find(x => x.slug === slug)
    return s ? s.name : slug
  }

  const loadMine = React.useCallback(async () => {
    if (!me?.id) { setMine([]); return }
    try {
      const { data, error } = await supabase
        .from('dishes')
        .select('id, name, species_slug, recipe_url, description, photo_url, thumb_url, created_at')
        .eq('user_id', me.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setMine(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to load dishes', e)
      notify('Could not load your dishes right now.','error')
    }
  }, [me?.id])

  React.useEffect(() => { loadMine() }, [loadMine])

  if (!signedIn || !me?.id || !token) {
    return (
      <div className="card">
        <h3>Dishes</h3>
        <p className="small muted">Please sign in to add and view your dishes.</p>
      </div>
    )
  }

  // thumbnail helper
  const makeThumbnail = (file, maxWidth = 500) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Thumbnail failed'))
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.82)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })

  const onSubmit = async (e) => {
    e?.preventDefault?.()
    if (!name.trim()) return notify('Please enter a dish name.','error')
    if (!speciesSlug) return notify('Please pick a species.','error')
    if (!file) return notify('Please select a photo.','error')
    if (file.size > 10 * 1024 * 1024) return notify('File too large – max 10 MB.','error')

    setBusy(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const ts = Date.now()
      const base = `dishes/${me.id}/${speciesSlug}-${ts}`
      const fullPath = `${base}.${ext}`
      const thumbPath = `dishes/thumbs/${me.id}/${speciesSlug}-${ts}.jpg`

      // thumbnail upload
      let thumbUrl = ''
      try {
        const thumbFile = await makeThumbnail(file, 500)
        await supabase.storage.from('fish-uploads').upload(thumbPath, thumbFile, { upsert: true })
        const { data } = supabase.storage.from('fish-uploads').getPublicUrl(thumbPath)
        thumbUrl = data?.publicUrl || ''
      } catch (err) { console.warn('Thumbnail failed', err) }

      // main upload
      await supabase.storage.from('fish-uploads').upload(fullPath, file, { upsert: true })
      const { data } = supabase.storage.from('fish-uploads').getPublicUrl(fullPath)
      const photoUrl = data?.publicUrl || ''

      // insert row
      const payload = {
        user_id: me.id,
        name: name.trim(),
        species_slug: speciesSlug,
        recipe_url: recipeUrl?.trim() || null,
        description: desc?.trim() || null,
        photo_url: photoUrl,
        thumb_url: thumbUrl || photoUrl,
      }
      const { error } = await supabase.from('dishes').insert(payload)
      if (error) throw error

      notify('✅ Dish added!','success')
      setName(''); setSpeciesSlug(''); setRecipeUrl(''); setDesc(''); setFile(null)
      await loadMine()
    } catch (err) {
      console.error(err)
      notify('Could not save dish: ' + (err.message || err), 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h3>Add a New Dish</h3>
      <form onSubmit={onSubmit} className="add-dish-form">
  <div className="row2">
    <input
      className="input"
      placeholder="Dish name *"
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
    <select
      className="input"
      value={speciesSlug}
      onChange={(e) => setSpeciesSlug(e.target.value)}
    >
      <option value="">Select species *</option>
      {edibleSpecies.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.name}
        </option>
      ))}
    </select>
  </div>

  <div className="row2">
    <input
      className="input"
      placeholder="Recipe URL (optional)"
      value={recipeUrl}
      onChange={(e) => setRecipeUrl(e.target.value)}
    />
    <input
      className="input"
      type="file"
      accept="image/*"
      onChange={(e) => setFile(e.target.files?.[0] || null)}
    />
  </div>

  <textarea
    className="input"
    placeholder="Description & Cooking Guide (optional)"
    value={desc}
    onChange={(e) => setDesc(e.target.value)}
  />

  <div className="actions">
    <button className="btn primary" disabled={busy}>
      {busy ? 'Saving…' : 'Add Dish'}
    </button>
    <span className="small muted right">Photo max 10 MB (JPEG/PNG)</span>
  </div>
</form>


      <div style={{ marginTop:16 }}>
        <h3>Your Dishes</h3>
        {mine.length === 0 ? (
          <p className="small muted">No dishes yet – add your first above!</p>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
            {mine.map(d => (
              <div key={d.id} className="card" style={{ padding:8 }}>
<a
  href={d.photo_url}
  target="_blank"
  rel="noopener noreferrer"
  style={{ display: 'block', position: 'relative' }}
>
  <img
    src={d.thumb_url || d.photo_url}
    alt={d.name}
    style={{ width: '100%', borderRadius: 8 }}
    loading="lazy"
  />
  <div
    className="badge"
    style={{ position: 'absolute', top: 6, right: 6 }}
  >
    {speciesName(d.species_slug)}
  </div>
</a>

<div style={{ marginTop: 6 }}>
  <strong>{d.name}</strong>
</div>
{d.recipe_url && (
  <div className="small">
    <a
      href={d.recipe_url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#009688' }}
    >
      View Recipe
    </a>
  </div>
)}
{d.description && (
  <div
    className="small muted"
    style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}
  >
    {d.description}
  </div>
)}
{d.created_at && (
  <div
    className="tiny muted"
    style={{ marginTop: 6 }}
  >
    {new Date(d.created_at).toLocaleString()}
  </div>
)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}




export default function App(){
  return (<BrowserRouter><AppShell /></BrowserRouter>)
}
/* FULL FILE ENDS */
