// BingoBonuses.jsx
import React, { useEffect, useMemo, useState } from "react";

const API = {
  myClaims: "/.netlify/functions/claims-mine",
  claim: "/.netlify/functions/claim",
};

// ---- Bonus definitions (unchanged) ----
const MONTHLY = [
  { id:"month-august",    title:"August",    month:8,  points:150, species:["Snapper","Butterfish","Blue Mao Mao"],                                    bonusSlug:"bonus-month-august" },
  { id:"month-september", title:"September", month:9,  points:200, species:["Kahawai","Koheru","Porae"],                                                bonusSlug:"bonus-month-september" },
  { id:"month-october",   title:"October",   month:10, points:250, species:["Pack horse cray","Scorpion Fish","Red mullet"],                            bonusSlug:"bonus-month-october" },
  { id:"month-november",  title:"November",  month:11, points:300, species:["Blue Cod","Blue Mao Mao","Blue Moki","Butterfish"],                        bonusSlug:"bonus-month-november" },
  { id:"month-december",  title:"December",  month:12, points:350, species:["Pack horse cray","Paua","Paua - Yellow Foot","Red Cray"],                  bonusSlug:"bonus-month-december" },
  { id:"month-january",   title:"January",   month:1,  points:400, species:["Snapper over 5 kg","Trevally over 3kg","Tuna - Skippie","Giant Boarfish"], bonusSlug:"bonus-month-january" },
  { id:"month-february",  title:"February",  month:2,  points:450, species:["John Dory","Golden Snapper","Flounder"],                                   bonusSlug:"bonus-month-february" },
  { id:"month-march",     title:"March",     month:3,  points:500, species:["Kingfish over 30kg","Snapper over 10kg","Trevally over 3kg"],              bonusSlug:"bonus-month-march" },
  { id:"month-april",     title:"April",     month:4,  points:550, species:["Warehou","Tuna - Blue Fin","Billfish"],                                    bonusSlug:"bonus-month-april" },
];

const EVERGREENS = [
  { id:"evergreen-weedline-wonders",  title:"Weedline wonders",         points:350,  species:["Butterfish","Blue Moki","John Dory"],                         bonusSlug:"bonus-evergreen-weedline-wonders" },
  { id:"evergreen-pelagic-posse",     title:"Pelagic posse",            points:250,  species:["Koheru","Trevally","Kingfish over 15kg"],                      bonusSlug:"bonus-evergreen-pelagic-posse" },
  { id:"evergreen-shore-dive",        title:"Shore dive succulents",    points:500,  species:["Paua","Red Cray","Octopus"],                                   bonusSlug:"bonus-evergreen-shore-dive" },
  { id:"evergreen-south-island",      title:"South Island sweethearts", points:500,  species:["Blue Cod","Trumpeter","Tarakihi"],                            bonusSlug:"bonus-evergreen-south-island" },
  { id:"evergreen-bluewater",         title:"Bluewater beasties",       points:1000, species:["Billfish","Tuna - Yellow Fin","Tuna - Bluefin"],              bonusSlug:"bonus-evergreen-bluewater" },
  { id:"evergreen-creepy-crawlies",   title:"Creepy crawlies",       	points:750, species:["Red Cray","Pack horse cray","Spanish Lobster"],              bonusSlug:"bonus-evergreen-creepy-crawlies" },
];

// ---------- helpers ----------
const normalize = (s="") => s.toString().trim().toLowerCase();

async function loadJson(url, fallback){
  try{
    const r = await fetch(url, { cache:"no-store" });
    if(!r.ok) throw 0;
    return await r.json();
  }catch{ return fallback }
}

function resolveSlugByName(speciesArray, name){
  if(!Array.isArray(speciesArray)) return null;
  const q = normalize(name);

  const bySlug = speciesArray.find(s=> normalize(s.slug)===q);
  if(bySlug) return bySlug.slug;
  const byName = speciesArray.find(s=> normalize(s.name)===q);
  if(byName) return byName.slug;

  const alias = [
    { keys:["blue maomao","blue mao mao","blue-mao-mao","blue maomao"], pref:["Blue Mao Mao","blue-mao-mao"] },
    { keys:["pack horse cray","packhorse cray"], pref:["Pack horse cray","pack-horse-cray"] },
    { keys:["scorpion fish","scorpionfish"],     pref:["Scorpion Fish","scorpion fish"] },
    { keys:["red mullet"],                       pref:["Red mullet","red mullet"] },
  ];
  const hit = alias.find(a=> a.keys.some(k=> normalize(k)===q));
  if(hit){
    for(const p of hit.pref){
      const viaSlug = speciesArray.find(s=> normalize(s.slug)===normalize(p)); if(viaSlug) return viaSlug.slug;
      const viaName = speciesArray.find(s=> normalize(s.name)===normalize(p)); if(viaName) return viaName.slug;
    }
  }

  const parts = q.split(" ");
  const fuzzy = speciesArray.find(s=> { const n=normalize(s.name).split(" "); return parts.every(p=> n.includes(p)) });
  return fuzzy ? fuzzy.slug : null;
}

const imgFor = (sp) => sp?.image || (sp?.slug ? `/fish/${sp.slug}.jpg` : "");
function getCurrentMonth(d=new Date()){ return d.getMonth()+1; }

