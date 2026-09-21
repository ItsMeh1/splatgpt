/* SplatGPT - static knowledge assistant
 * Local data: data/Splatoon1|2|3/*.json
 * Live rotations: splatoon3.ink | Rankings: data/live/top500.json (splatnet3-scraper snapshot)
 */
let currentGame = "Splatoon3";
let localData = { weapons: [], maps: [], modes: [], story_logs: [],
  weapon_stats: [], salmonids: [], gear: [], abilities: [], kits: { subs: [], specials: [] } };
let schedulesCache = null;
let schedulesAt = 0;

const el = (id) => document.getElementById(id);
const on = (id, evt, fn) => {
  const n = el(id);
  if(n) n.addEventListener(evt, fn);
  else console.warn("SplatGPT: missing element #" + id);
  return n;
};

const chat = el("chat");
const form = el("input-bar");
const input = el("input");
const liveDot = el("live-dot");
const liveText = el("live-text");
const viewTitle = el("view-title");

/* ---------- utilities ---------- */
function esc(s){ return String(s??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmtCountdown(ms){
  if(ms<0) ms=0;
  const s = Math.floor(ms/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if(h>0) return `${h}hr ${String(m).padStart(2,"0")}m ${String(sec).padStart(2,"0")}s`;
  return `${m}m ${String(sec).padStart(2,"0")}s`;
}

/* ---------- rule metadata (official splatoon3.ink icons, localized in assets/icons/) ---------- */
const RULE_META = {
  TURF_WAR: { label: "Turf War", img: "assets/icons/turf.svg", icon: "fa-flag", color: "#c8e63a" },
  AREA:     { label: "Splat Zones", img: "assets/icons/zones.svg", icon: "fa-crosshairs", color: "#f97316" },
  LOFT:     { label: "Tower Control", img: "assets/icons/tower.svg", icon: "fa-arrow-up-right-from-square", color: "#0ea5e9" },
  GOAL:     { label: "Rainmaker", img: "assets/icons/rainmaker.svg", icon: "fa-umbrella", color: "#8b5cf6" },
  CLAM:     { label: "Clam Blitz", img: "assets/icons/clam.svg", icon: "fa-basketball", color: "#10b981" },
};
const CATEGORY_META = {
  "X Battles": { img: "assets/icons/xbattle.svg", icon: "fa-crown", color: "#f59e0b" },
  "Turf War": { img: "assets/icons/regular.svg", icon: "fa-flag", color: "#c8e63a" },
  "Anarchy Battle": { img: "assets/icons/bankara.svg", icon: "fa-fire", color: "#ef4444" },
  "Event / Challenge": { img: "assets/icons/challenge.svg", icon: "fa-bolt", color: "#a855f7" },
  "Salmon Run": { img: "assets/icons/salmon.svg", icon: "fa-fish", color: "#fb7185" },
};
function modeIcon(m, cls="rule-icon"){
  if(m && m.img) return `<img class="${cls}" src="${m.img}" alt="" loading="lazy" onerror="this.style.display='none'"/>`;
  return `<i class="fa-solid ${m?.icon || "fa-gamepad"}" style="color:${m?.color || "#64748b"}"></i>`;
}
function ruleMeta(rule, fallbackLabel){
  const m = RULE_META[rule];
  if(m) return m;
  const byName = Object.values(RULE_META).find(v => v.label === fallbackLabel);
  return byName || { label: fallbackLabel || "Battle", icon: "fa-gamepad", color: "#64748b" };
}

/* ---------- views ---------- */
function showView(name){
  const vc = el("view-chat"), vr = el("view-rotations"), vn = el("view-recents"), vs = el("view-settings"), va = el("view-about");
  if(vc) vc.hidden = name !== "chat";
  if(vr) vr.hidden = name !== "rotations";
  if(vn) vn.hidden = name !== "recents";
  if(vs) vs.hidden = name !== "settings";
  if(va) va.hidden = name !== "about";
  el("nav-rotations")?.classList.toggle("active", name === "rotations");
  el("nav-recents")?.classList.toggle("active", name === "recents");
  el("nav-new")?.classList.toggle("active", name === "chat");
  el("nav-settings")?.classList.toggle("active", name === "settings" || name === "about");
  if(viewTitle) viewTitle.textContent = name === "chat" ? "Chat" : name === "rotations" ? "Current rotations" : name === "recents" ? "Recent chats" : name === "about" ? "About" : "Settings";
  if(name === "rotations") renderRotationsPage();
  if(name === "recents") renderRecents();
}

/* ---------- conversations (localStorage) ---------- */
const LS_KEY = "splatgpt.conversations.v1";
let conversations = [];
let currentId = null;
try { conversations = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { conversations = []; }

function persist(){ try { localStorage.setItem(LS_KEY, JSON.stringify(conversations.slice(0,50))); } catch {} }
function currentConvo(){ return conversations.find(c => c.id === currentId); }
function newConversation(){
  if(chat) chat.innerHTML = "";
  const c = { id: "c" + Date.now().toString(36), title: "New conversation", game: currentGame, createdAt: new Date().toISOString(), messages: [] };
  conversations.unshift(c);
  currentId = c.id;
  persist();
  if(chat) chat.innerHTML = "";
  addMsg("assistant", `<h3>Welcome to SplatGPT!</h3><p>Ask me anything about <b>${esc(currentGame)}</b>! Use the game selector above to switch data between Splatoon 1, 2, and 3.</p>`, true);
}
function saveMsg(role, html){
  const c = currentConvo(); if(!c) return;
  c.messages.push({ role, html });
  if(c.messages.length <= 2){
    const firstUser = c.messages.find(m => m.role === "user");
    if(firstUser){ const t = firstUser.html.replace(/<[^>]+>/g,"").slice(0,48); if(t) c.title = t; }
  }
  c.game = currentGame;
  persist();
}
function openConversation(id){
  const c = conversations.find(x => x.id === id); if(!c) return;
  currentId = id;
  loadGame(c.game || "Splatoon3");
  if(chat) chat.innerHTML = "";
  c.messages.forEach(m => addMsg(m.role, m.html, true));
  showView("chat");
}
function deleteConversation(id){
  conversations = conversations.filter(c => c.id !== id);
  if(currentId === id) currentId = null;
  persist();
  renderRecents();
}
function clearConversations(){
  conversations = [];
  currentId = null;
  persist();
  renderRecents();
}
function renderRecents(){
  const list = el("recents-list");
  if(!list) return;
  const count = el("recents-count");
  if(count) count.textContent = conversations.length ? `${conversations.length} saved` : "";
  if(conversations.length === 0){
    list.innerHTML = `<div class="empty-state"><i class="fa-regular fa-comments"></i><h3>No conversations yet</h3><p>Start a new chat to ask about rotations, weapons, maps, or rankings.</p></div>`;
    return;
  }
  list.innerHTML = "";
  conversations.forEach(c => {
    const row = document.createElement("div");
    row.className = "recent-item";
    row.innerHTML = `<button class="recent-open"><i class="fa-regular fa-message"></i><span class="recent-title">${esc(c.title || "Conversation")}</span><span class="meta">${esc(c.game || "")} · ${esc(new Date(c.createdAt).toLocaleString())}</span></button><button class="recent-del" title="Delete conversation"><i class="fa-solid fa-trash-can"></i></button>`;
    row.querySelector(".recent-open").addEventListener("click", () => openConversation(c.id));
    row.querySelector(".recent-del").addEventListener("click", (e) => { e.stopPropagation(); deleteConversation(c.id); });
    list.appendChild(row);
  });
}

/* ---------- chat rendering ---------- */
function addMsg(role, html, skipSave=false){
  if(!chat) return null;
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "bot");
  const label = role === "user" ? "You" : "SplatGPT";
  div.innerHTML = `<div class="role">${label}</div><div class="bubble">${html}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  if(!skipSave) saveMsg(role, html);
  return div;
}

/* ---------- data loading ---------- */
async function loadGame(game){
  currentGame = game;
  document.querySelectorAll(".game-toggle button").forEach(b=>b.classList.toggle("active", b.dataset.game===game));
  const get = async (name, fallback) => {
    try{ const r = await fetch(`data/${game}/${name}`); if(!r.ok) return fallback; return await r.json(); }
    catch{ return fallback; }
  };
  const [w,m,mo,s] = await Promise.all([
    get("weapons.json", []), get("maps.json", []), get("modes.json", []), get("story_logs.json", []),
  ]);
  // mined game parameters (Splatoon 3 only; absent for S1/S2)
  const [stats, sal, gear, ab, kits] = await Promise.all([
    get("weapon_stats.json", []), get("salmonids.json", []), get("gear.json", []),
    get("abilities.json", []), get("kits.json", { subs: [], specials: [] }),
  ]);
  localData = { weapons:w, maps:m, modes:mo, story_logs:s,
    weapon_stats:stats, salmonids:sal, gear, abilities:ab, kits };
}
function statForWeapon(name){
  const t = (name||"").toLowerCase();
  return (localData.weapon_stats||[]).find(s => s.name.toLowerCase() === t) || null;
}
function statLine(s){
  if(!s) return "";
  const bits = [];
  if(s.sub || s.special) bits.push(`Kit: ${esc(s.sub || "?")} / ${esc(s.special || "?")}`);
  if(s.special_points) bits.push(`Special: ${esc(String(s.special_points))}p`);
  if(s.price) bits.push(`Price: ${esc(String(s.price))}`);
  if(s.unlock_rank != null && s.unlock_rank >= 0) bits.push(`Rank ${esc(String(s.unlock_rank))}`);
  if(s.range) bits.push(`Range ${esc(String(s.range))}`);
  return bits.length ? `<br/>${bits.join(" • ")}` : "";
}
/* ---------- gear cards ---------- */
const GEAR_SLOTS = {
  head: { label: "Headgear", icon: "fa-helmet-safety", tint: "#38bdf8" },
  clothes: { label: "Clothing", icon: "fa-shirt", tint: "#a78bfa" },
  shoes: { label: "Shoes", icon: "fa-shoe-prints", tint: "#34d399" },
};
function gearStars(rarity){
  const filled = Math.max(1, Math.min(3, (parseInt(rarity, 10) || 0) + 1)); // rarity 0-2 → 1-3 stars
  return `<span class="gear-stars" title="${filled}-star gear">${"★".repeat(filled)}${"☆".repeat(3 - filled)}</span>`;
}
function gearCard(g){
  const slot = GEAR_SLOTS[g.slot] || { label: g.slot || "Gear", icon: "fa-shirt", tint: "#64748b" };
  const visual = g.image
    ? `<span class="gear-visual"><img class="gear-img" src="${g.image}" alt="" loading="lazy" onerror="this.parentNode.classList.add('no-img');this.remove()"/><span class="gear-slot" style="--tint:${slot.tint}" title="${esc(slot.label)}"><i class="fa-solid ${slot.icon}"></i></span></span>`
    : `<span class="gear-visual no-img"><span class="gear-slot" style="--tint:${slot.tint}" title="${esc(slot.label)}"><i class="fa-solid ${slot.icon}"></i></span></span>`;
  const abIcon = g.ability_icon ? `<img class="ability-icon" src="${g.ability_icon}" alt="" loading="lazy" onerror="this.remove()"/>` : `<i class="fa-solid fa-bolt"></i>`;
  return `<div class="gear-card">` +
    `<div class="gear-top">${visual}` +
    `<span class="gear-name">${esc(g.name)}</span>${gearStars(g.rarity)}</div>` +
    `<div class="gear-ability">${abIcon} ${esc(g.ability || "No main ability")}</div>` +
    (g.ability_desc ? `<p class="gear-desc">${esc(g.ability_desc)}</p>` : "") +
    `<div class="gear-foot"><span class="tag"><i class="fa-solid fa-copyright"></i> ${esc(g.brand || "?")}</span>` +
    (g.price ? `<span class="gear-price"><i class="fa-solid fa-coins"></i> ${esc(Number(g.price).toLocaleString("en-US"))}</span>` : "") +
    (g.season != null && g.season > 0 ? `<span class="tag">S${esc(String(g.season))}</span>` : "") +
    `</div></div>`;
}
async function getSchedules(force=false){
  const now = Date.now();
  if(!force && schedulesCache && (now - schedulesAt) < 60_000) return schedulesCache;
  const res = await fetch("https://splatoon3.ink/data/schedules.json");
  if(!res.ok) throw new Error("schedules request failed");
  schedulesCache = await res.json();
  schedulesAt = now;
  setLive(true, "splatoon3.ink: live");
  return schedulesCache;
}
function setLive(online, text){
  if(liveDot) { liveDot.classList.toggle("online", online); liveDot.classList.toggle("offline", !online); }
  if(liveText) liveText.textContent = text;
}
function currentNode(nodes){
  const now = new Date();
  return nodes.find(n => new Date(n.startTime) <= now && now < new Date(n.endTime)) || nodes[0];
}
function rotationWidgetHTML({label, rule, ruleCode, stages, startTime, endTime}){
  const rm = ruleMeta(ruleCode, rule);
  const cat = Object.keys(CATEGORY_META).find(k => label.startsWith(k)) || "";
  const cm = CATEGORY_META[cat] || { icon: "fa-rotate", color: "#64748b" };
  // Turf War's rule IS "Turf War" — repeating it in the pill is redundant
  const pillText = (rm.label === label) ? (label === "Turf War" ? "Regular Battle" : rm.label) : rm.label;
  const stageHtml = stages.slice(0,2).map(s=>{
    const img = s.image?.url || "";
    return `<div class="rot-map">${img?`<img src="${img}" alt="${esc(s.name)}" loading="lazy"/>`:""}<span>${esc(s.name)}</span></div>`;
  }).join("");
  return `
  <div class="rot-widget" data-start="${startTime}" data-end="${endTime}">
    <div class="rot-header"><span class="rot-cat">${modeIcon(cm)} ${esc(label)}</span><span class="mode-pill">${modeIcon(rm)} ${esc(pillText)}</span></div>
    <div class="rot-maps">${stageHtml}</div>
    <div class="rot-timer"><span class="elapsed">Loading…</span></div>
    <div class="rot-bar" title=""><div></div></div>
    <div class="rot-small">Source: splatoon3.ink</div>
  </div>`;
}
function tickWidgets(){
  document.querySelectorAll(".rot-widget").forEach(w=>{
    const start = new Date(w.dataset.start).getTime();
    const end = new Date(w.dataset.end).getTime();
    const now = Date.now();
    const total = end - start;
    const done = Math.min(Math.max(now - start, 0), total);
    const pct = total>0 ? (done/total*100) : 0;
    const bar = w.querySelector(".rot-bar > div");
    const outer = w.querySelector(".rot-bar");
    const elapsed = w.querySelector(".elapsed");
    if(bar) bar.style.width = pct.toFixed(2) + "%";
    if(elapsed) elapsed.textContent = fmtCountdown(done) + " elapsed";
    if(outer) outer.title = "Time until rotation ends: " + fmtCountdown(end - now);
  });
}
setInterval(tickWidgets, 1000);

/* ---------- rotations page (no chat) ---------- */
async function renderRotationsPage(){
  const grid = el("rotations-grid");
  if(!grid) return;
  grid.innerHTML = `<div class="skeleton-card"><div class="sk sk-title"></div><div class="sk sk-maps"></div><div class="sk sk-bar"></div></div>`.repeat(4);
  try{
    const data = await getSchedules(true);
    const d = data.data;
    const cards = [];
    const x = currentNode(d.xSchedules.nodes);
    cards.push(rotationWidgetHTML({label:"X Battles", rule:x.xMatchSetting.vsRule.name, ruleCode:x.xMatchSetting.vsRule.rule, stages:x.xMatchSetting.vsStages, startTime:x.startTime, endTime:x.endTime}));
    const r = currentNode(d.regularSchedules.nodes);
    cards.push(rotationWidgetHTML({label:"Turf War", rule:r.regularMatchSetting.vsRule.name, ruleCode:r.regularMatchSetting.vsRule.rule, stages:r.regularMatchSetting.vsStages, startTime:r.startTime, endTime:r.endTime}));
    const b = currentNode(d.bankaraSchedules.nodes);
    (b.bankaraMatchSettings||[]).forEach((s,i)=> cards.push(rotationWidgetHTML({label:`Anarchy Battle (${i===0?"Series":"Open"})`, rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:b.startTime, endTime:b.endTime})));
    try{
      const ev = currentNode(d.eventSchedules.nodes);
      const s = ev.eventMatchSetting || ev.challengeMatchSetting;
      if(s) cards.push(rotationWidgetHTML({label:"Event / Challenge", rule:s.vsRule?.name||"Event", ruleCode:s.vsRule?.rule, stages:s.vsStages, startTime:ev.startTime, endTime:ev.endTime}));
    }catch{}
    try{
      const coopRes = await fetch("https://splatoon3.ink/data/coop.json");
      const coop = await coopRes.json();
      const n = currentNode(coop.data.regularSchedules.nodes);
      cards.push(rotationWidgetHTML({label:"Salmon Run", rule:"Grizzco Shift", stages:[{name:n.setting.coopStage?.name||"Stage", image:n.setting.coopStage?.image},{name:n.setting.boss?.name||"King Salmonid", image:{url:""}}], startTime:n.startTime, endTime:n.endTime}));
    }catch{}
    grid.innerHTML = cards.join("");
    tickWidgets();
  }catch(e){
    if(grid) grid.innerHTML = `<p class="muted">Rotation data is currently unavailable (${esc(e.message)}). Please try again later.</p>`;
    setLive(false, "splatoon3.ink: unavailable");
  }
}
on("refresh-rotations", "click", renderRotationsPage);

/* ---------- answers ---------- */
async function answerRotation(kind, asChat=true){
  const htmlToMsg = (h) => { if(asChat) addMsg("assistant", h); return h; };
  try{
    const data = await getSchedules();
    const d = data.data;
    if(kind==="x"){
      const node = currentNode(d.xSchedules.nodes);
      const s = node.xMatchSetting;
      return htmlToMsg(`<h3>Heres the current X Battle rotation</h3>` + rotationWidgetHTML({label:"X Battles", rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:node.startTime, endTime:node.endTime}));
    } else if(kind==="turf"){
      const node = currentNode(d.regularSchedules.nodes);
      const s = node.regularMatchSetting;
      return htmlToMsg(`<h3>Heres the current Turf War rotation</h3>` + rotationWidgetHTML({label:"Turf War", rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:node.startTime, endTime:node.endTime}));
    } else if(kind==="anarchy"){
      const node = currentNode(d.bankaraSchedules.nodes);
      let html = `<h3>Heres the current Anarchy rotations</h3>`;
      (node.bankaraMatchSettings||[]).forEach((s,i)=>{ html += rotationWidgetHTML({label:`Anarchy Battle (${i===0?"Series":"Open"})`, rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:node.startTime, endTime:node.endTime}); });
      return htmlToMsg(html);
    } else if(kind==="event"){
      const node = currentNode(d.eventSchedules.nodes);
      const s = node.eventMatchSetting || node.challengeMatchSetting;
      if(!s){ htmlToMsg(`<p>No Event rotation is currently active.</p>`); return; }
      return htmlToMsg(`<h3>Heres the current Event rotation</h3>` + rotationWidgetHTML({label:"Event / Challenge", rule:s.vsRule?.name||"Event", ruleCode:s.vsRule?.rule, stages:s.vsStages, startTime:node.startTime, endTime:node.endTime}));
    } else if(kind==="salmon"){
      const res = await fetch("https://splatoon3.ink/data/coop.json");
      const coop = await res.json();
      const node = currentNode(coop.data.regularSchedules.nodes);
      const setting = node.setting;
      const weapons = (setting.weapons||[]).map(w=>esc(w.name)).join(", ");
      return htmlToMsg(`<h3>Heres the current Salmon Run shift</h3><p><span class="tag">${esc(setting.coopStage?.name||"")}</span><span class="tag">${esc(setting.boss?.name||"")}</span></p><p>Supplied weapons: ${weapons||"Grizzco random"}</p>` +
        rotationWidgetHTML({label:"Salmon Run", rule:"Grizzco Shift", stages:[{name:setting.coopStage?.name||"?", image:setting.coopStage?.image},{name:(setting.boss?.name||"Salmonids"), image:{url:""}}], startTime:node.startTime, endTime:node.endTime}));
    }
  }catch(e){
    htmlToMsg(`<p>Sorry, but rotation data is currently unavailable (${esc(e.message)}).</p>`);
    setLive(false, "splatoon3.ink: unavailable");
  } finally { tickWidgets(); }
}

/* ---------- Top 500: snapshot first, splatoon3.ink X-rank archive as fallback ---------- */
const XRANK_MODES = [
  { key: "splatzones", xkey: "xRankingAr", label: "Splat Zones", img: "assets/icons/zones.svg", icon: "fa-crosshairs", color: "#f97316" },
  { key: "towercontrol", xkey: "xRankingLf", label: "Tower Control", img: "assets/icons/tower.svg", icon: "fa-arrow-up-right-from-square", color: "#0ea5e9" },
  { key: "rainmaker", xkey: "xRankingGl", label: "Rainmaker", img: "assets/icons/rainmaker.svg", icon: "fa-umbrella", color: "#8b5cf6" },
  { key: "clamblitz", xkey: "xRankingCl", label: "Clam Blitz", img: "assets/icons/clam.svg", icon: "fa-basketball", color: "#10b981" },
];
const XRANK_DIVS = [
  { key: "p", label: "Takoroka" },
  { key: "a", label: "Tentatek" },
];
let xrankSeasons = {};
async function xrankSeasonList(div="p"){
  if(xrankSeasons[div]) return xrankSeasons[div];
  const res = await fetch("https://assets.splatoon3.ink/data/xrank/?format=json");
  if(!res.ok) throw new Error("ranking index unavailable");
  const d = await res.json();
  const re = new RegExp(`^xrank\\.detail\\.${div}-(\\d+)\\.splatzones\\.json$`);
  const seasons = (d.files||[]).map(f => (f.name||"").match(re)).filter(Boolean).map(m => parseInt(m[1],10));
  if(!seasons.length) throw new Error("no ranking seasons found");
  xrankSeasons[div] = [...new Set(seasons)].sort((a,b)=>b-a).slice(0,6);
  return xrankSeasons[div];
}
async function xrankFetch(modeKey, div="p", season=null){
  const mode = XRANK_MODES.find(m => m.key === modeKey) || XRANK_MODES[0];
  if(!XRANK_DIVS.some(d => d.key === div)) div = "p";
  if(!season) season = (await xrankSeasonList(div))[0];
  const url = `https://assets.splatoon3.ink/data/xrank/xrank.detail.${div}-${season}.${mode.key}.json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("ranking file unavailable");
  const d = await res.json();
  const edges = (d?.data?.node?.[mode.xkey]?.edges || []).map(e => e.node).filter(Boolean);
  return { season, edges };
}
function rankMedal(rank){
  if(rank === 1) return "r1";
  if(rank === 2) return "r2";
  if(rank === 3) return "r3";
  return "";
}
function rankRowsArchive(edges){
  return `<p class="muted">${edges.length} players</p><div class="rank-list scroll">` + edges.map(n=>`<div class="rank-row"><span class="rank ${rankMedal(n.rank)}">${n.rank}</span>${n.weapon?.image?.url?`<img class="rank-weapon" src="${n.weapon.image.url}" alt="${esc(n.weapon.name||"")}" loading="lazy"/>`:""}<span class="rank-name">${esc(n.name)}<small>${esc(n.weapon?.name||"")}</small></span><span class="rank-xp">${esc(String(n.xPower))} XP</span></div>`).join("") + `</div>`;
}
async function answerTop500(modeKey="splatzones", div="p", season=null){
  const mode = XRANK_MODES.find(m => m.key === modeKey) || XRANK_MODES[0];
  if(!XRANK_DIVS.some(d => d.key === div)) div = "p";
  const msg = addMsg("assistant", `<h3><i class="fa-solid fa-trophy" style="color:#f59e0b"></i> Top 500 X leaderboard</h3><div class="xrank-tabs" data-xdivs></div><div class="xrank-tabs" data-xtabs></div><div class="xrank-controls"><label>Season <select data-xseason><option>Loading…</option></select></label></div><div data-xlist><div class="skeleton-card"><div class="sk sk-title"></div><div class="sk sk-row"></div><div class="sk sk-row"></div><div class="sk sk-row"></div></div></div><p class="rot-small" data-xsrc>Checking snapshots…</p>`);
  if(!msg) return;
  const divsEl = msg.querySelector("[data-xdivs]");
  const tabsEl = msg.querySelector("[data-xtabs]");
  const listEl = msg.querySelector("[data-xlist]");
  const srcEl = msg.querySelector("[data-xsrc]");
  const selEl = msg.querySelector("[data-xseason]");
  let cur = { mode: mode.key, div, season };
  const paintDivs = () => {
    divsEl.innerHTML = XRANK_DIVS.map(d => `<button class="xrank-tab div-tab${d.key===cur.div?" active":""}" data-xd="${d.key}"><i class="fa-solid fa-shield-halved"></i> ${d.label}</button>`).join("");
    divsEl.querySelectorAll("[data-xd]").forEach(b => b.addEventListener("click", async () => { cur.div = b.dataset.xd; cur.season = null; paintDivs(); await paintSeasons(); loadArchive(); }));
  };
  const paintTabs = () => {
    tabsEl.innerHTML = XRANK_MODES.map(m => `<button class="xrank-tab${m.key===cur.mode?" active":""}" data-xm="${m.key}">${modeIcon(m)} ${m.label}</button>`).join("");
    tabsEl.querySelectorAll("[data-xm]").forEach(b => b.addEventListener("click", () => { cur.mode = b.dataset.xm; paintTabs(); loadArchive(); }));
  };
  const paintSeasons = async () => {
    try{
      const seasons = await xrankSeasonList(cur.div);
      if(!cur.season || !seasons.includes(cur.season)) cur.season = seasons[0];
      selEl.innerHTML = seasons.map(s => `<option value="${s}"${s===cur.season?" selected":""}>${cur.div}-${s}</option>`).join("");
    }catch{ selEl.innerHTML = `<option>Unavailable</option>`; }
  };
  const loadArchive = async () => {
    listEl.innerHTML = `<div class="skeleton-card"><div class="sk sk-title"></div><div class="sk sk-row"></div><div class="sk sk-row"></div><div class="sk sk-row"></div></div>`;
    try{
      const { season: s, edges } = await xrankFetch(cur.mode, cur.div, cur.season);
      cur.season = s;
      if(selEl) selEl.value = String(s);
      if(!edges.length) throw new Error("empty ranking");
      listEl.innerHTML = rankRowsArchive(edges);
      const divLabel = (XRANK_DIVS.find(d => d.key === cur.div) || {}).label || cur.div;
      srcEl.textContent = `Source: splatoon3.ink X-rank archive, ${divLabel} season ${cur.div}-${s}. Full Top 500 below.`;
    }catch(e){
      listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-trophy"></i><h3>Rankings unavailable</h3><p>The public archive could not be reached (${esc(e.message)}).</p></div>`;
      srcEl.textContent = "";
    }
  };
  paintDivs();
  paintTabs();
  await paintSeasons();
  selEl.addEventListener("change", () => { cur.season = parseInt(selEl.value,10); loadArchive(); });
  // 1) preferred: splatnet3-scraper snapshot committed by Action
  try{
    const r = await fetch("data/live/top500.json");
    const j = await r.json();
    if(j.x_rank_top500 && j.x_rank_top500.length){
      listEl.innerHTML = `<p class="muted">${j.x_rank_top500.length} players</p><div class="rank-list scroll">` + j.x_rank_top500.map(e=>`<div class="rank-row"><span class="rank ${rankMedal(e.rank)}">${e.rank}</span><span class="rank-name">${esc(e.name)}</span><span class="rank-xp">${esc(String(e.x_power))} XP</span></div>`).join("") + `</div>`;
      srcEl.textContent = `Source: splatnet3-scraper snapshot (${j.updated_at || "unknown date"}). Switch division or season for archived public rankings.`;
      return;
    }
  }catch{}
  // 2) fallback: splatoon3.ink public X-rank archive (no auth needed)
  loadArchive();
}

function searchLocal(q){
  q = q.toLowerCase();
  const out = [];
  ["weapons","weapon_stats","maps","modes","story_logs","salmonids","gear","abilities"].forEach(cat=>{
    (localData[cat]||[]).forEach(item=>{
      const hay = Object.values(item).join(" ").toLowerCase();
      let s = 0;
      q.split(/\s+/).forEach(tok=>{ if(tok.length>2 && hay.includes(tok)) s++; });
      if(s>0) out.push({cat, sc:s, item});
    });
  });
  return out.sort((a,b)=>b.sc-a.sc).slice(0,6);
}

/* ---------- small talk (pseudo-text abilities) ---------- */
function smallTalk(text){
  const t = text.toLowerCase().trim().replace(/[!.?~]+$/,"").trim();
  if(/^(hi|hello|hey|yo|sup|howdy|hiya|hello there|hey there|hi there)$/.test(t))
    return `<p>Hello! Ask about litterally anything Splatoon related.</p>`;
  if(/^(good morning|good afternoon|good evening|morning|evening)$/.test(t))
    return `<p>Hello! What would you like to look up today?</p>`;
  if(/how are you|how('s| is) it going|how do you feel/.test(t))
    return `<p>Running well. Rotations are live and the ${esc(currentGame)} dataset is loaded. What can I look up for you?</p>`;
  if(/^(thanks|thank you|thx|ty|appreciated|great thanks)( very much)?$/.test(t) || /\bthank (you|u)\b/.test(t))
    return `<p>You're welcome. Anything else to look up?</p>`;
  if(/^(bye|goodbye|good night|see you|later|gtg)$/.test(t))
    return `<p>Goodbye. Your chats are saved under Recent chats.</p>`;
  if(/who are you|what are you|about yourself|your name/.test(t))
    return `<p>I'm SplatGPT, a fan-made Splatoon series assistant.</p>`;
  if(/^(cool|nice|awesome|great|sweet|ok|okay|k|lol|haha|lmao)$/.test(t))
    return `<p>Noted. What do you want to do next?</p>`;
  if(/i love (splatoon|this)|splatoon is (great|awesome|fun)/.test(t))
    return `<p>Agreed — strong game. If you're climbing, the Anarchy and X Battle rotations are worth checking before you queue.</p>`;
  if(/^(help|commands|what can you do)$/.test(t))
    return null; // handled below with full capabilities card
  return null;
}

/* ---------- settings ---------- */
const SETTINGS_KEY = "splatgpt.settings.v1";
let settings = { theme: "dark", accent: "ink", sendouToken: "" };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch {}
function saveSettings(){ try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
function applySettings(){
  document.body.dataset.theme = settings.theme === "light" ? "light" : "dark";
  document.body.dataset.accent = settings.accent || "ink";
  const ts = el("setting-theme"); if(ts) ts.value = settings.theme;
  const tk = el("setting-sendou-token"); if(tk && document.activeElement !== tk) tk.value = settings.sendouToken || "";
  document.querySelectorAll("[data-accent-pick]").forEach(b => b.classList.toggle("active", b.dataset.accentPick === settings.accent));
}

/* ---------- sendou.ink (public API is token-gated; builds pages are public links) ---------- */
function sendouSlug(name){
  return String(name||"").toLowerCase().replace(/['.]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
async function sendouFetch(path){
  const token = (settings.sendouToken || "").trim();
  if(!token) throw new Error("no_token");
  const res = await fetch(`https://sendou.ink/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if(!res.ok) throw new Error(`sendou.ink responded ${res.status}`);
  return res.json();
}
function findWeapon(text){
  const t = text.toLowerCase();
  return (localData.weapons || []).map(w => {
    const n = w.name.toLowerCase();
    let score = 0;
    if(t.includes(n)) score = n.length + 10;
    else {
      const parts = n.replace(/['.]/g,"").split(/[\s_'-]+/);
      const hits = parts.filter(p => p.length > 2 && t.includes(p)).length;
      if(hits) score = hits;
    }
    return { w, score };
  }).filter(x => x.score > 0).sort((a,b)=>b.score-a.score)[0]?.w || null;
}
async function answerBuild(queryText){
  const w = findWeapon(queryText);
  if(!w){
    addMsg("assistant", `<h3>Builds</h3><p>Which weapon? Try “best build for Splattershot” or “N-ZAP 85 kit”. Weapon pages live at <a href="https://sendou.ink/builds" target="_blank" rel="noopener">sendou.ink/builds</a>.</p>`);
    return;
  }
  const slug = sendouSlug(w.name);
  const st = statForWeapon(w.name);
  addMsg("assistant", `<h3><i class="fa-solid fa-shirt" style="color:var(--accent)"></i> ${esc(w.name)} — kit & builds</h3><div class="mini-card"><b>${esc(w.class)}</b><br/>Sub: ${esc(st?.sub || w.sub)} • Special: ${esc(st?.special || w.special)}${statLine(st)}${w.notes?`<br/>${esc(w.notes)}`:""}</div><p>Community builds: <a href="https://sendou.ink/builds/${slug}" target="_blank" rel="noopener">sendou.ink/builds/${slug}</a><br/>Test gear combinations: <a href="https://sendou.ink/analyzer" target="_blank" rel="noopener">sendou.ink/analyzer</a></p><p class="rot-small">Kit stats mined from game parameters. Builds themselves live on sendou.ink, which needs no login to read.</p>`);
}
async function answerSendouUser(who){
  who = (who || "").trim();
  if(!who){ addMsg("assistant", `<p>Usage: “sendou user Sendou” or “sendou user 1”. A personal API token can be saved in Settings to enable lookups.</p>`); return; }
  addMsg("assistant", `<h3>sendou.ink user lookup</h3><div data-sendou-user><div class="skeleton-card"><div class="sk sk-row"></div><div class="sk sk-row"></div></div></div>`);
  const box = chat.querySelector(".msg.bot:last-child [data-sendou-user]");
  try{
    const d = await sendouFetch(`/user/${encodeURIComponent(who)}`);
    if(box) box.innerHTML = `<div class="mini-card"><b>${esc(d.username || d.name || who)}</b><br/><span class="tag">ID ${esc(String(d.id ?? ""))}</span> ${d.country?`<span class="tag">${esc(d.country)}</span>`:""}</div><p><a href="https://sendou.ink/u/${encodeURIComponent(d.customUrl || d.id || who)}" target="_blank" rel="noopener">Open profile on sendou.ink</a></p>`;
  }catch(e){
    if(box) box.innerHTML = `<div class="empty-state"><i class="fa-solid fa-key"></i><h3>Lookup unavailable</h3><p>${e.message === "no_token" ? "Save your sendou.ink API token in Settings first (free at sendou.ink/api)." : "Request failed (" + esc(e.message) + ")."}</p></div>`;
  }
}

/* ---------- rank lookup with slot-filling follow-ups ---------- */
let rankFlow = null; // { rank, seasonSpec, mode, div }
function detectMode(text){
  const t = text.toLowerCase();
  return (XRANK_MODES.find(m => t.includes(m.label.toLowerCase())) || null)?.key || null;
}
function detectDiv(text){
  const t = text.toLowerCase();
  if(/tentatek|\btenta\b/.test(t)) return "a";
  if(/takoroka|\btako\b/.test(t)) return "p";
  return null;
}
function detectSeasonSpec(text){
  const t = text.toLowerCase();
  const m = t.match(/season\s*[pa]?-?(\d{1,2})/);
  if(m) return { type: "num", n: parseInt(m[1],10) };
  if(/last season|previous season|past season|older season/.test(t)) return { type: "last" };
  if(/current season|this season/.test(t)) return { type: "current" };
  return null;
}
function wantsRankLookup(q){
  if(/top ?500/.test(q) && !q.includes("#") && !/who|which player|what player|placed?/.test(q)) return false;
  const m = q.match(/#?([1-9]\d{0,2})\b/);
  if(!m) return false;
  const n = parseInt(m[1],10);
  if(n < 1 || n > 500) return false;
  return /#|rank|who|placed?|placement|position|finish/.test(q) ? n : false;
}
function rankChoiceButtons(kind, items){
  return `<div class="choice-row">` + items.map(it =>
    `<button class="choice-btn" data-rank-${kind}="${it.key}">${it.iconImg || ""}${esc(it.label)}</button>`
  ).join("") + `</div>`;
}
function askRankSlot(kind){
  const flow = rankFlow;
  let html;
  if(kind === "mode"){
    html = `<p>Which mode was rank <b>#${flow.rank}</b> in?</p>` + rankChoiceButtons("mode",
      XRANK_MODES.map(m => ({ key: m.key, label: m.label, iconImg: modeIcon(m) + " " })));
  } else {
    html = `<p>Which division — Takoroka or Tentatek?</p>` + rankChoiceButtons("div",
      XRANK_DIVS.map(d => ({ key: d.key, label: d.label, iconImg: `<i class="fa-solid fa-shield-halved"></i> ` })));
  }
  const msg = addMsg("assistant", html);
  if(!msg) return;
  msg.querySelectorAll("[data-rank-mode]").forEach(b => b.addEventListener("click", () => {
    rankFlow.mode = b.dataset.rankMode; continueRankFlow();
  }));
  msg.querySelectorAll("[data-rank-div]").forEach(b => b.addEventListener("click", () => {
    rankFlow.div = b.dataset.rankDiv; continueRankFlow();
  }));
}
async function continueRankFlow(){
  const flow = rankFlow;
  if(!flow) return;
  if(!flow.mode){ askRankSlot("mode"); return; }
  if(!flow.div){ askRankSlot("div"); return; }
  // all slots filled — resolve season and show
  let season = null;
  try{
    const seasons = await xrankSeasonList(flow.div);
    if(flow.seasonSpec?.type === "num") season = seasons.includes(flow.seasonSpec.n) ? flow.seasonSpec.n : seasons[0];
    else if(flow.seasonSpec?.type === "last") season = seasons[1] || seasons[0];
    else season = seasons[0];
  }catch(e){
    addMsg("assistant", `<div class="empty-state"><i class="fa-solid fa-trophy"></i><h3>Rankings unavailable</h3><p>The ranking index could not be reached (${esc(e.message)}).</p></div>`);
    rankFlow = null; return;
  }
  addMsg("assistant", `<div class="skeleton-card"><div class="sk sk-row"></div><div class="sk sk-row"></div></div>`);
  const skel = chat.querySelector(".msg.bot:last-child");
  try{
    const { edges } = await xrankFetch(flow.mode, flow.div, season);
    const hit = edges.find(n => n.rank === flow.rank);
    const modeLabel = (XRANK_MODES.find(m => m.key === flow.mode) || {}).label || flow.mode;
    const divLabel = (XRANK_DIVS.find(d => d.key === flow.div) || {}).label || flow.div;
    if(skel) skel.remove();
    if(!hit){
      addMsg("assistant", `<p>No player found at rank #${flow.rank} in ${esc(modeLabel)} (${esc(divLabel)}, season ${flow.div}-${season}). The archive may be incomplete for that season.</p>`);
    } else {
      addMsg("assistant", `<h3><i class="fa-solid fa-trophy" style="color:#f59e0b"></i> Rank #${hit.rank} — ${esc(modeLabel)}</h3><div class="rank-list">` +
        `<div class="rank-row"><span class="rank ${rankMedal(hit.rank)}">${hit.rank}</span>` +
        `${hit.weapon?.image?.url?`<img class="rank-weapon" src="${hit.weapon.image.url}" alt="" loading="lazy"/>`:""}` +
        `<span class="rank-name">${esc(hit.name)}<small>${esc(hit.weapon?.name||"")}</small></span>` +
        `<span class="rank-xp">${esc(String(hit.xPower))} XP</span></div></div>` +
        `<p class="rot-small">${esc(divLabel)} division • season ${flow.div}-${season} • via splatoon3.ink X-rank archive</p>`);
    }
  }catch(e){
    if(skel) skel.remove();
    addMsg("assistant", `<p>Could not load that ranking (${esc(e.message)}).</p>`);
  }
  rankFlow = null;
}
function handleRankFlowText(text){
  // returns true if the text was consumed by an in-progress flow
  if(!rankFlow) return false;
  const t = text.toLowerCase().trim();
  if(/^(cancel|never ?mind|stop|forget it)$/.test(t)){ rankFlow = null; addMsg("assistant", `<p>Cancelled. What else can I look up?</p>`); return true; }
  const m = detectMode(text); if(m && !rankFlow.mode) rankFlow.mode = m;
  const d = detectDiv(text); if(d && !rankFlow.div) rankFlow.div = d;
  const s = detectSeasonSpec(text); if(s) rankFlow.seasonSpec = s;
  const num = t.match(/^#?([1-9]\d{0,2})$/); if(num) rankFlow.rank = parseInt(num[1],10);
  continueRankFlow();
  return true;
}

async function handleQuery(text){
  const q = text.toLowerCase();
  if(handleRankFlowText(text)) return;
  const st = smallTalk(text);
  if(st){ addMsg("assistant", st); return; }
  const sendouUser = q.match(/sendou\s+(?:user|player|profile)\s+(.+)/);
  if(sendouUser){ await answerSendouUser(sendouUser[1].replace(/[?.!]+$/,"")); return; }
  if(/sendou\s*(api|token|key)/.test(q) || q.trim() === "sendou"){ addMsg("assistant", `<p>sendou.ink's public API needs a personal token (free at <a href="https://sendou.ink/api" target="_blank" rel="noopener">sendou.ink/api</a>). Save it in Settings, then try “sendou user …”. Build pages need no token.</p>`); return; }
  if(/build|kit|gear|abilities|ability|loadout/.test(q)){ await answerBuild(text); return; }
  const rankN = wantsRankLookup(q);
  if(rankN){
    rankFlow = { rank: rankN,
      seasonSpec: detectSeasonSpec(q) || { type: "current" },
      mode: detectMode(q), div: detectDiv(q) };
    continueRankFlow();
    return;
  }
  const seasonMatch = q.match(/season\s*[pa]?-?(\d{1,2})/);
  if(/previous|last season|older|past seasons/.test(q) || seasonMatch || /takoroka|tentatek/.test(q)){
    let season = seasonMatch ? parseInt(seasonMatch[1],10) : null;
    const div = /tentatek/.test(q) ? "a" : "p";
    if(!season){ try{ const l = await xrankSeasonList(div); season = /previous|last season|older|past/.test(q) ? (l[1] || l[0]) : l[0]; }catch{} }
    const mk = (XRANK_MODES.find(m => q.includes(m.label.toLowerCase())) || XRANK_MODES[0]).key;
    await answerTop500(mk, div, season); return;
  }
  if(/top ?500|leaderboard/.test(q) || (/x ?power/.test(q) && /top|rank|leader/.test(q))){ await answerTop500(); return; }
  if(q.includes("x battle") || (q.includes("current") && q.includes("x"))){ await answerRotation("x"); return; }
  if(q.includes("turf")){ await answerRotation("turf"); return; }
  if(q.includes("anarchy")){ await answerRotation("anarchy"); return; }
  if(q.includes("event") || q.includes("challenge")){ await answerRotation("event"); return; }
  if(q.includes("salmon") || q.includes("grizzco")){ await answerRotation("salmon"); return; }
  if(q.includes("rotation") || q.includes("schedule")){ showView("rotations"); return; }
  if(/help|what can you|^hi$|^hello$/.test(q)){
    addMsg("assistant", `<h3>Capabilities</h3><p>Dataset: <b>${esc(currentGame)}</b> (<code>data/${esc(currentGame)}/</code>).</p><p>Supported: live rotations, weapons and kits, maps, modes, story records, Top 500 (current and previous seasons, both divisions), single-rank lookup (try “who was #247 last season?”), sendou.ink builds and user lookup. Open Settings for themes and your sendou.ink token.</p>`);
    return;
  }
  if(q.includes("list all weapons") || q.trim()==="weapons"){
    addMsg("assistant", `<h3>${esc(currentGame)} weapons (${localData.weapons.length})</h3><div class="card-grid">`+
      localData.weapons.slice(0,18).map(w=>`<div class="mini-card"><b>${esc(w.name)}</b><br/><span class="tag">${esc(w.class)}</span><br/>${esc(w.sub)} / ${esc(w.special)}</div>`).join("")+`</div>`);
    return;
  }
  if(q.includes("list all maps") || q.trim()==="maps"){
    addMsg("assistant", `<h3>${esc(currentGame)} maps</h3><p>`+localData.maps.map(m=>`• <b>${esc(m.name)}</b> — ${esc(m.description)}`).join("<br/>")+`</p>`);
    return;
  }
  if(q.includes("list all modes") || q.trim()==="modes"){
    addMsg("assistant", `<h3>${esc(currentGame)} modes</h3><p>`+localData.modes.map(m=>`• <b>${esc(m.name)}</b> — ${esc(m.description)}`).join("<br/>")+`</p>`);
    return;
  }
  if(q.includes("story") || q.includes("log") || q.includes("lore")){
    addMsg("assistant", `<h3>${esc(currentGame)} records</h3>`+localData.story_logs.slice(0,4).map(s=>`<p><b>${esc(s.title)}</b> <span class="tag">${esc(s.location)}</span><br/>${esc(s.text_summary)}</p>`).join(""));
    return;
  }
  // mined game data intents (Splatoon 3)
  const abilityHit = (localData.abilities||[]).find(a => a.name && q.includes(a.name.toLowerCase()));
  if(abilityHit && /what|do|does|ability|abilities|gear|effect|mean/.test(q)){
    const abIcon = abilityHit.icon ? `<img class="ability-icon lg" src="${abilityHit.icon}" alt="" loading="lazy" onerror="this.remove()"/> ` : "";
    addMsg("assistant", `<h3>${abIcon}${esc(abilityHit.name)}</h3><p>${esc(abilityHit.description || "No description available.")}</p>`);
    return;
  }
  if(/abilities|all abilities/.test(q) && (localData.abilities||[]).length){
    addMsg("assistant", `<h3>Gear abilities (${localData.abilities.length})</h3><p>` + localData.abilities.map(a=>`• <b>${esc(a.name)}</b>`).join("<br/>") + `</p><p>Ask “what does … do?” for details.</p>`);
    return;
  }
  const salHit = (localData.salmonids||[]).find(s => (s.name && q.includes(s.name.toLowerCase())) || (s.type && q.includes(s.type.toLowerCase())));
  if(salHit){
    addMsg("assistant", `<h3><i class="fa-solid fa-fish" style="color:#fb7185"></i> ${esc(salHit.name)}</h3><div class="mini-card"><span class="tag">${esc(salHit.category||"Salmonid")}</span><br/>Golden eggs on kill: <b>${esc(String(salHit.golden_eggs_on_kill ?? "?"))}</b>${salHit.golden_eggs_on_hit?` • on hit: ${esc(String(salHit.golden_eggs_on_hit))}`:""}</div>`);
    return;
  }
  if(/salmonids|salmonid|bosses|all bosses|co-op enemies|coop enemies/.test(q) && (localData.salmonids||[]).length){
    addMsg("assistant", `<h3>Salmonids (${localData.salmonids.length})</h3><p>` + localData.salmonids.map(s=>`• <b>${esc(s.name)}</b> <span class="tag">${esc(s.category||"")}</span>`).join("<br/>") + `</p>`);
    return;
  }
  if(/gear|brand|clothes|shoes|headgear|abilities\?/.test(q) && !/build/.test(q)){
    const toks = q.split(/\s+/).filter(t => t.length > 2 && !["what","which","with","gear","brand","best","the","for","has","have","list","all","show"].includes(t));
    const scored = (localData.gear||[]).map(g => {
      const hay = `${g.name} ${g.brand} ${g.ability} ${g.slot}`.toLowerCase();
      return { g, s: toks.filter(t => hay.includes(t)).length };
    }).filter(x => x.s > 0).sort((a,b)=>b.s-a.s).slice(0,6);
    if(scored.length){
      addMsg("assistant", `<h3><i class="fa-solid fa-shirt" style="color:var(--accent)"></i> Matching gear (${scored.length})</h3><div class="gear-grid">` + scored.map(({g})=>gearCard(g)).join("") + `</div>`);
      return;
    }
    if(/how many|count|list all gear/.test(q)){
      addMsg("assistant", `<p>${(localData.gear||[]).length} gear items indexed (head, clothes, shoes) with brand, main ability, and price. Try “gear with Ninja Squid” or “Krak-On gear”.</p>`);
      return;
    }
  }
  if(/special point|shop price|cost|unlock rank|what rank|range of|how much/.test(q)){
    const w = findWeapon(text);
    const st = w ? statForWeapon(w.name) : null;
    if(st){
      addMsg("assistant", `<h3>${esc(st.name)} — game data</h3><div class="mini-card"><b>Kit:</b> ${esc(st.sub)} / ${esc(st.special)}<br/><b>Special points:</b> ${esc(String(st.special_points ?? "?"))}<br/><b>Price:</b> ${esc(String(st.price ?? "?"))} cash<br/><b>Unlock:</b> rank ${esc(String(st.unlock_rank ?? "?"))}<br/><b>Range:</b> ${esc(String(st.range ?? "?"))}</div>`);
      return;
    }
  }
  const hits = searchLocal(q);
  if(hits.length===0){
    addMsg("assistant", `<p>No matching records in <code>data/${esc(currentGame)}/</code> for “${esc(text)}”. Try “Current X Battle rotation”, “best build for …”, “Top 500”, or a weapon or map name.</p>`);
    return;
  }
  let html = `<h3>Results (${esc(currentGame)})</h3>`;
  hits.slice(0,4).forEach(({cat,item})=>{
    if(cat==="weapons"){ const st = statForWeapon(item.name); html += `<div class="mini-card"><b>${esc(item.name)}</b> <span class="tag">${esc(item.class)}</span><br/>Sub: ${esc(st?.sub || item.sub)} • Special: ${esc(st?.special || item.special)}${statLine(st)}<br/>${esc(item.notes||"")}</div>`; }
    else if(cat==="weapon_stats") html += `<div class="mini-card"><b>${esc(item.name)}</b><span class="tag">game data</span>${statLine(item)}</div>`;
    else if(cat==="maps") html += `<div class="mini-card"><b>${esc(item.name)}</b><br/>${esc(item.description)}</div>`;
    else if(cat==="modes") html += `<div class="mini-card"><b>${esc(item.name)}</b><br/>${esc(item.description)}</div>`;
    else if(cat==="salmonids") html += `<div class="mini-card"><b>${esc(item.name)}</b> <span class="tag">${esc(item.category||"Salmonid")}</span><br/>Golden eggs on kill: ${esc(String(item.golden_eggs_on_kill ?? "?"))}</div>`;
    else if(cat==="gear") html += gearCard(item);
    else if(cat==="abilities") html += `<div class="mini-card"><b>${esc(item.name)}</b><br/>${esc(item.description||"")}</div>`;
    else html += `<div class="mini-card"><b>${esc(item.title)}</b><br/>${esc(item.text_summary)}</div>`;
  });
  addMsg("assistant", html);
}

/* ---------- wiring (safe: no-ops if an element is missing) ---------- */
on("nav-rotations", "click", () => showView("rotations"));
on("nav-recents", "click", () => showView("recents"));
on("nav-settings", "click", () => showView("settings"));
on("open-about", "click", () => showView("about"));
on("about-back", "click", () => showView("settings"));
on("setting-theme", "change", () => { const s = el("setting-theme"); settings.theme = s ? s.value : "dark"; saveSettings(); applySettings(); });
document.querySelectorAll("[data-accent-pick]").forEach(b => b.addEventListener("click", () => { settings.accent = b.dataset.accentPick; saveSettings(); applySettings(); }));
on("setting-save-token", "click", () => { const t = el("setting-sendou-token"); settings.sendouToken = t ? t.value.trim() : ""; saveSettings(); applySettings(); const ok = el("setting-saved"); if(ok){ ok.textContent = "Saved."; setTimeout(()=>{ ok.textContent=""; }, 2000); } });
on("setting-clear-token", "click", () => { settings.sendouToken = ""; saveSettings(); applySettings(); });
on("setting-wipe", "click", () => { try{ localStorage.clear(); }catch{} conversations = []; currentId = null; newConversation(); showView("chat"); });
on("setting-tour", "click", () => { maybeTour(true); });
on("nav-new", "click", () => { newConversation(); showView("chat"); });
on("collapse-btn", "click", () => document.body.classList.toggle("collapsed"));
on("brand", "click", () => {
  if(document.body.classList.contains("collapsed")) document.body.classList.remove("collapsed");
  else showView("chat");
});
on("clear-chats", "click", () => { clearConversations(); });
if(form) form.addEventListener("submit", e=>{
  e.preventDefault();
  if(!input) return;
  const t = input.value.trim();
  if(!t) return;
  showView("chat");
  addMsg("user", esc(t));
  input.value = "";
  handleQuery(t);
});
document.querySelectorAll("#suggestions [data-q]").forEach(b=>b.addEventListener("click", ()=>{
  showView("chat");
  addMsg("user", esc(b.dataset.q));
  handleQuery(b.dataset.q);
}));
document.querySelectorAll(".game-toggle button").forEach(b=>b.addEventListener("click", async ()=>{
  await loadGame(b.dataset.game);
  const c = currentConvo(); if(c){ c.game = b.dataset.game; persist(); }
  if(el("view-chat") && !el("view-chat").hidden) addMsg("assistant", `Dataset changed to <b>${esc(b.dataset.game)}</b>. Subsequent queries will use <code>data/${esc(b.dataset.game)}/</code>.`);
}));

/* ---------- first-run tour (steps editable in tour.json) ---------- */
const TOUR_KEY = "splatgpt.tourSeen.v1";
async function loadTourSteps(){
  const res = await fetch("tour.json");
  if(!res.ok) throw new Error("tour.json unavailable");
  const steps = await res.json();
  return (Array.isArray(steps) ? steps : []).filter(s => {
    if(!s.selector) return false;
    const n = document.querySelector(s.selector);
    return !!(n && n.offsetParent !== null);
  });
}
function endTour(){
  document.querySelectorAll(".tour-overlay,.tour-tip").forEach(n => n.remove());
  document.querySelectorAll(".tour-highlight").forEach(n => n.classList.remove("tour-highlight"));
  try{ localStorage.setItem(TOUR_KEY, "1"); }catch{}
}
function runTour(steps){
  endTourSilent();
  showView("chat");
  let i = 0;
  const overlay = document.createElement("div");
  overlay.className = "tour-overlay";
  overlay.addEventListener("click", endTour);
  const tip = document.createElement("div");
  tip.className = "tour-tip";
  document.body.append(overlay, tip);
  const paint = () => {
    document.querySelectorAll(".tour-highlight").forEach(n => n.classList.remove("tour-highlight"));
    const s = steps[i];
    const target = document.querySelector(s.selector);
    if(target){
      target.classList.add("tour-highlight");
      try{ target.scrollIntoView({ block: "nearest", behavior: "smooth" }); }catch{}
    }
    tip.innerHTML = `<div class="tour-step">${i+1} / ${steps.length}</div><h3>${esc(s.title || "")}</h3><p>${esc(s.text || "")}</p><div class="tour-actions"><button data-tour="skip">Skip</button><span class="tour-spacer"></span>${i>0?`<button data-tour="back">Back</button>`:""}<button data-tour="next" class="primary">${i===steps.length-1?"Done":"Next"}</button></div>`;
    tip.querySelector('[data-tour="skip"]').addEventListener("click", endTour);
    const back = tip.querySelector('[data-tour="back"]');
    if(back) back.addEventListener("click", () => { i--; paint(); });
    tip.querySelector('[data-tour="next"]').addEventListener("click", () => { i++; if(i >= steps.length) endTour(); else paint(); });
    requestAnimationFrame(() => {
      const r = target ? target.getBoundingClientRect() : null;
      tip.style.visibility = "hidden";
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = Math.min(Math.max(16, (window.innerWidth - tw) / 2), window.innerWidth - tw - 16);
      let y;
      if(r){
        const below = r.bottom + 14, above = r.top - th - 14;
        y = (below + th < window.innerHeight - 8) ? below : Math.max(8, above);
        x = Math.min(Math.max(8, r.left), window.innerWidth - tw - 8);
      } else {
        y = window.innerHeight - th - 24;
      }
      tip.style.left = x + "px"; tip.style.top = Math.max(8, y) + "px";
      tip.style.visibility = "";
    });
  };
  paint();
}
function endTourSilent(){
  document.querySelectorAll(".tour-overlay,.tour-tip").forEach(n => n.remove());
  document.querySelectorAll(".tour-highlight").forEach(n => n.classList.remove("tour-highlight"));
}
async function maybeTour(force=false){
  try{ if(!force && localStorage.getItem(TOUR_KEY)) return; }catch{}
  let steps;
  try{ steps = await loadTourSteps(); }catch{ return; }
  if(!steps.length) return;
  if(force) endTourSilent();
  runTour(steps);
}

async function boot(){
  if(!chat || !form){ console.error("SplatGPT: required chat elements missing"); return; }
  applySettings();
  await loadGame(currentGame);
  try{ await getSchedules(); }catch{ setLive(false, "splatoon3.ink: unavailable"); }
  try{
    if(conversations.length > 0 && conversations[0].messages.length > 0){
      currentId = conversations[0].id;
      chat.innerHTML = "";
      currentConvo().messages.forEach(m => addMsg(m.role, m.html, true));
    } else {
      newConversation();
    }
  }catch(e){ console.warn(e); try{ newConversation(); }catch{} }
  showView("chat");
  setTimeout(() => maybeTour(), 600);
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