// ---------- main ----------
export default function BingoBonuses(){
  const [token] = useState(localStorage.getItem('fb_token')||"");
  const [me] = useState(()=>{ try { return JSON.parse(localStorage.getItem('fb_me')||"null") } catch { return null } });
  const signedIn = !!token && !!me;

  const [species,setSpecies] = useState(null);
  const [claims,setClaims] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(()=>{ (async()=>{
    const base = await loadJson('/fish_list.json', []);
    const extra = await loadJson('/bonus_fish.json', []);
    const arr = (Array.isArray(base)? base : (base?.species||[]));
    setSpecies([...(Array.isArray(arr)?arr:[]), ...(Array.isArray(extra)?extra:[])]);
  })() },[]);

  const fetchClaims = async () => {
    if(!signedIn){ setClaims([]); return }
    try{
      const r = await fetch(API.myClaims, { headers:{ Authorization:`Bearer ${token}` }, cache:'no-store' });
      if(!r.ok) throw 0;
      const data = await r.json();
      setClaims(Array.isArray(data?.claims) ? data.claims : []);
    }catch{
      setClaims([]);
    }
  };

  useEffect(()=>{ fetchClaims() },[signedIn, token, refreshKey]);

  const claimedSpecies = useMemo(()=> new Set(claims.map(c=> c.species_slug)), [claims]);

  if(species===null) return <div className="card"><p>Loading bonuses…</p></div>;

  const month = getCurrentMonth();
  const monthRow = MONTHLY.find(m=> m.month===month) || null;

  const onChanged = ()=> setRefreshKey(k=> k+1);

  return (
    <div>
      {monthRow && (
        <div className="card" style={{marginBottom:12}}>
          <div className="row" style={{alignItems:"baseline",marginBottom:6}}>
            <h3 style={{margin:0}}>Bingo Row of the Month</h3>
            <div className="right small muted">{monthRow.title} • +{monthRow.points} pts</div>
          </div>
          <BonusGroup group={monthRow} species={species} claimedSpecies={claimedSpecies} signedIn={signedIn} token={token} onChanged={onChanged} />
        </div>
      )}

      <div className="card">
        <h3>Full competition bonuses</h3>
        {EVERGREENS.map(g=> (
          <div key={g.id} style={{borderTop:"1px solid #222",paddingTop:12,marginTop:12}}>
            <div className="row" style={{alignItems:"baseline"}}>
              <div><strong>{g.title}</strong></div>
              <div className="right small muted">+{g.points} pts</div>
            </div>
            <BonusGroup group={g} species={species} claimedSpecies={claimedSpecies} signedIn={signedIn} token={token} onChanged={onChanged} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BonusGroup({ group, species, claimedSpecies, signedIn, token, onChanged }){
  const items = (group.species||[]).map(name=>{
    const slug = resolveSlugByName(species, name);
    const sp = slug ? species.find(s=> s.slug===slug) : null;
    const has = slug ? claimedSpecies.has(slug) : false;
    return { name, slug, sp, has };
  });

  const required = items.filter(i=> !!i.slug).map(i=> i.slug);
  const count = items.filter(i=> i.has).length;
  const allMet = required.length>0 && count===required.length;

  const bonusSlug = group.bonusSlug;
  const bonusClaimed = claimedSpecies.has(bonusSlug);

  const doClaimBonus = async () => {
    if(!signedIn){ window.fbNotify?.('Please sign in first.','info'); return }
    if(!allMet){ window.fbNotify?.('You need to claim all species in this row first.','info'); return }
    if(bonusClaimed){ window.fbNotify?.('Already claimed.','info'); return }
    try{
      const r = await fetch(API.claim, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ species_slug: bonusSlug, first_time: false })
      });
      if(!r.ok) throw new Error(await r.text());
      window.fbNotify?.(`Bonus claimed: ${group.title}`, 'success');
      onChanged && onChanged();
    }catch(e){
      window.fbNotify?.(String(e.message||e), 'error');
    }
  };

  const doUnclaim = async () => {
    if(!signedIn) return;
    try{
      const r = await fetch("/.netlify/functions/claim" + `?species_slug=${encodeURIComponent(bonusSlug)}`, {
        method:'DELETE',
        headers:{ Authorization:`Bearer ${token}` }
      });
      if(!r.ok) throw new Error(await r.text());
      window.fbNotify?.('Bonus unclaimed.','success');
      onChanged && onChanged();
    }catch(e){
      window.fbNotify?.(String(e.message||e),'error');
    }
  };

  return (
    <div>
      <div className="grid grid-3" style={{marginTop:8}}>
        {items.map(({name, sp, has})=> (
          <div key={name} className="row" style={{alignItems:"center"}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
              {sp ? (
                <img
                  src={imgFor(sp)}
                  alt={name}
                  style={{width:60,height:60,objectFit:"cover",borderRadius:6,border:"1px solid #2a2a2a"}}
                />
              ) : (
                <div
                  className="small muted"
                  style={{width:40,height:40,display:"grid",placeItems:"center",border:"1px solid #2a2a2a",borderRadius:6}}
                >
                  ?
                </div>
              )}
              <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {name}
              </span>
              {has && (
                <span style={{fontSize:'2em',color:'#10b981',lineHeight:1,marginLeft:6}}>✓</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{marginTop:8,alignItems:'center'}}>
        <div className="small muted">{items.filter(i=> i.has).length} / {items.length} claimed</div>
        <div className="right">
          {bonusClaimed ? (
            <>
              <button className="btn" disabled>Already claimed</button>
              <button className="btn" style={{marginLeft:8}} onClick={doUnclaim}>Unclaim</button>
            </>
          ) : allMet ? (
            <button className="btn primary" disabled={!signedIn} onClick={doClaimBonus}>Claim bonus</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
