/* SplatGPT - static knowledge assistant
 * Local data: data/Splatoon1|2|3/*.json
 * Live rotations: splatoon3.ink | Rankings: data/live/top500.json (splatnet3-scraper snapshot)
 */
const APP_VERSION = "2.20";
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
function showView(name, liveSec=null){
  const vc = el("view-chat"), vn = el("view-chats"), vs = el("view-settings"), va = el("view-about"), vl = el("view-live"), vp = el("view-player"), vno = el("view-notifs"), vsc = el("view-schedule"), vg = el("view-goals"), vgn = el("view-goal-new"), vgd = el("view-goal-detail"), vh = el("view-home"), vme = el("view-me");
  if(vc) vc.hidden = name !== "chat";
  if(vh) vh.hidden = name !== "home";
  if(vme) vme.hidden = name !== "me";
  if(vn) vn.hidden = name !== "chats";
  if(vs) vs.hidden = name !== "settings";
  if(va) va.hidden = name !== "about";
  if(vl) vl.hidden = name !== "live";
  if(vp) vp.hidden = name !== "player";
  if(vno) vno.hidden = name !== "notifs";
  if(vsc) vsc.hidden = name !== "schedule";
  if(vg) vg.hidden = name !== "goals";
  if(vgn) vgn.hidden = name !== "goal-new";
  if(vgd) vgd.hidden = name !== "goal-detail";
  el("nav-me")?.classList.toggle("active", name === "me");
  el("pill-me")?.classList.toggle("active", name === "me");
  el("nav-chats")?.classList.toggle("active", name === "chats");
  el("nav-settings")?.classList.toggle("active", name === "settings" || name === "about");
  el("nav-live")?.classList.toggle("active", name === "live");
  el("nav-goals")?.classList.toggle("active", name === "goals");
  el("nav-notifs")?.classList.toggle("active", name === "notifs");
  el("pill-chats")?.classList.toggle("active", name === "chats" || name === "chat");
  el("pill-settings")?.classList.toggle("active", name === "settings" || name === "about");
  el("pill-live")?.classList.toggle("active", name === "live");
  el("pill-goals")?.classList.toggle("active", name === "goals");
  el("pill-notifs")?.classList.toggle("active", name === "notifs");
  const gt = document.querySelector(".game-toggle");
  if(gt) gt.hidden = name !== "chat";
  const st = el("topbar-subtabs");
  if(st) st.hidden = name !== "live";
  const rf = el("refresh-live");
  if(rf) rf.hidden = name !== "live";
  const tn = el("topbar-new");
  if(tn) tn.hidden = name !== "chat";
  if(viewTitle) viewTitle.textContent = name === "chat" ? "Chat" : name === "home" ? "Home" : name === "me" ? "My player" : name === "chats" ? "Chats" : name === "about" ? "About" : name === "live" ? "Live" : name === "player" ? "Player" : name === "notifs" ? "Notifications" : name === "schedule" ? (viewTitle.textContent || "Schedule") : name === "goals" ? "Goals" : name === "goal-new" ? "New goal" : name === "goal-detail" ? (viewTitle.textContent || "Goal") : "Settings";
  if(name === "chats") renderChats();
  if(name === "home") renderHome();
  if(name === "me") renderMeCard();
  if(name === "settings"){ renderProfile(); syncMeFields(); syncNavPicks(); syncPlayerFields(); syncBuildsFields(); }
  if(name === "live") showLiveSection(liveSec || liveSection);
  if(name === "notifs") renderNotifs();
  if(name === "goals") renderGoals();
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
  try{ profile.chats = (profile.chats || 0) + 1; saveProfile(); }catch{}
  if(chat) chat.innerHTML = "";
  addMsg("assistant", welcomeHTML(), true);
  updateChatCount();
}
function welcomeHTML(){
  const f = profile.facts || {};
  const bits = [];
  if(f.weapon) bits.push(`your main <b>${esc(f.weapon)}</b>`);
  if(f.mode) bits.push(`<b>${esc(f.mode)}</b>`);
  if(f.div) bits.push(`the ${esc(f.div)} division`);
  const known = bits.length
    ? `<p>Keeping in mind ${bits.join(", ")} — I'll build around those unless you say otherwise.</p>`
    : `<p>Tell me a little about yourself (say <b>“my name is…”</b>, <b>“I main…”</b>, <b>“my favourite mode is…”</b>) and I'll remember it between chats to tailor answers.</p>`;
  const tail = brevityHint() ? " Keep answers short — I'll be to the point." : "";
  return `<h3>Welcome to SplatGPT${youName() ? ", " + esc(youName()) : ""}!</h3>` +
    `<p>Ask me anything about <b>${esc(currentGame)}</b>! Use the game selector above to switch data between Splatoon 1, 2, and 3.${esc(tail)}</p>` +
    known +
    `<p class="rot-small">All chats are listed under <b>Chats</b> in the navigation.</p>`;
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
  rehydrateChat();
  showView("chat");
  updateChatCount();
}
function deleteConversation(id){
  conversations = conversations.filter(c => c.id !== id);
  if(currentId === id) currentId = null;
  persist();
  renderChats();
  updateChatCount();
}
function clearConversations(){
  conversations = [];
  currentId = null;
  persist();
  renderChats();
  updateChatCount();
}
function updateChatCount(){
  const n = conversations.length;
  for(const id of ["nav-chat-count"]){
    const b = el(id);
    if(!b) continue;
    b.textContent = n > 1 ? String(n) : "";
    b.hidden = n < 2;
  }
}
function renderChats(){
  const list = el("recents-list");
  if(!list) return;
  const count = el("recents-count");
  if(count) count.textContent = conversations.length ? `${conversations.length} saved` : "";
  updateChatCount();
  if(conversations.length === 0){
    list.innerHTML = `<div class="empty-state"><i class="fa-regular fa-comments"></i><h3>No chats yet</h3><p>Hit <b>New chat</b> to start one.</p></div>`;
    return;
  }
  list.innerHTML = "";
  conversations.forEach(c => {
    const row = document.createElement("div");
    row.className = "recent-item";
    const isCur = c.id === currentId;
    row.innerHTML = `<button class="recent-open${isCur ? " current" : ""}"><i class="fa-regular fa-message"></i><span class="recent-title">${esc(c.title || "New chat")}</span><span class="meta">${isCur ? `<span class="tag">open</span> ` : ""}${esc(c.game || "")} · ${esc(new Date(c.createdAt).toLocaleString())} · ${(c.messages||[]).length} msg</span></button><button class="recent-del" title="Delete chat"><i class="fa-solid fa-trash-can"></i></button>`;
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
  let lastErr = null;
  for(let attempt = 0; attempt < 2; attempt++){
    try{
      if(attempt > 0) await new Promise(r => setTimeout(r, 1200));
      const res = await fetch("https://splatoon3.ink/data/schedules.json");
      if(!res.ok) throw new Error("schedules request failed");
      schedulesCache = await res.json();
      schedulesAt = Date.now();
      setLive(true, "splatoon3.ink: live");
      return schedulesCache;
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error("schedules request failed");
}
function setLive(){
  // status dot removed from UI; connectivity failures surface inline instead
}
function currentNode(nodes){
  const now = new Date();
  return nodes.find(n => new Date(n.startTime) <= now && now < new Date(n.endTime)) || nodes[0];
}
function currentIndex(nodes){
  const now = new Date();
  const i = nodes.findIndex(n => new Date(n.startTime) <= now && now < new Date(n.endTime));
  return i >= 0 ? i : 0;
}
function upcomingNodes(nodes, count=3){
  const out = [];
  for(let i = currentIndex(nodes); i < nodes.length && out.length < count; i++) out.push(nodes[i]);
  return out;
}
function fmtTime(iso){
  const t = new Date(iso);
  let h = t.getHours(), m = String(t.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
function rotationWidgetHTML({label, rule, ruleCode, stages, startTime, endTime, slot=0, sched=null}){
  const rm = ruleMeta(ruleCode, rule);
  const cat = Object.keys(CATEGORY_META).find(k => label.startsWith(k)) || "";
  const cm = CATEGORY_META[cat] || { icon: "fa-rotate", color: "#64748b" };
  // Turf War's rule IS "Turf War" — repeating it in the pill is redundant
  const pillText = (rm.label === label) ? (label === "Turf War" ? "Regular Battle" : rm.label) : rm.label;
  const slotTxt = slot === 0 ? "Live now" : slot === 1 ? `Next · ${fmtTime(startTime)}` : `Upcoming · ${fmtTime(startTime)}`;
  const stageHtml = stages.slice(0,2).map(s=>{
    const img = s.image?.url || "";
    return `<div class="rot-map">${img?`<img src="${img}" alt="${esc(s.name)}" loading="lazy"/>`:""}<span>${esc(s.name)}</span></div>`;
  }).join("");
  return `
  <div class="rot-widget${slot === 0 ? " live" : " upcoming"}" data-start="${startTime}" data-end="${endTime}">
    <div class="rot-kicker">${esc(slotTxt)}</div>
    <div class="rot-header"><span class="rot-cat">${modeIcon(cm)} ${esc(label)}</span><span class="mode-pill">${modeIcon(rm)} ${esc(pillText)}</span></div>
    <div class="rot-maps">${stageHtml}</div>
    <div class="rot-timer"><span class="elapsed">Loading…</span></div>
    <div class="rot-bar" title=""><div></div></div>
    ${(slot === 0 && sched) ? `<button class="rot-more" data-schedule="${esc(sched)}">Show all rotations <i class="fa-solid fa-arrow-right"></i></button>` : ""}
  </div>`;
}
/* ---------- full day-ahead schedule for one category (up to 10 forward) ---------- */
const SCHED_TITLES = {
  x: "X Battles", regular: "Turf War", bankara0: "Anarchy Battle (Series)",
  bankara1: "Anarchy Battle (Open)", event: "Event / Challenge",
};
function schedSetting(kind, node){
  if(kind === "x") return node.xMatchSetting;
  if(kind === "regular") return node.regularMatchSetting;
  if(kind === "bankara0") return (node.bankaraMatchSettings || [])[0];
  if(kind === "bankara1") return (node.bankaraMatchSettings || [])[1];
  return node.eventMatchSetting || node.challengeMatchSetting;
}
function schedNodes(kind, data){
  if(kind === "x") return data.xSchedules.nodes;
  if(kind === "regular") return data.regularSchedules.nodes;
  if(kind === "bankara0" || kind === "bankara1") return data.bankaraSchedules.nodes;
  return data.eventSchedules.nodes;
}
async function openSchedule(kind){
  const box = el("schedule-detail");
  const title = SCHED_TITLES[kind] || "Rotations";
  if(viewTitle) viewTitle.textContent = title;
  showView("schedule");
  if(!box) return;
  box.innerHTML = `<div class="skeleton-card"><div class="sk sk-title"></div><div class="sk sk-maps"></div><div class="sk sk-bar"></div></div>`.repeat(2);
  try{
    const data = await getSchedules();
    const nodes = schedNodes(kind, data.data).filter(n => n.startTime && n.endTime);
    const upcoming = upcomingNodes(nodes, 10);
    if(!upcoming.length) throw new Error("no rotations found");
    const label = kind.startsWith("bankara") ? `Anarchy Battle (${kind === "bankara0" ? "Series" : "Open"})`
      : kind === "x" ? "X Battles" : kind === "regular" ? "Turf War" : "Event / Challenge";
    const rows = upcoming.map((node, i) => {
      const s = schedSetting(kind, node);
      if(!s) return "";
      const rm = ruleMeta(s.vsRule?.rule, s.vsRule?.name || "Event");
      const pillText = (rm.label === label && label === "Turf War") ? "Regular Battle" : rm.label;
      const stages = (s.vsStages || []).slice(0, 2);
      const thumbs = stages.map(g =>
        (g.image?.url ? `<img class="sched-thumb" src="${g.image.url}" alt="" loading="lazy"/>` : "") +
        `<span>${esc(g.name)}</span>`).join(`<span class="sched-vs">+</span>`);
      const slotTxt = i === 0 ? "Live now" : i === 1 ? "Next" : "Upcoming";
      return `<div class="sched-row${i === 0 ? " live" : ""}">` +
        `<span class="sched-time">${esc(fmtTime(node.startTime))} – ${esc(fmtTime(node.endTime))}<small>${esc(slotTxt)}</small></span>` +
        `<span class="sched-mode">${modeIcon(rm)} ${esc(pillText)}</span>` +
        `<span class="sched-stages">${thumbs}</span>` +
        `<span class="sched-status" data-cd-start="${node.startTime}" data-cd-end="${node.endTime}">…</span></div>`;
    }).join("");
    box.innerHTML = `<p class="muted">${upcoming.length} rotations · ${esc(label)}</p><div class="sched-table">${rows}</div>`;
    tickWidgets();
  }catch(e){
    box.innerHTML = `<div class="empty-state"><i class="fa-solid fa-arrows-rotate"></i><h3>Schedule unavailable</h3><p>${esc(e.message)}</p></div>`;
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-schedule]");
  if(!b) return;
  openSchedule(b.dataset.schedule);
});
document.addEventListener("click", e => {
  const go = e.target.closest("[data-goal-open]");
  if(go){ openGoal(go.dataset.goalOpen); return; }
  if(!e.target.closest("[data-goal-live]")) return;
  showView("live", "rotations");
});
function tickWidgets(){
  document.querySelectorAll(".rot-widget").forEach(w=>{
    const start = new Date(w.dataset.start).getTime();
    const end = new Date(w.dataset.end).getTime();
    const now = Date.now();
    const total = end - start;
    const bar = w.querySelector(".rot-bar > div");
    const outer = w.querySelector(".rot-bar");
    const elapsed = w.querySelector(".elapsed");
    if(now < start){
      if(bar) bar.style.width = "0%";
      if(elapsed) elapsed.textContent = "Starts in " + fmtCountdown(start - now);
      if(outer) outer.title = "Rotation begins at " + fmtTime(w.dataset.start);
      return;
    }
    const done = Math.min(Math.max(now - start, 0), total);
    const pct = total>0 ? (done/total*100) : 0;
    if(bar) bar.style.width = pct.toFixed(2) + "%";
    if(elapsed) elapsed.textContent = fmtCountdown(done) + " elapsed";
    if(outer) outer.title = "Time until rotation ends: " + fmtCountdown(end - now);
  });
  document.querySelectorAll("[data-cd-start]").forEach(cd => {
    const start = new Date(cd.dataset.cdStart).getTime();
    const end = new Date(cd.dataset.cdEnd).getTime();
    const now = Date.now();
    cd.textContent = now < start ? "in " + fmtCountdown(start - now) : fmtCountdown(now - start) + " in";
  });
}
setInterval(tickWidgets, 1000);

/* ---------- rotations page: current + next + upcoming (no chat) ---------- */
async function renderRotationsPage(){
  const grid = el("rotations-grid");
  if(!grid) return;
  grid.innerHTML = `<div class="skeleton-card"><div class="sk sk-title"></div><div class="sk sk-maps"></div><div class="sk sk-bar"></div></div>`.repeat(4);
  try{
    const data = await getSchedules(true);
    const d = data.data;
    const cards = [];
    // grid shows the 4 live rotations only — forward view lives behind "Show all rotations"
    const x = currentNode(d.xSchedules.nodes);
    {
      const s = x.xMatchSetting;
      cards.push(rotationWidgetHTML({label:"X Battles", rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:x.startTime, endTime:x.endTime, slot:0, sched:"x"}));
    }
    const r = currentNode(d.regularSchedules.nodes);
    {
      const s = r.regularMatchSetting;
      cards.push(rotationWidgetHTML({label:"Turf War", rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:r.startTime, endTime:r.endTime, slot:0, sched:"regular"}));
    }
    const b = currentNode(d.bankaraSchedules.nodes);
    (b.bankaraMatchSettings||[]).forEach((s,j)=> cards.push(rotationWidgetHTML({label:`Anarchy Battle (${j===0?"Series":"Open"})`, rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:b.startTime, endTime:b.endTime, slot:0, sched:j===0?"bankara0":"bankara1"})));
    try{
      const ev = currentNode(d.eventSchedules.nodes);
      const s = ev.eventMatchSetting || ev.challengeMatchSetting;
      if(s) cards.push(rotationWidgetHTML({label:"Event / Challenge", rule:s.vsRule?.name||"Event", ruleCode:s.vsRule?.rule, stages:s.vsStages, startTime:ev.startTime, endTime:ev.endTime, slot:0, sched:"event"}));
    }catch{}
    grid.innerHTML = cards.join("");
    tickWidgets();
  }catch(e){
    if(grid) grid.innerHTML = `<p class="muted">Rotation data is currently unavailable (${esc(e.message)}). Please try again later.</p>`;
    setLive(false, "splatoon3.ink: unavailable");
  }
}
/* ---------- Live tab: Rotations / Top 500 / Salmon Run ---------- */
let liveSection = "rotations";
const LIVE_SECTIONS = ["rotations", "top500", "salmon", "builds"];
function showLiveSection(sec){
  liveSection = sec;
  document.querySelectorAll("[data-live-sec-btn]").forEach(b => b.classList.toggle("active", b.dataset.liveSecBtn === sec));
  LIVE_SECTIONS.forEach(s => { const n = el(`live-sec-${s}`); if(n) n.hidden = s !== sec; });
  if(sec === "rotations") renderRotationsPage();
  else if(sec === "top500") renderLiveTop500();
  else if(sec === "salmon") renderLiveSalmon();
  else if(sec === "builds") renderLiveBuilds();
}
async function renderLiveSalmon(){
  const grid = el("live-salmon-grid");
  if(!grid) return;
  grid.innerHTML = `<div class="skeleton-card"><div class="sk sk-title"></div><div class="sk sk-maps"></div><div class="sk sk-bar"></div></div>`;
  try{
    const data = await getSchedules(true);
    const nodes = data.data.coopGroupingSchedule.regularSchedules.nodes;
    const now = new Date();
    const cur = nodes.find(n => new Date(n.startTime) <= now && now < new Date(n.endTime)) || nodes[0];
    const next = nodes.find(n => new Date(n.startTime) > now);
    const cards = [];
    const setting = cur.setting;
    const weapons = (setting.weapons||[]).map(w=>esc(w.name)).join(", ");
    cards.push(`<div><div class="live-subhead">Current shift</div>` +
      rotationWidgetHTML({label:"Salmon Run", rule:"Grizzco Shift", stages:[{name:setting.coopStage?.name||"Stage", image:setting.coopStage?.image},{name:setting.boss?.name||"King Salmonid", image:{url:""}}], startTime:cur.startTime, endTime:cur.endTime}) +
      `<p class="muted">Supplied weapons: ${weapons||"Grizzco random"}</p></div>`);
    if(next){
      const ns = next.setting;
      const nweapons = (ns.weapons||[]).map(w=>esc(w.name)).join(", ");
      cards.push(`<div><div class="live-subhead">Next shift · starts in ${fmtCountdown(new Date(next.startTime).getTime() - Date.now())}</div>` +
        rotationWidgetHTML({label:"Salmon Run", rule:"Grizzco Shift", stages:[{name:ns.coopStage?.name||"Stage", image:ns.coopStage?.image},{name:ns.boss?.name||"King Salmonid", image:{url:""}}], startTime:next.startTime, endTime:next.endTime}) +
        `<p class="muted">Supplied weapons: ${nweapons||"Grizzco random"}</p></div>`);
    }
    grid.innerHTML = cards.join("");
    tickWidgets();
  }catch(e){
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-fish"></i><h3>Shift unavailable</h3><p>${esc(e.message)}</p></div>`;
  }
}
function renderLiveTop500(){
  const box = el("live-top500-box");
  if(!box) return;
  box.innerHTML = top500Shell();
  initTop500(box, livePrefs.mode, livePrefs.div, "live");
}
function refreshLiveActive(){
  if(liveSection === "rotations") renderRotationsPage(true);
  else if(liveSection === "top500") renderLiveTop500();
  else if(liveSection === "salmon") renderLiveSalmon();
  else if(liveSection === "builds") renderLiveBuilds(true);
}

/* ---------- Live → Builds browser: every kit for a weapon, loaded on demand ---------- */
const BB_PAGE = 24;
const bbState = { slug: null, cards: [], shown: BB_PAGE, query: "", sort: "popular", loadedFor: "" };
/* Weapons that actually have kits in the loaded snapshot.
   The snapshot's own slugs are authoritative: branded variants such as
   "neo-sploosh-o-matic" or "n-zap-89" don't map 1:1 onto our local weapon
   names, so deriving the list from localData silently dropped 22 of them. */
const BRAND_WORDS = /^(neo|custom|deco|tentatek|glamorz|forge|colorz|shock|steril|carbon)/i;
function bbPrettySlug(slug){
  const words = slug.split("-").filter(Boolean);
  if(!words.length) return slug;
  const cap = w => /^\d+$/.test(w) ? w : (w.length <= 3 && BRAND_WORDS.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1));
  return words.map(cap).join(" ");
}
let bbNameCache = null;
const BB_PREFIX = [
  ["neo", "Neo"], ["custom", "Custom"], ["tentatek", "Tentatek"], ["glamorz", "Glamorz"],
  ["forge", "Forge"], ["colorz", "Colorz"], ["clawz", "Clawz"], ["shock", "Shock"],
  ["steril", "Steril"], ["takoroka", "Takoroka"], ["mako", "Mako"], ["inkline", "Inkline"],
  ["krak-on", "Krak-On"], ["skal", "Skal"], ["forge", "Forge"], ["barrel", "Barrel"],
  ["carbon", "Carbon"], ["recon", "Recon"], ["coldline", "Coldline"], ["i-motion", "i-motion"],
  ["trizink", "Trizink"], ["inktank", "Inktank"], ["splash mob", "Splash Mob"],
];
const BB_ALIAS = {
  "splash-o-matic-gck-o": "Splash-o-matic (GCK-o)",
  "h-3-nozzlenose-vip-r": "H-3 Nozzlenose (VIP-R)",
};
function bbNameFor(slug, byslug){
  if(BB_ALIAS[slug]) return BB_ALIAS[slug];
  if(byslug[slug]) return byslug[slug];
  // "neo-sploosh-o-matic" -> "Neo" + the real local name for "sploosh-o-matic"
  for(const [prefix, label] of BB_PREFIX){
    if(!slug.startsWith(prefix + "-")) continue;
    const rest = slug.slice(prefix.length + 1);
    if(byslug[rest]) return `${label} ${byslug[rest]}`;
  }
  const d = slug.match(/^(.+)-deco$/);
  if(d && byslug[d[1]]) return `${byslug[d[1]]} Deco`;
  return null;
}
function bbDisplayNames(){
  if(bbNameCache) return bbNameCache;
  const byslug = {};
  for(const w of (localData.weapons || [])) byslug[sendouSlug(w.name)] = w.name;
  bbNameCache = {};
  for(const slug of Object.keys(buildsData?.weapons || {})){
    bbNameCache[slug] = bbNameFor(slug, byslug) || bbPrettySlug(slug);
  }
  return bbNameCache;
}
function bbAvailable(){
  const names = buildsData ? bbDisplayNames() : {};
  return Object.keys(names)
    .map(slug => ({ name: names[slug], slug, count: (buildsData.weapons[slug] || []).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
/* one search box: type a weapon, pick it from the list. Nothing else to learn. */
function bbRenderResults(){
  const box = el("bb-results");
  if(!box) return;
  const q = bbState.query.trim().toLowerCase();
  if(!q){ box.hidden = true; box.innerHTML = ""; return; }
  const hits = bbAvailable().filter(w => w.name.toLowerCase().includes(q)).slice(0, 8);
  box.hidden = !hits.length;
  box.innerHTML = hits.map(w => `<button data-bb-pick="${esc(w.slug)}"><i class="fa-solid fa-crosshairs"></i><span>${esc(w.name)}</span><em>${w.count.toLocaleString("en-US")}</em></button>`).join("");
}
function bbSelect(slug){
  const w = bbAvailable().find(x => x.slug === slug);
  if(!w) return;
  bbState.slug = slug;
  bbState.query = "";
  const s = el("bb-search");
  if(s) s.value = w.name;
  bbState.cards = buildsForWeapon(slug) || [];
  bbState.shown = BB_PAGE;
  track("builds"); trackDetail("weapons", w.name);
  paintBuilds();
}
function bbSortCards(cards){
  const d = c => (c.date ? Date.parse(c.date) : 0);
  const byEdits = (a, b) => (b.edits || 0) - (a.edits || 0) || d(b) - d(a);
  const out = cards.slice();
  if(bbState.sort === "new") out.sort((a, b) => d(b) - d(a));
  else if(bbState.sort === "name") out.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  else out.sort(byEdits);
  return out;
}
function bbSummaryHTML(cards, slug){
  if(!cards.length) return "";
  const n = cards.length;
  const top = popularAbilities(cards, 8);
  const mc = {};
  for(const c of cards) for(const m of c.modeCodes || c.modes || []) mc[m] = (mc[m] || 0) + 1;
  const modes = Object.entries(mc).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const dates = cards.map(c => c.date).filter(Boolean).sort();
  return `<div class="bb-summary">` +
    `<div class="builds-sum"><b>Most-used abilities</b>${top.map(t => `<span class="build-ab" title="in ${t.count} of ${n} kits">${abilityIcon(t.name)}<span>${esc(t.name)}</span><em>${Math.round(t.count / n * 100)}%</em></span>`).join("")}</div>` +
    `<div class="builds-sum"><b>Modes played</b>${modes.map(([m, c]) => `<span class="tag">${esc(abilityNameSafe(m))} ${Math.round(c / n * 100)}%</span>`).join("")}</div>` +
    `<p class="rot-small">${n.toLocaleString("en-US")} kits${dates.length ? ` · oldest ${String(dates[0]).slice(0, 10)} · newest ${String(dates[dates.length - 1]).slice(0, 10)}` : ""} · ` +
    `<a href="https://sendou.ink/builds/${encodeURIComponent(slug)}" target="_blank" rel="noopener">view on sendou.ink</a></p></div>`;
}
function renderLiveBuilds(force=false){
  const grid = el("bb-grid");
  if(!grid) return;
  const st = el("bb-status"), sum = el("bb-summary");
  if(buildsMode() === "off"){
    if(sum) sum.innerHTML = "";
    if(st) st.textContent = "";
    bbRenderResults();
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-shirt"></i><h3>Builds are off</h3><p>Turn the build fetcher back on in <b>Settings → Build fetcher</b>, or browse <a href="https://sendou.ink/builds" target="_blank" rel="noopener">sendou.ink</a>.</p></div>`;
    const more = el("bb-more"); if(more) more.hidden = true;
    return;
  }
  if(!buildsData){
    if(st) st.textContent = "Loading kits…";
    if(sum) sum.innerHTML = "";
    grid.innerHTML = `<div class="skeleton-card"><div class="sk sk-row"></div><div class="sk sk-row"></div></div>`;
    getBuilds(force).then(() => renderLiveBuilds()).catch(e => {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-cloud-arrow-down"></i><h3>Couldn't load kits</h3><p>${esc(e.message)} — check Settings → Build fetcher.</p></div>`;
      if(st) st.textContent = "";
    });
    return;
  }
  const avail = bbAvailable();
  if(!avail.length){
    if(st) st.textContent = "";
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-shirt"></i><h3>No kits</h3><p>This snapshot has no builds.</p></div>`;
    return;
  }
  // default to the weapon the user actually plays
  const favSlug = (profile.facts || {}).weapon ? sendouSlug(profile.facts.weapon) : "";
  if(!bbState.slug || !avail.some(w => w.slug === bbState.slug)){
    bbState.slug = (avail.find(w => w.slug === favSlug) || avail[0]).slug;
    bbState.query = "";
    const s = el("bb-search");
    if(s) s.value = (avail.find(w => w.slug === bbState.slug) || avail[0]).name;
    bbState.cards = buildsForWeapon(bbState.slug) || [];
    bbState.shown = BB_PAGE;
  }
  bbRenderResults();
  paintBuilds();
}
function paintBuilds(){
  const grid = el("bb-grid"), sum = el("bb-summary"), st = el("bb-status");
  if(!grid) return;
  const all = bbState.cards;
  const cards = bbSortCards(all);
  if(sum) sum.innerHTML = bbSummaryHTML(all, bbState.slug);
  const slice = cards.slice(0, bbState.shown);
  grid.innerHTML = slice.length
    ? slice.map(buildCardHTML).join("")
    : `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>No kits</h3><p>Nothing to show for this weapon.</p></div>`;
  const left = cards.length - slice.length;
  if(st) st.textContent = left > 0
    ? `${cards.length.toLocaleString("en-US")} kits · showing ${slice.length}`
    : `${cards.length.toLocaleString("en-US")} kits`;
  const more = el("bb-more");
  if(more){
    more.hidden = left <= 0;
    if(left > 0) more.innerHTML = `<i class="fa-solid fa-chevron-down"></i> Show ${Math.min(BB_PAGE, left).toLocaleString("en-US")} more`;
  }
}
on("bb-search", "input", () => { bbState.query = el("bb-search")?.value || ""; bbRenderResults(); });
on("bb-search", "focus", () => { bbState.query = el("bb-search")?.value || ""; bbRenderResults(); });
document.addEventListener("click", e => {
  if(e.target.closest("#bb-results button")) return;
  const box = el("bb-results");
  if(box && !box.hidden && !e.target.closest(".bb-find")) box.hidden = true;
});
document.addEventListener("click", e => {
  const pick = e.target.closest("[data-bb-pick]");
  if(!pick) return;
  e.preventDefault();
  bbSelect(pick.dataset.bbPick);
});
document.querySelectorAll("[data-bb-sort]").forEach(b => b.addEventListener("click", () => {
  bbState.sort = b.dataset.bbSort;
  document.querySelectorAll("[data-bb-sort]").forEach(x => x.classList.toggle("active", x === b));
  bbState.shown = BB_PAGE;
  paintBuilds();
}));
on("bb-more", "click", () => { bbState.shown += BB_PAGE; paintBuilds(); });

/* ---------- answers ---------- */
async function answerRotation(kind, asChat=true){
  const htmlToMsg = (h) => { if(asChat) addMsg("assistant", h + (personalizedTip("rotations") || "")); return h; };
  try{
    const data = await getSchedules();
    const d = data.data;
    if(kind==="x"){
      const node = currentNode(d.xSchedules.nodes);
      const s = node.xMatchSetting;
      return htmlToMsg(`<h3>Here is the current X Battle rotation</h3>` + rotationWidgetHTML({label:"X Battles", rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:node.startTime, endTime:node.endTime}));
    } else if(kind==="turf"){
      const node = currentNode(d.regularSchedules.nodes);
      const s = node.regularMatchSetting;
      return htmlToMsg(`<h3>Here is the current Turf War rotation</h3>` + rotationWidgetHTML({label:"Turf War", rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:node.startTime, endTime:node.endTime}));
    } else if(kind==="anarchy"){
      const node = currentNode(d.bankaraSchedules.nodes);
      let html = `<h3>Here is the current Anarchy rotations</h3>`;
      (node.bankaraMatchSettings||[]).forEach((s,i)=>{ html += rotationWidgetHTML({label:`Anarchy Battle (${i===0?"Series":"Open"})`, rule:s.vsRule.name, ruleCode:s.vsRule.rule, stages:s.vsStages, startTime:node.startTime, endTime:node.endTime}); });
      return htmlToMsg(html);
    } else if(kind==="event"){
      const node = currentNode(d.eventSchedules.nodes);
      const s = node.eventMatchSetting || node.challengeMatchSetting;
      if(!s){ htmlToMsg(`<p>No Event rotation is currently active.</p>`); return; }
      return htmlToMsg(`<h3>Here is the current Event rotation</h3>` + rotationWidgetHTML({label:"Event / Challenge", rule:s.vsRule?.name||"Event", ruleCode:s.vsRule?.rule, stages:s.vsStages, startTime:node.startTime, endTime:node.endTime}));
    } else if(kind==="salmon"){
      const node = currentNode(d.coopGroupingSchedule.regularSchedules.nodes);
      const setting = node.setting;
      const weapons = (setting.weapons||[]).map(w=>esc(w.name)).join(", ");
      return htmlToMsg(`<h3>Here is the current Salmon Run shift</h3><p><span class="tag">${esc(setting.coopStage?.name||"")}</span><span class="tag">${esc(setting.boss?.name||"")}</span></p><p>Supplied weapons: ${weapons||"Grizzco random"}</p>` +
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
  { key: "p", label: "Takoroka", color: "#f59e0b" },
  { key: "a", label: "Tentatek", color: "#2dd4bf" },
];
let xrankSeasons = {};
let xrankFiles = {}; // filename -> uploaded ISO timestamp from the index
async function xrankSeasonList(div="p"){
  if(xrankSeasons[div]) return xrankSeasons[div];
  const res = await fetch("https://assets.splatoon3.ink/data/xrank/?format=json");
  if(!res.ok) throw new Error("ranking index unavailable");
  const d = await res.json();
  for(const f of (d.files || [])){
    if(f.name && f.uploaded) xrankFiles[f.name] = f.uploaded;
  }
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
/* ---------- season names + live leaders (splatoon3.ink summaries, refreshed often) ---------- */
let xrankMeta = {};
async function xrankSummary(div="p"){
  const now = Date.now();
  const c = xrankMeta[div];
  if(c && now - c.at < 600000) return c;
  const file = div === "a" ? "xrank.tentatek.json" : "xrank.takoroka.json";
  const res = await fetch(`https://assets.splatoon3.ink/data/xrank/${file}`);
  if(!res.ok) throw new Error("season summary unavailable");
  const s = (await res.json()).data.xRanking.currentSeason;
  const m = { name: s.name, start: s.startTime, end: s.endTime, updated: s.lastUpdateTime,
    leaders: { Ar: s.xRankingAr?.nodes?.[0], Cl: s.xRankingCl?.nodes?.[0],
               Gl: s.xRankingGl?.nodes?.[0], Lf: s.xRankingLf?.nodes?.[0] }, at: now };
  xrankMeta[div] = m;
  return m;
}
function fmtMY(iso){
  const t = new Date(iso);
  return `${t.getUTCMonth()+1}/${t.getUTCFullYear()}`;
}
function timeAgo(ms){
  const m = Math.floor(ms / 60000);
  if(m < 1) return "just now";
  if(m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if(h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function seasonLabel(div, n, latest, meta){
  const rangeOf = (startIso, backQuarters) => {
    const start = new Date(startIso);
    start.setUTCMonth(start.getUTCMonth() - 3 * backQuarters);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 3);
    return `${fmtMY(start)}–${fmtMY(end)}`;
  };
  if(meta && n === latest && meta.name) return `${meta.name} · ${fmtMY(meta.start)}–${fmtMY(meta.end)}`;
  if(meta) return `Season ${div}-${n} · ${rangeOf(meta.start, latest - n)}`;
  return `Season ${div}-${n}`;
}
/* Compact Top 500 widget, mountable in chat or the Live tab. */
function top500Shell(){
  return `<div class="xrank-tabs" data-xdivs></div>` +
    `<div class="xrank-tabs" data-xtabs></div>` +
    `<div class="xrank-controls"><select class="pill-select" data-xseason><option>Loading seasons…</option></select><span class="pill-static updated" data-xupdated>…</span></div>` +
    `<div data-xlist><div class="skeleton-card"><div class="sk sk-title"></div><div class="sk sk-row"></div><div class="sk sk-row"></div></div></div>`;
}
const xrankCache = {}; // "div/mode/season" -> {edges, at}
const livePrefs = { mode: "splatzones", div: "p" }; // remembered across Live visits
let playerSeq = 0;
const playerCache = {}; // pid -> {node, mode, div, season}
function rankRowsArchive(edges, origin, modeKey, div, season){
  return `<p class="muted">${edges.length} players · click a name for details</p><div class="rank-list scroll">` + edges.map(n => {
    const pid = "pl" + (++playerSeq);
    playerCache[pid] = { node: n, mode: modeKey, div, season };
    return `<div class="rank-row"><span class="rank ${rankMedal(n.rank)}">${n.rank}</span>` +
      `${n.weapon?.image?.url?`<img class="rank-weapon" src="${n.weapon.image.url}" alt="${esc(n.weapon.name||"")}" loading="lazy"/>`:""}` +
      `<button class="rank-name as-btn" data-player="${pid}" data-origin="${origin}">${esc(n.name)}<small>${esc(n.weapon?.name||"")}</small></button>` +
      `<span class="rank-xp">${esc(String(n.xPower))} XP</span></div>`;
  }).join("") + `</div>`;
}
/* Drop cached players that no button still points at. The old fixed cap deleted
   the first ~200 entries of the very page being rendered (500 rows are created
   in one pass), leaving those names unclickable. */
function prunePlayerCache(){
  const keys = Object.keys(playerCache);
  if(keys.length <= 600) return;
  for(const k of keys){
    if(playerCache[k]._keep) continue;
    if(document.querySelector(`[data-player="${k}"]`)) continue;
    delete playerCache[k];
    if(Object.keys(playerCache).length <= 600) break;
  }
}
async function initTop500(root, modeKey="splatzones", div="p", origin="chat"){
  const mode0 = XRANK_MODES.find(m => m.key === modeKey) || XRANK_MODES[0];
  if(!XRANK_DIVS.some(d => d.key === div)) div = "p";
  const divsEl = root.querySelector("[data-xdivs]");
  const tabsEl = root.querySelector("[data-xtabs]");
  const listEl = root.querySelector("[data-xlist]");
  const selEl = root.querySelector("[data-xseason]");
  const updatedPill = root.querySelector("[data-xupdated]");
  if(!divsEl || !tabsEl || !listEl) return;
  const cur = { mode: mode0.key, div, season: null };
  // rehydrate: restored messages already carry active pills + season — adopt them
  try{
    const preDiv = root.querySelector("[data-xd].active")?.dataset.xd;
    if(preDiv && XRANK_DIVS.some(d => d.key === preDiv)) cur.div = preDiv;
    const preMode = root.querySelector("[data-xm].active")?.dataset.xm;
    if(preMode && XRANK_MODES.some(m => m.key === preMode)) cur.mode = preMode;
    const preSel = root.querySelector("[data-xseason]");
    if(preSel && /^\d+$/.test(preSel.value)) cur.season = parseInt(preSel.value,10);
  }catch{}
  const setUpdated = (txt) => { if(updatedPill) updatedPill.textContent = txt; };
  const paintDivs = () => {
    divsEl.innerHTML = XRANK_DIVS.map(d => `<button class="xrank-tab div-tab${d.key===cur.div?" active":""}" style="--tint:${d.color}" data-xd="${d.key}"><i class="fa-solid fa-shield-halved"></i> ${d.label}</button>`).join("");
    divsEl.querySelectorAll("[data-xd]").forEach(b => b.addEventListener("click", async () => { cur.div = b.dataset.xd; cur.season = null; if(origin === "live"){ livePrefs.div = cur.div; } paintDivs(); await paintSeasons(); load(); }));
  };
  const paintTabs = () => {
    tabsEl.innerHTML = XRANK_MODES.map(m => `<button class="xrank-tab${m.key===cur.mode?" active":""}" style="--tint:${m.color}" data-xm="${m.key}">${modeIcon(m)} ${m.label}</button>`).join("");
    tabsEl.querySelectorAll("[data-xm]").forEach(b => b.addEventListener("click", () => { cur.mode = b.dataset.xm; if(origin === "live"){ livePrefs.mode = cur.mode; } paintTabs(); load(); }));
  };
  const paintSeasons = async () => {
    try{
      const seasons = await xrankSeasonList(cur.div);
      if(!cur.season || !seasons.includes(cur.season)) cur.season = seasons[0];
      let meta = null;
      try{ meta = await xrankSummary(cur.div); }catch{}
      if(selEl) selEl.innerHTML = seasons.map(s => `<option value="${s}"${s===cur.season?" selected":""}>${esc(seasonLabel(cur.div, s, seasons[0], meta))}</option>`).join("");
    }catch{ if(selEl) selEl.innerHTML = `<option>Unavailable</option>`; }
  };
  if(selEl) selEl.addEventListener("change", () => { cur.season = parseInt(selEl.value,10); load(); });
  const load = async () => {
    listEl.innerHTML = `<div class="skeleton-card"><div class="sk sk-title"></div><div class="sk sk-row"></div></div>`;
    setUpdated("loading…");
    // 1) preferred: splatnet3-scraper snapshot committed by Action
    try{
      const r = await fetch("data/live/top500.json");
      const j = await r.json();
      if(j.x_rank_top500 && j.x_rank_top500.length){
        listEl.innerHTML = `<p class="muted">${j.x_rank_top500.length} players</p><div class="rank-list scroll">` + j.x_rank_top500.map(e=>`<div class="rank-row"><span class="rank ${rankMedal(e.rank)}">${e.rank}</span><span class="rank-name">${esc(e.name)}</span><span class="rank-xp">${esc(String(e.x_power))} XP</span></div>`).join("") + `</div>`;
        setUpdated(j.updated_at ? `updated ${timeAgo(Date.now() - new Date(j.updated_at).getTime())}` : "");
        return;
      }
    }catch{}
    // 2) public X-rank archive (refreshes several times daily)
    try{
      const seasons = await xrankSeasonList(cur.div);
      if(!cur.season || !seasons.includes(cur.season)) cur.season = seasons[0];
      if(selEl) selEl.value = String(cur.season);
      const s = cur.season;
      const ck = `${cur.div}/${cur.mode}/${s}`;
      let edges = (xrankCache[ck] && Date.now() - xrankCache[ck].at < 300000) ? xrankCache[ck].edges : null;
      if(!edges){
        ({ edges } = await xrankFetch(cur.mode, cur.div, s));
        xrankCache[ck] = { edges, at: Date.now() };
      }
      if(!edges.length) throw new Error("empty ranking");
      listEl.innerHTML = rankRowsArchive(edges, origin, cur.mode, cur.div, s);
      const uploaded = xrankFiles[`xrank.detail.${cur.div}-${s}.${cur.mode}.json`];
      setUpdated(uploaded ? `updated ${timeAgo(Date.now() - new Date(uploaded).getTime())}` : "");
    }catch(e){
      listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-trophy"></i><h3>Rankings unavailable</h3><p>${esc(e.message)}</p></div>`;
      setUpdated("");
    }
  };
  paintDivs();
  paintTabs();
  await paintSeasons();
  prunePlayerCache();
  load();
}
async function answerTop500(modeKey="splatzones", div="p", explicit=false){
  const f = profile.facts || {};
  if(!explicit && f.mode){
    const fdiv = detectDiv(f.div || "");
    if(fdiv) div = fdiv;
    const fm = detectMode(f.mode || "");
    if(fm) modeKey = fm;
  }
  const msg = addMsg("assistant", `<h3><i class="fa-solid fa-trophy" style="color:#f59e0b"></i> Top 500 X leaderboard</h3>` + top500Shell() +
    ((profile.facts || {}).mode ? `<p class="rot-small">Defaulted to your main, <b>${esc(profile.facts.mode)}</b>${profile.facts.div ? ` in ${esc(profile.facts.div)}` : ""}.</p>` : ""));
  if(!msg) return;
  initTop500(msg, modeKey, div, "chat");
}

/* ---------- goals (local only) ---------- */
const GOALS_KEY = "splatgpt.goals.v1";
let goals = [];
try{ goals = JSON.parse(localStorage.getItem(GOALS_KEY) || "[]"); }catch{ goals = []; }
function saveGoals(){ try{ localStorage.setItem(GOALS_KEY, JSON.stringify(goals.slice(0,30))); }catch{} }
function goalById(id){ return goals.find(g => g.id === id); }
function goalPct(g){
  if(g.type === "quest"){
    const total = (g.steps || []).length;
    if(!total) return 0;
    return Math.min(100, (g.steps.filter(s => s.done).length / total) * 100);
  }
  if(g.type === "custom") return g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
  if(g.type === "rank") return g.startRank && g.startRank > g.target
    ? Math.min(100, Math.max(0, ((g.startRank - g.current) / (g.startRank - g.target)) * 100)) : (g.current <= g.target ? 100 : 0);
  if(g.type === "xpower" || g.type === "top500") return g.target > 0 ? Math.min(100, Math.max(0, (g.current / g.target) * 100)) : 0;
  return 0;
}
function goalNextMilestone(g){
  // next 25%-boundary above current progress
  const pct = goalPct(g);
  if(g.type === "quest"){
    const nx = questNext(g);
    return nx ? { m: Math.ceil(pct), text: nx.t } : null;
  }
  if((g.type === "xpower" || g.type === "top500" || g.type === "custom") && !(g.target > 0)) return null;
  for(const m of [25, 50, 75, 100]){
    if(pct < m){
      let val;
      if(g.type === "rank" && g.startRank && g.startRank > g.target){
        val = Math.ceil(g.startRank - ((g.startRank - g.target) * m) / 100);
        return { m, text: `Rank #${val}` };
      }
      val = (g.target * m) / 100;
      const disp = g.type === "rank" ? `#${Math.ceil(val)}` : `${Math.round(val * 10) / 10}${g.unit ? " " + g.unit : ""}`;
      return { m, text: disp };
    }
  }
  return null;
}
function goalSessionStats(g){
  const h = (g.history || []).slice().sort((a,b) => new Date(a.t) - new Date(b.t));
  if(h.length < 2) return `${h.length} check-in${h.length === 1 ? "" : "s"} logged — log once per session`;
  let best = 0;
  for(let i = 1; i < h.length; i++){
    const d = g.type === "rank" ? h[i-1].v - h[i].v : h[i].v - h[i-1].v;
    if(d > best) best = d;
  }
  const unit = g.type === "rank" ? " ranks" : g.type === "xpower" ? " XP" : (g.unit ? ` ${g.unit}` : "");
  return `${h.length} check-ins · best jump +${Math.round(best * 10) / 10}${unit}`;
}
function goalNextLine(g){
  if(goalPct(g) >= 100) return `<span class="goal-next"><i class="fa-solid fa-crown"></i> Finished — set the next one higher.</span>`;
  const nm = goalNextMilestone(g);
  const sess = goalSessionStats(g);
  return `<span class="goal-next"><i class="fa-solid fa-flag-checkered"></i> Next: <b>${esc(nm ? nm.text : "—")}</b> · ${esc(sess)}</span>`;
}
function goalAdviceInner(g){
  const isFirstX = g.type === "xpower" && g.target <= 2200 && (g.current || 0) < 1500;
  if(isFirstX){
    return `<b class="goal-plan-t"><i class="fa-solid fa-route"></i> First-2K path</b><ol>` +
      `<li>Reach <b>S+</b> in Anarchy — X Battles unlock there.</li>` +
      `<li>Play all <b>5 placement matches</b>; early games swing the most.</li>` +
      `<li>One-trick a meta pick from Hot weapons — comfort beats counter-picking at 2K.</li>` +
      `<li>Log every session below; short daily sessions beat marathons.</li></ol>` +
      `<button class="choice-btn" data-goal-live><i class="fa-solid fa-arrows-rotate"></i> Check when your mode is live</button>`;
  }
  if(g.type === "rank") return `<b class="goal-plan-t"><i class="fa-solid fa-lightbulb"></i> Rank chasing</b><p>Climbing late-season is easier — the cutoff settles while leaders stop pushing. Log after every session.</p>`;
  if(g.type === "top500") return `<b class="goal-plan-t"><i class="fa-solid fa-lightbulb"></i> Cracking Top 500</b><p>The cutoff moves — check it before every session, not once. Late-season pushes face a calmer line. Queue your best mode window.</p>`;
  if(g.type === "xpower") return `<b class="goal-plan-t"><i class="fa-solid fa-lightbulb"></i> Climbing</b><p>Protect win streaks: quit tilted sessions early. Two focused sessions beat one long one.</p>`;
  return `<b class="goal-plan-t"><i class="fa-solid fa-lightbulb"></i> Grinding</b><p>Small daily counts compound — the streak flame tracks consistency, not speed.</p>`;
}
function goalStreak(g){
  const days = new Set((g.history || []).map(h => new Date(h.t).toDateString()));
  let streak = 0;
  const d = new Date();
  if(!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while(days.has(d.toDateString())){ streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
function goalETA(g){
  if(g.type === "quest") return null;
  const h = (g.history || []).slice().sort((a,b) => new Date(a.t) - new Date(b.t));
  if(h.length < 2) return null;
  const first = h[0], last = h[h.length - 1];
  const days = Math.max(1, (new Date(last.t) - new Date(first.t)) / 86400000);
  const rate = (last.v - first.v) / days; // per day, works for XP-up and rank-down? rank: negative rate
  if(g.type === "rank"){
    const need = last.v - g.target; // ranks to climb (positive)
    if(need <= 0) return "done";
    const perDay = (first.v - last.v) / days; // ranks gained per day
    if(perDay <= 0) return null;
    const eta = new Date(Date.now() + (need / perDay) * 86400000);
    return `~${Math.ceil(need / perDay)}d at +${perDay.toFixed(1)}/day → ${eta.toLocaleDateString()}`;
  }
  const need = g.target - last.v;
  if(need <= 0) return "done";
  if(rate <= 0) return null;
  const eta = new Date(Date.now() + (need / rate) * 86400000);
  return `~${Math.ceil(need / rate)}d at +${rate.toFixed(rate < 10 ? 1 : 0)}/day → ${eta.toLocaleDateString()}`;
}
async function goalContext(mode, div){
  const seasons = await xrankSeasonList(div);
  const s = seasons[0];
  const { edges } = await xrankFetch(mode, div, s);
  const counts = {};
  edges.forEach(n => { const w = n.weapon?.name || "?"; counts[w] = (counts[w] || 0) + 1; });
  const top = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
  return { season: s, cutoff: edges[edges.length - 1], leader: edges[0], top, count: edges.length };
}
function renderGoals(){
  const list = el("goals-list");
  if(!list) return;
  if(!goals.length){
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bullseye"></i><h3>No goals yet</h3><p>Set an X Power target, a rank to chase, or a custom grind — SplatGPT will track it with live board data.</p></div>`;
    return;
  }
  list.innerHTML = "";
  goals.forEach(g => {
    const pct = goalPct(g);
    const done = pct >= 100;
    const card = document.createElement("div");
    card.className = "goal-card" + (done ? " done" : "");
    card.innerHTML = `<div class="goal-top"><button class="goal-open" data-goal-open="${g.id}" title="Open goal details & chat"><span class="goal-type"><i class="fa-solid ${g.type === "xpower" ? "fa-gauge-high" : g.type === "rank" ? "fa-trophy" : "fa-star"}"></i> ${esc(goalTitle(g))}</span></button>` +
      `<button class="goal-del" data-goal-del="${g.id}" title="Delete goal"><i class="fa-solid fa-trash-can"></i></button></div>` +
      `<div class="goal-bar"><div style="width:${pct.toFixed(1)}%"></div></div>` +
      `<div class="goal-meta"><span><b>${esc(g.type === "quest" ? fmtGoalVal(g) : fmtGoalVal(g, g.current) + " / " + fmtGoalVal(g, g.target))}</b> · ${pct.toFixed(0)}%` +
      (g.type === "rank" && g.currentXP ? ` <span class="muted">· you have ${esc(String(g.currentXP))} XP</span>` : "") + `</span>` +
      (goalStreak(g) > 1 ? `<span class="tag"><i class="fa-solid fa-fire"></i> ${goalStreak(g)}-day streak</span>` : "") +
      (done ? `<span class="tag gold"><i class="fa-solid fa-crown"></i> complete</span>` : "") + `</div>` +
      `<div class="goal-next">${goalNextLine(g)}</div>` +
      (g.type === "quest"
        ? `<div class="goal-panels"><div class="goal-panel"><div class="goal-panel-h">Steps</div><div class="quest-steps">${(g.steps || []).map((s, i) => `<button class="quest-step${s.done ? " done" : ""}" data-quest-toggle="${g.id}:${i}"><i class="${s.done ? "fa-solid fa-square-check" : "fa-regular fa-square"}"></i><span>${esc(s.t)}</span></button>`).join("")}</div></div><div class="goal-panel"><div class="goal-panel-h">Plan</div>${goalAdviceInner(g)}</div></div>`
        : g.type === "custom"
        ? `<div class="goal-panels solo"><div class="goal-panel"><div class="goal-panel-h">Plan</div>${goalAdviceInner(g)}</div></div>`
        : `<div class="goal-panels"><div class="goal-panel" data-goal-ctx="${g.id}"><span class="muted">Loading board…</span></div><div class="goal-panel"><div class="goal-panel-h">Plan</div>${goalAdviceInner(g)}</div></div>`) +
      `<div class="goal-log">${g.type === "quest"
        ? `<span class="muted">Tick steps above as you finish them.</span>`
        : `<input data-goal-input="${g.id}" inputmode="decimal" placeholder="${g.type === "custom" ? "Amount to add…" : "Log current value…"}" /><button data-goal-log="${g.id}">Log</button>`}</div>`;
    list.appendChild(card);
    if(g.type !== "custom") loadGoalContext(g.id);
  });
  list.querySelectorAll("[data-goal-del]").forEach(b => b.addEventListener("click", () => {
    goals = goals.filter(x => x.id !== b.dataset.goalDel);
    saveGoals(); renderGoals();
  }));
  list.querySelectorAll("[data-goal-log]").forEach(b => b.addEventListener("click", () => {
    const g = goalById(b.dataset.goalLog);
    const inp = list.querySelector(`[data-goal-input="${b.dataset.goalLog}"]`);
    if(!g || !inp) return;
    const v = parseFloat(inp.value);
    if(!isFinite(v)) return;
    const before = goalPct(g);
    if(g.type === "custom") g.current = (g.current || 0) + v;
    else g.current = v;
    g.history = (g.history || []).concat([{ t: new Date().toISOString(), v: g.current }]).slice(-100);
    saveGoals();
    const after = goalPct(g);
    [25, 50, 75, 100].forEach(m => {
      if(before < m && after >= m) pushNotif(m >= 100 ? `Goal complete: ${goalTitle(g)}!` : `${goalTitle(g)} — ${m}% there!`, null);
    });
    renderGoals();
  }));
  list.querySelectorAll("[data-quest-toggle]").forEach(b => b.addEventListener("click", () => {
    const [gid, si] = b.dataset.questToggle.split(":");
    const g = goalById(gid);
    if(!g || !g.steps || !g.steps[+si]) return;
    const before = goalPct(g);
    g.steps[+si].done = !g.steps[+si].done;
    const done = g.steps.filter(s => s.done).length;
    g.history = (g.history || []).concat([{ t: new Date().toISOString(), v: done }]).slice(-100);
    saveGoals();
    const after = goalPct(g);
    [25, 50, 75, 100].forEach(m => {
      if(before < m && after >= m) pushNotif(m >= 100 ? `Quest complete: ${goalTitle(g)}!` : `${goalTitle(g)} — ${m}% there!`, null);
    });
    renderGoals();
  }));
}
async function loadGoalContext(id){
  const g = goalById(id);
  const box = document.querySelector(`[data-goal-ctx="${id}"]`);
  if(!g || !box || g.type === "custom") return;
  try{
    if(g.type === "top500"){
      const synced = await syncTop500Cutoff(id);
      if(!synced) throw new Error("cutoff unavailable");
      refreshGoalCard(id);
    }
    const ctx = await goalContext(g.mode, g.div);
    if(!goalById(id)) return;
    const modeLabel = (XRANK_MODES.find(m => m.key === g.mode) || {}).label || g.mode;
    const divLabel = (XRANK_DIVS.find(d => d.key === g.div) || {}).label || g.div;
    const eta = goalETA(g);
    const gap = Math.max(0, (g.target || 0) - (g.current || 0));
    const cells = (g.type === "xpower" || g.type === "top500")
      ? [["Cutoff", esc(String(ctx.cutoff.xPower))],
         ["Leader", `${esc(ctx.leader.name)} · ${esc(String(ctx.leader.xPower))}`],
         ["Gap", gap > 0 ? `${esc(String(Math.round(gap)))} XP` : (g.type === "top500" ? "you're in" : "closed")]]
      : [["Cutoff", esc(String(ctx.cutoff.xPower))],
         [`Rank #${g.target}`, "..."],
         ["Board", `${esc(String(ctx.count))} players`]];
    if(g.type === "rank"){
      const need = await rankNeed(g.mode, g.div, g.target);
      cells[1][1] = need != null ? `${esc(String(need))} XP` : "?";
    }
    box.innerHTML = `<div class="goal-panel-h">Board · ${esc(modeLabel)} · ${esc(divLabel)}${g.type === "top500" ? " · live cutoff" : ""}</div>` +
      `<div class="goal-statcells">${cells.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>` +
      `<div class="hot-chips">${ctx.top.map(([w, c]) => `<span class="tag"><b>${esc(w)}</b> ${c}</span>`).join("")}</div>` +
      (eta && eta !== "done" ? `<p class="muted">Pace: ${esc(eta)}</p>` : "");
  }catch(e){
    box.innerHTML = `<p class="muted">Board context unavailable (${esc(e.message)}).</p>`;
  }
}
async function rankNeed(mode, div, rank){
  try{
    const seasons = await xrankSeasonList(div);
    const { edges } = await xrankFetch(mode, div, seasons[0]);
    const hit = edges.find(n => n.rank === rank);
    return hit ? hit.xPower : null;
  }catch{ return null; }
}
/* Live cutoff sync for Top-500-entry goals: the target IS the moving cutoff. */
async function syncTop500Cutoff(id){
  const g = goalById(id);
  if(!g || g.type !== "top500") return null;
  const ctx = await goalContext(g.mode, g.div);
  const seasons = await xrankSeasonList(g.div);
  const before = g.target || 0;
  g.target = ctx.cutoff.xPower;
  g.season = seasons[0];
  saveGoals();
  return { ctx, changed: before !== g.target, season: seasons[0] };
}
function refreshGoalCard(id){
  const g = goalById(id);
  const card = document.querySelector(`[data-goal-log="${CSS.escape(id)}"]`)?.closest(".goal-card");
  if(!g || !card) return;
  const pct = goalPct(g);
  const bar = card.querySelector(".goal-bar > div");
  if(bar) bar.style.width = pct.toFixed(1) + "%";
  const meta = card.querySelector(".goal-meta span");
  if(meta) meta.innerHTML = `<b>${esc(g.type === "quest" ? fmtGoalVal(g) : fmtGoalVal(g, g.current) + " / " + fmtGoalVal(g, g.target))}</b> · ${pct.toFixed(0)}%`;
  const next = card.querySelector(".goal-next");
  if(next) next.outerHTML = goalNextLine(g);
}
/* ---------- per-goal detail view with its own coach chat ---------- */
let currentGoalId = null;
function openGoal(id){
  const g = goalById(id);
  if(!g) return;
  currentGoalId = id;
  renderGoalDetail();
  showView("goal-detail");
}
function goalChatAdd(role, html){
  const g = goalById(currentGoalId);
  const box = el("goal-chat");
  if(!g || !box) return;
  g.chats = (g.chats || []).concat([{ role, html }]).slice(-60);
  saveGoals();
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "bot");
  div.innerHTML = `<div class="role">${role === "user" ? "You" : "Coach"}</div><div class="bubble">${html}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function renderGoalDetail(){
  const g = goalById(currentGoalId);
  const head = el("goal-detail-head"), box = el("goal-chat"), quick = el("goal-quick");
  if(!g || !head || !box) return;
  if(viewTitle) viewTitle.textContent = goalTitle(g);
  const pct = goalPct(g);
  head.innerHTML = `<div class="goal-card"><div class="goal-top"><span class="goal-type"><i class="fa-solid fa-bullseye"></i> ${esc(goalTitle(g))}</span></div>` +
    `<div class="goal-bar"><div style="width:${pct.toFixed(1)}%"></div></div>` +
    `<div class="goal-meta"><span><b>${esc(g.type === "quest" ? fmtGoalVal(g) : fmtGoalVal(g, g.current) + " / " + fmtGoalVal(g, g.target))}</b> · ${pct.toFixed(0)}%</span></div>` +
    `<div class="goal-next">${goalNextLine(g)}</div></div>` +
    `<div class="goal-panels"><div class="goal-panel" data-goal-plan><span class="muted">Building your living plan…</span></div>` +
    `<div class="goal-panel"><div class="goal-panel-h">Goal notes</div><div data-goal-notes></div>` +
    `<div class="goal-log"><input data-goal-note-input placeholder="Jot something for this goal…" /><button data-goal-note-add>Add</button></div></div></div>`;
  loadGoalPlan();
  renderGoalNotes();
  box.innerHTML = "";
  (g.chats || []).forEach(m => {
    const div = document.createElement("div");
    div.className = "msg " + (m.role === "user" ? "user" : "bot");
    div.innerHTML = `<div class="role">${m.role === "user" ? "You" : "Coach"}</div><div class="bubble">${m.html}</div>`;
    box.appendChild(div);
  });
  if(!(g.chats || []).length){
    goalChatAdd("assistant", `<p>I'm your coach for <b>${esc(goalTitle(g))}</b>. Vent here when tilted, celebrate wins, or just type <b>“log 2150”</b> to record progress. ${esc(goalNextLine(g).replace(/<[^>]+>/g, ""))}</p>`);
  }
  if(quick){
    quick.innerHTML = [`I'm tilted, help`, `Just won — log it`, `Should I keep playing?`, `Make me a plan`]
      .map(t => `<button data-gq="${esc(t)}">${esc(t)}</button>`).join("");
    quick.querySelectorAll("[data-gq]").forEach(b => b.addEventListener("click", () => {
      goalChatAdd("user", esc(b.dataset.gq));
      answerGoalChat(b.dataset.gq);
    }));
  }
  document.querySelectorAll("[data-goal-note-add]").forEach(b => b.addEventListener("click", () => {
    const g2 = goalById(currentGoalId);
    const inp = document.querySelector("[data-goal-note-input]");
    const t = (inp?.value || "").trim().slice(0, 280);
    if(!g2 || !t) return;
    inp.value = "";
    g2.gnotes = (g2.gnotes || []).concat([{ id: "gn" + Date.now().toString(36), text: t, t: new Date().toISOString() }]).slice(-50);
    saveGoals();
    renderGoalNotes();
  }));
}
async function loadGoalPlan(){
  const g = goalById(currentGoalId);
  const box = document.querySelector("[data-goal-plan]");
  if(!g || !box) return;
  try{
    box.innerHTML = `<div class="goal-panel-h">Living plan · updates as you log</div>` + await goalPlanHTML(g);
  }catch(e){
    box.innerHTML = `<div class="goal-panel-h">Living plan</div><p class="muted">Plan unavailable (${esc(e.message)}).</p>`;
  }
}
function renderGoalNotes(){
  const g = goalById(currentGoalId);
  const box = document.querySelector("[data-goal-notes]");
  if(!g || !box) return;
  const list = g.gnotes || [];
  box.innerHTML = list.length
    ? list.map(n => `<div class="gnote"><span>${esc(n.text)}</span><button data-gnote-del="${n.id}" title="Delete note"><i class="fa-solid fa-xmark"></i></button></div>`).join("")
    : `<p class="muted">Nothing pinned yet — tactics, reminders, pep talks.</p>`;
  box.querySelectorAll("[data-gnote-del]").forEach(b => b.addEventListener("click", () => {
    const g2 = goalById(currentGoalId);
    if(!g2) return;
    g2.gnotes = (g2.gnotes || []).filter(n => n.id !== b.dataset.gnoteDel);
    saveGoals();
    renderGoalNotes();
  }));
}
function goalLogValue(g, v){
  const before = goalPct(g);
  if(g.type === "custom") g.current = (g.current || 0) + v;
  else g.current = v;
  g.history = (g.history || []).concat([{ t: new Date().toISOString(), v: g.current }]).slice(-100);
  saveGoals();
  const after = goalPct(g);
  [25, 50, 75, 100].forEach(m => {
    if(before < m && after >= m) pushNotif(m >= 100 ? `Goal complete: ${goalTitle(g)}!` : `${goalTitle(g)} — ${m}% there!`, null);
  });
  return { before, after };
}
async function answerGoalChat(text){
  const g = goalById(currentGoalId);
  if(!g) return;
  const q = text.toLowerCase();
  const numM = q.match(/\b(\d+(?:\.\d+)?)\b/);
  if(g.type === "rank"){
    const xpM = q.match(/(?:my\s+)?xp\s*(?:is|at|=|:)?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*xp/);
    const xpV = xpM ? parseFloat(xpM[1] || xpM[2]) : NaN;
    if(isFinite(xpV) && xpV > 0){
      g.currentXP = xpV;
      saveGoals();
      renderGoalDetail();
      goalChatAdd("assistant", `<p>Noted — <b>${esc(String(xpV))} XP</b> banked. Ask for a plan whenever you want the math.</p>`);
      return;
    }
  }
  if(/^(log|set|update|at)\b/.test(q.trim()) && numM){
    if(g.type === "quest"){
      goalChatAdd("assistant", `<p>This one runs on checkboxes, not numbers — tick steps in Goals and I'll count them.</p>`);
      return;
    }
    const v = parseFloat(numM[1]);
    if(isFinite(v)){
      goalLogValue(g, v);
      renderGoalDetail();
      goalChatAdd("assistant", `<p>Logged <b>${esc(fmtGoalVal(g, g.current))}</b> — ${goalPct(g).toFixed(0)}% of the way there. ${g.type === "custom" ? "Keep stacking." : "One session at a time."}</p>`);
      return;
    }
  }
  const sad = /tilt|sad|angry|mad|frustrat|upset|cry|depress|hate|stupid|trash|terrible|awful|worst|crash|give up|quit|hopeless|anxiet|stress/.test(q);
  const lost = /lost|lose|losing|loss|defeat|swept|stomp|destroyed/.test(q);
  const won = /\bwon\b|\bwin\b|winning|victory|climb|gained|popped off|carried/.test(q);
  const pct = goalPct(g);
  if(sad || lost){
    const lines = [
      `That stings, and it's okay to feel it. One rough patch doesn't rewrite your trend — you're at <b>${esc(fmtGoalVal(g, g.current))}</b>, ${pct.toFixed(0)}% of the way to <b>${esc(fmtGoalVal(g, g.target))}</b>.`,
      `Step away for ten minutes. Water, stretch, breathe. The queue will still be there, and you'll play sharper for it.`,
    ];
    if(lost && !sad) lines.splice(1, 0, `Losses cluster — matchmaking tests you in waves. If you've dropped 3 straight, call the session: protecting tomorrow's mindset beats forcing today's.`);
    lines.push(`When you're ready: warm up one Turf War, then queue. And log whatever happens — good data beats good vibes.`);
    goalChatAdd("assistant", `<p>${lines.join("</p><p>")}</p>`);
    return;
  }
  if(won){
    goalChatAdd("assistant", `<p>Yes! Bank that feeling — wins like this are the whole grind. Log your new value with <b>“log …”</b> so the pace tracker stays honest, then ride the momentum for one more.</p>`);
    return;
  }
  if(/should i (keep playing|continue|stop|quit)|keep (going|playing)/.test(q)){
    goalChatAdd("assistant", `<p>Simple rule: <b>two straight losses → 10-minute break. Three → done for now.</b> You're at ${pct.toFixed(0)}% — the goal isn't going anywhere, but tilt makes every game cost double. Check in after your next session either way.</p>`);
    return;
  }
  if(/make me a plan|give me a plan|plan (my|for|out)|schedule|how much should i play|how often|how to focus|focus|routine|when should i play/.test(q)){
    goalChatAdd("assistant", `<p>On it — pulling the board and the calendar…</p>`);
    answerGoalPlan(g);
    return;
  }
  if(/hello|hi|hey|thanks|thank/.test(q)){
    goalChatAdd("assistant", `<p>Hey. I'm here for this goal however today went — vent, celebrate, or log. What's up?</p>`);
    return;
  }
  goalChatAdd("assistant", `<p>Got it. For <b>${esc(goalTitle(g))}</b> you're at <b>${esc(fmtGoalVal(g, g.current))}</b> of <b>${esc(fmtGoalVal(g, g.target))}</b> (${pct.toFixed(0)}%). Tell me how sessions went, ask whether to keep playing, or log with <b>“log …”</b>.</p>`);
}
const MODE_FOCUS = {
  splatzones: "Zones is won in the first 30 seconds: paint first, then hold — never trickle in alone.",
  towercontrol: "Ride only with numbers. Pop your special to start a retake, not mid-fight, and trade your life for tower time late.",
  rainmaker: "Clear a path before anyone grabs. Carriers die to greed, not aim — shield pops win pushes.",
  clamblitz: "Win the clam economy first: the first Power Clam usually snowballs the game. Bank small leads.",
};
async function goalSeasonLeft(div){
  try{
    const m = await xrankSummary(div);
    const days = Math.max(0, Math.ceil((new Date(m.end) - Date.now()) / 86400000));
    return { days, end: new Date(m.end).toLocaleDateString(), name: m.name };
  }catch{ return null; }
}
async function goalPlanHTML(g){
  // living plan: recomputed from current progress every time it renders
  const head = `<p><b><i class="fa-solid fa-calendar-check"></i> Session plan — ${esc(goalTitle(g))}</b></p>`;
  if(g.type === "custom"){
    const left = Math.max(0, g.target - (g.current || 0));
    const perDay = Math.max(1, Math.ceil(left / 14));
    return head + `<p>Two weeks, daily reps: <b>${perDay}${g.unit ? " " + esc(g.unit) : ""}/day</b> (${left}${g.unit ? " " + esc(g.unit) : ""} left). Same time each day — streaks beat binges.</p>`;
  }
  if(g.type === "quest"){
    const left = (g.steps || []).filter(s => !s.done);
    return head + `<p><b>${left.length} step${left.length === 1 ? "" : "s"} left${left.length ? `: ${esc(left[0].t)}` : ""}</b>. One step per session, easiest first — momentum finishes lists.</p>`;
  }
  const season = await goalSeasonLeft(g.div);
  const modeLabel = (XRANK_MODES.find(m => m.key === g.mode) || {}).label || g.mode;
  const focus = MODE_FOCUS[g.mode] || "Play your best weapon, review one loss per session.";
  let needTxt = "", paceTxt = "";
  if(g.type === "xpower" || g.type === "top500"){
    const gap = Math.max(0, g.target - (g.current || 0));
    needTxt = `<b>${Math.round(gap)} XP</b> to go`;
    if(gap <= 0) return head + (g.type === "top500"
      ? `<p>You're above the cutoff line — now it's about <b>holding</b> it. Keep logging; the line moves.</p>`
      : `<p>Target already hit — time to set the next one higher.</p>`);
    if(season && season.days > 0){
      const perDay = Math.ceil(gap / season.days);
      paceTxt = `Season ends <b>${esc(season.end)}</b> (${season.days}d left) → <b>+${perDay} XP/day</b>.`;
    } else paceTxt = `No deadline pressure — aim for <b>+50 XP per session</b>.`;
  } else {
    const need = await rankNeed(g.mode, g.div, g.target);
    const haveXP = g.currentXP || null;
    const gap = (need != null && haveXP != null) ? Math.max(0, need - haveXP) : null;
    needTxt = need != null ? `Rank <b>#${g.target}</b> currently needs <b>${need} XP</b>` : `Rank <b>#${g.target}</b>`;
    if(haveXP != null && gap != null){
      if(gap <= 0) return head + `<p>You're already past the XP for #${g.target} — it's about holding rank now. Keep logging.</p>`;
      paceTxt = gapLine(g, gap, season);
    } else {
      paceTxt = `Add your current XP in the goal page and I'll compute the daily pace.`;
    }
  }
  return head + `<p>${needTxt}. ${paceTxt}</p>` +
    `<p><b>How much:</b> 4–5 sessions a week, 45–60 min each. <b>When:</b> queue while ${esc(modeLabel)} is live (check Live tab first) and stop after 2 straight losses.</p>` +
    `<p><b>Focus this week:</b> ${esc(focus)}</p>` +
    `<p><b>Session template:</b> 1 Turf warmup → 3–5 ranked → write down one thing that worked.</p>`;
}
async function answerGoalPlan(g){
  if(g.type === "top500") await syncTop500Cutoff(g.id).catch(() => null);
  goalChatAdd("assistant", await goalPlanHTML(g));
}
function gapLine(g, gap, season){
  if(season && season.days > 0){
    const perDay = Math.ceil(gap / season.days);
    return `That's <b>${gap} XP</b> in <b>${season.days}d</b> (season ends ${esc(season.end)}) → <b>+${perDay}/day</b>.`;
  }
  return `That's <b>${gap} XP</b> — steady +50/session pace gets you there.`;
}
function goalTitle(g){
  if(g.type === "xpower") return `${g.target} XP`;
  if(g.type === "rank") return `Rank #${g.target}`;
  if(g.type === "top500"){
    const modeLabel = (XRANK_MODES.find(m => m.key === g.mode) || {}).label || "";
    return `Top 500${modeLabel ? " · " + modeLabel : ""}`;
  }
  return g.title || "Custom goal";
}
function questNext(g){
  return (g.steps || []).find(s => !s.done) || null;
}
function goalFormSync(){
  const t = el("goal-type")?.value || "xpower";
  const xd = el("goal-xfields"), cd = el("goal-custom-fields");
  if(xd) xd.hidden = t === "custom" || t === "quest";
  if(cd) cd.hidden = t !== "custom" && t !== "quest";
  const ur = el("goal-unit-row");
  if(ur) ur.hidden = t !== "custom";
  const qf = el("goal-quest-fields");
  if(qf) qf.hidden = t !== "quest";
  const rp = el("goal-rank-picks");
  if(rp) rp.hidden = t !== "rank";
  const cx = el("goal-current-xp-row");
  if(cx) cx.hidden = t !== "rank";
  const cr = el("goal-current-row"), tr = el("goal-target-row");
  if(cr) cr.hidden = t === "quest";
  if(tr) tr.hidden = t === "quest" || t === "top500";
  const cur = el("goal-current");
  if(cur) cur.placeholder = t === "rank" ? "Your current rank number" : t === "custom" ? "Where you start (usually 0)" : t === "top500" ? "Your XP right now" : "Your XP right now";
}
function createGoal(){
  const type = el("goal-type")?.value || "xpower";
  if(type === "quest"){
    const title = (el("goal-title")?.value || "").trim() || "New quest";
    const steps = (el("goal-steps")?.value || "").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 20)
      .map(t => ({ t: t.slice(0, 140), done: false }));
    if(!steps.length){ el("goal-err").textContent = "Add at least one step, one per line."; return; }
    const g = { id: "g" + Date.now().toString(36), type, title, steps,
      history: [{ t: new Date().toISOString(), v: 0 }], createdAt: new Date().toISOString() };
    goals.unshift(g);
    saveGoals();
    el("goal-err").textContent = "";
    ["goal-title","goal-steps"].forEach(id => { const n = el(id); if(n) n.value = ""; });
    showView("goals");
    return;
  }
  const target = parseFloat(el("goal-target")?.value || "");
  const current = parseFloat(el("goal-current")?.value || "0") || 0;
  if(type !== "top500" && (!isFinite(target) || target <= 0)){ el("goal-err").textContent = "Enter a target above zero."; return; }
  const g = { id: "g" + Date.now().toString(36), type, target, current,
    history: [{ t: new Date().toISOString(), v: current }], createdAt: new Date().toISOString() };
  if(type === "custom"){
    g.title = (el("goal-title")?.value || "").trim() || "Custom goal";
    g.unit = (el("goal-unit")?.value || "").trim();
  } else {
    g.mode = el("goal-mode")?.value || "splatzones";
    g.div = el("goal-div")?.value || "p";
  if(type === "rank"){
    if(!isFinite(current) || current <= 0){ el("goal-err").textContent = "Enter your current rank."; return; }
    g.startRank = current;
    const cxp = parseFloat(el("goal-current-xp")?.value || "");
    if(isFinite(cxp) && cxp > 0) g.currentXP = cxp;
  }
  if(type === "top500"){
    g.mode = el("goal-mode")?.value || "splatzones";
    g.div = el("goal-div")?.value || "p";
    g.current = isFinite(current) ? current : 0;
    g.history = [{ t: new Date().toISOString(), v: g.current }];
  }
  }
  goals.unshift(g);
  saveGoals();
  el("goal-err").textContent = "";
  ["goal-title","goal-unit","goal-current","goal-current-xp","goal-target"].forEach(id => { const n = el(id); if(n) n.value = ""; });
  showView("goals");
}
function fmtGoalVal(g, v){
  if(g.type === "rank") return `#${v ?? "?"}`;
  if(g.type === "quest"){
    const done = (g.steps || []).filter(s => s.done).length;
    return `${done}/${(g.steps || []).length} steps`;
  }
  return `${v ?? 0}${g.unit ? " " + g.unit : ""}`;
}
const WATCH_KEY = "splatgpt.watched.v1";
const NOTIF_KEY = "splatgpt.notifications.v1";
let watched = [];
let notifications = [];
try{ watched = JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"); }catch{ watched = []; }
try{ notifications = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]"); }catch{ notifications = []; }
function saveWatched(){ try{ localStorage.setItem(WATCH_KEY, JSON.stringify(watched.slice(0,50))); }catch{} }
function saveNotifs(){ try{ localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications.slice(0,30))); }catch{} }
function watchKey(name, mode, div, season){ return `${div}/${season}/${mode}/${name}`; }
function isWatched(name, mode, div, season){ return watched.some(w => w.key === watchKey(name, mode, div, season)); }
function pushNotif(text, ref){
  notifications.unshift({ id: "n" + Date.now().toString(36) + Math.floor(Math.random()*999), text, time: new Date().toISOString(), read: false, ref: ref || null });
  notifications = notifications.slice(0, 30);
  saveNotifs();
  updateNotifBadge();
}
function updateNotifBadge(){
  const footer = el("notif-footer"), badge = el("notif-badge");
  const has = notifications.length > 0;
  if(footer) footer.hidden = !has;
  if(badge){
    const unread = notifications.filter(n => !n.read).length;
    badge.textContent = unread > 0 ? String(unread) : "";
    badge.hidden = unread === 0;
  }
  // mirror onto the floating pill, which has no footer to host the badge
  const pbtn = el("pill-notifs"), pbadge = el("pill-notif-badge");
  if(pbtn) pbtn.hidden = !has;
  if(pbadge){
    const unread = notifications.filter(n => !n.read).length;
    pbadge.textContent = unread > 0 ? String(unread) : "";
    pbadge.hidden = unread === 0;
  }
}
async function checkWatched(){
  if(!watched.length) return;
  // group by board file so each ranking JSON is fetched once
  const groups = {};
  for(const w of watched){
    const k = `${w.div}/${w.mode}/${w.season}`;
    (groups[k] = groups[k] || []).push(w);
  }
  for(const k of Object.keys(groups)){
    const [div, mode, seasonStr] = k.split("/");
    const season = parseInt(seasonStr,10);
    let edges = null;
    try{
      const seasons = await xrankSeasonList(div);
      if(seasons[0] !== season){
        for(const w of groups[k]){
          pushNotif(`${w.name}'s season ended — now tracking the new ${w.div === "a" ? "Tentatek" : "Takoroka"} season.`, { name: w.name, mode: w.mode, div: w.div, season: seasons[0] });
          w.season = seasons[0]; w.lastRank = null; w.lastXP = null;
        }
        saveWatched(); continue;
      }
      ({ edges } = await xrankFetch(mode, div, season));
    }catch{ continue; }
    if(!edges) continue;
    for(const w of groups[k]){
      const hit = edges.find(n => n.name === w.name);
      if(!hit) continue;
      const hitXP = Number(hit.xPower);
      const lastXP = Number(w.lastXP);
      if(w.lastRank != null && hit.rank !== w.lastRank){
        const dir = hit.rank < w.lastRank ? "climbed" : "dropped";
        pushNotif(`${w.name} ${dir} #${w.lastRank} → #${hit.rank} in ${w.modeLabel} (${w.divLabel}).`, { name: w.name, mode: w.mode, div: w.div, season: w.season });
      } else if(w.lastRank != null && hitXP !== lastXP){
        pushNotif(`${w.name} is now at ${hit.xPower} XP (was ${w.lastXP}) in ${w.modeLabel}.`, { name: w.name, mode: w.mode, div: w.div, season: w.season });
      }
      w.lastRank = hit.rank; w.lastXP = hitXP;
    }
    saveWatched();
  }
}
function renderNotifs(){
  const list = el("notifs-list");
  if(!list) return;
  notifications.forEach(n => { n.read = true; });
  saveNotifs(); updateNotifBadge();
  if(!notifications.length){ list.innerHTML = `<div class="empty-state"><i class="fa-regular fa-bell"></i><h3>No notifications</h3><p>Watch a player from their profile to get rank alerts here.</p></div>`; return; }
  list.innerHTML = "";
  notifications.forEach(n => {
    const row = document.createElement("div");
    row.className = "notif-item";
    const when = timeAgo(Date.now() - new Date(n.time).getTime());
    row.innerHTML = `<i class="fa-solid fa-bell"></i><span class="notif-text">${esc(n.text)}<small>${esc(when === "just now" ? "just now" : when)}</small></span>` +
      (n.ref ? `<button class="notif-open" data-notif-open="${esc(n.ref.name)}|${esc(n.ref.mode)}|${esc(n.ref.div)}|${esc(n.ref.season)}">View</button>` : "");
    const open = row.querySelector("[data-notif-open]");
    if(open) open.addEventListener("click", () => {
      const [name, mode, div, season] = open.dataset.notifOpen.split("|");
      openWatched(name, mode, div, parseInt(season,10));
    });
    list.appendChild(row);
  });
}
async function openWatched(name, mode, div, season){
  try{
    const { edges } = await xrankFetch(mode, div, season);
    const hit = edges.find(n => n.name === name);
    if(!hit){ addMsgSafe(`Couldn't find ${name} in that board anymore.`); return; }
    const pid = "pl" + (++playerSeq);
    playerCache[pid] = { node: hit, mode, div, season };
    playerReturn = "notifs";
    const box = el("player-detail");
    if(box) box.innerHTML = playerCard(playerCache[pid]);
    showView("player");
  }catch(e){ addMsgSafe(`Couldn't load that board (${e.message}).`); }
}
function addMsgSafe(html){
  showView("chat");
  addMsg("assistant", `<p>${html}</p>`);
}
setInterval(checkWatched, 15 * 60 * 1000);

/* ---------- player detail (splashtag, kit, badges) ---------- */
let playerReturn = "chat";
function openPlayer(pid, origin){
  const hit = playerCache[pid];
  if(!hit){
    // cache miss (pruned or restored from an old chat): rebuild what we can from the DOM
    const btn = document.querySelector(`[data-player="${pid}"]`);
    if(!btn) return;
    const rank = parseInt(btn.closest(".rank-row")?.querySelector(".rank")?.textContent || "0", 10) || null;
    playerCache[pid] = { node: { name: btn.childNodes[0]?.textContent?.trim() || "", rank, xPower: parseInt((btn.closest(".rank-row")?.querySelector(".rank-xp")?.textContent || "0").replace(/[^0-9.]/g, ""), 10) || 0, weapon: { name: btn.querySelector("small")?.textContent || "" } },
      mode: btn.closest("[data-xdivs]")?.querySelector("[data-xdivs].active")?.dataset.xdivs || livePrefs.mode,
      div: btn.closest("[data-xdivs]")?.querySelector("[data-xdivs].active")?.dataset.xdivs || livePrefs.div,
      season: parseInt(btn.closest("[data-xseasons]")?.querySelector("[data-xseasons]")?.value || "0", 10) || 0 };
  }
  playerReturn = origin === "live" ? "live" : origin === "notifs" ? "notifs" : "chat";
  const box = el("player-detail");
  if(box) box.innerHTML = playerCard(hit);
  tickWidgets();
  showView("player");
  if(playerReturn === "live") liveSection = "top500";
}
function stagTextColor(tc){
  if(!tc) return "#fff";
  const f = (v) => Math.round((v ?? 1) * 255);
  return `rgba(${f(tc.r)},${f(tc.g)},${f(tc.b)},${tc.a ?? 1})`;
}
function playerCard({ node: n, mode, div, season }){
  const modeLabel = (XRANK_MODES.find(m => m.key === mode) || {}).label || mode;
  const divLabel = (XRANK_DIVS.find(d => d.key === div) || {}).label || div;
  const meta = xrankMeta[div];
  const seasons = xrankSeasons[div] || [season];
  const seasonTxt = seasonLabel(div, season, seasons[0], meta || null);
  const w = n.weapon || {};
  const sub = w.subWeapon || {}, sp = w.specialWeapon || {};
  const trend = n.rankDiff === "UP" ? `<span class="trend up"><i class="fa-solid fa-arrow-trend-up"></i> up</span>`
    : n.rankDiff === "DOWN" ? `<span class="trend down"><i class="fa-solid fa-arrow-trend-down"></i> down</span>`
    : n.rankDiff ? `<span class="trend flat"><i class="fa-solid fa-minus"></i> steady</span>` : "";
  const badges = ((n.nameplate || {}).badges || []).filter(b => b?.image?.url).slice(0, 3);
  const bg = n.nameplate?.background?.image?.url || "";
  const tc = stagTextColor(n.nameplate?.background?.textColor);
  const tag = bg
    ? `<div class="splashtag" style="background-image:url('${bg}')">` +
      (n.byname ? `<span class="stag-title" style="color:${tc}">${esc(n.byname)}</span>` : "") +
      `<span class="stag-name" style="color:${tc}">${esc(n.name)}</span>` +
      `<span class="stag-id" style="color:${tc}">#${esc(n.nameId || "")}</span>` +
      (badges.length ? `<span class="stag-badges">${badges.map(b => `<img src="${b.image.url}" alt="badge" loading="lazy"/>`).join("")}</span>` : "") +
      `</div>`
    : `<div class="player-hero"><span class="rank ${rankMedal(n.rank)} big">${n.rank}</span>` +
      `<div><div class="player-name">${esc(n.name)} <span class="player-id">#${esc(n.nameId || "")}</span></div>` +
      (n.byname ? `<div class="player-title">“${esc(n.byname)}”</div>` : "") + `</div></div>`;
  return tag +
    `<div class="player-subhead"><span class="rank ${rankMedal(n.rank)}">#${n.rank}</span>` +
    `<span class="player-xp">${esc(String(n.xPower))} XP</span> ${trend} ${n.weaponTop ? `<span class="tag"><i class="fa-solid fa-star"></i> top of weapon</span>` : ""}` +
    `<button class="watch-btn${isWatched(n.name, mode, div, season) ? " watching" : ""}" data-watch="${esc(n.name)}|${esc(mode)}|${esc(div)}|${esc(String(season))}|${n.rank}|${esc(String(n.xPower))}"><i class="fa-solid fa-bell"></i> ${isWatched(n.name, mode, div, season) ? "Watching" : "Watch"}</button></div>` +
    `<div class="player-kit">` +
    (w.image3d?.url || w.image?.url ? `<img class="player-weapon" src="${w.image3d?.url || w.image.url}" alt="${esc(w.name||"")}" loading="lazy"/>` : "") +
    `<div><div class="player-weapon-name">${esc(w.name || "")}</div>` +
    (sub.name ? `<div class="player-sub"><img src="${sub.image?.url || ""}" alt="" loading="lazy" onerror="this.remove()"/> ${esc(sub.name)}</div>` : "") +
    (sp.name ? `<div class="player-sub"><img src="${sp.image?.url || ""}" alt="" loading="lazy" onerror="this.remove()"/> ${esc(sp.name)}</div>` : "") +
    `</div></div>` +
    `<p class="muted">${esc(modeLabel)} · ${esc(divLabel)} · ${esc(seasonTxt)}</p>`;
}
document.addEventListener("click", e => {
  const w = e.target.closest("[data-watch]");
  if(w){
    const [name, mode, div, seasonStr, rankStr, xpStr] = w.dataset.watch.split("|");
    const season = parseInt(seasonStr,10), rank = parseInt(rankStr,10);
    const key = watchKey(name, mode, div, season);
    const ix = watched.findIndex(x => x.key === key);
    if(ix >= 0){ watched.splice(ix,1); saveWatched(); }
    else{
      watched.unshift({ key, name, mode, div, season, lastRank: rank, lastXP: parseFloat(xpStr),
        modeLabel: (XRANK_MODES.find(m => m.key === mode) || {}).label || mode,
        divLabel: (XRANK_DIVS.find(d => d.key === div) || {}).label || div,
        addedAt: new Date().toISOString() });
      watched = watched.slice(0,50);
      saveWatched();
    }
    const box = el("player-detail");
    const pid = Object.keys(playerCache).find(k => playerCache[k].node.name === name);
    if(box && pid) box.innerHTML = playerCard(playerCache[pid]);
    return;
  }
  const b = e.target.closest("[data-player]");
  if(!b || !playerCache[b.dataset.player]) return;
  openPlayer(b.dataset.player, b.dataset.origin);
});
on("player-back", "click", () => showView(playerReturn === "live" ? "live" : playerReturn === "notifs" ? "notifs" : "chat"));
on("schedule-back", "click", () => showView("live", "rotations"));

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

/* ---------- result widgets + carousel ---------- */
const CAT_META = {
  weapons: { label: "Weapon", icon: "fa-crosshairs" },
  weapon_stats: { label: "Weapon", icon: "fa-crosshairs" },
  maps: { label: "Map", icon: "fa-map" },
  modes: { label: "Mode", icon: "fa-gamepad" },
  story_logs: { label: "Story", icon: "fa-book-open" },
  salmonids: { label: "Salmonid", icon: "fa-fish" },
  gear: { label: "Gear", icon: "fa-shirt" },
  abilities: { label: "Ability", icon: "fa-bolt" },
};
function weaponPhoto(item, st){
  const avif = st?.image || item.image || "";
  const png = st?.image_png || item.image_png || "";
  const src = avif || png;
  const tile = `<span class="weapon-photo fallback"><i class="fa-solid fa-crosshairs"></i></span>`;
  if(!src) return `<span class="weapon-photo-wrap no-img">${tile}</span>`;
  const inner = (avif && png)
    ? `<picture><source srcset="${avif}" type="image/avif"/><img class="weapon-photo" src="${png}" alt="${esc(item.name)}" loading="lazy" onerror="this.closest('.weapon-photo-wrap').classList.add('no-img')"/></picture>`
    : `<img class="weapon-photo" src="${src}" alt="${esc(item.name)}" loading="lazy" onerror="this.closest('.weapon-photo-wrap').classList.add('no-img')"/>`;
  return `<span class="weapon-photo-wrap">${tile}${inner}</span>`;
}
function weaponWidget(item){
  const st = item.special_points !== undefined ? item : statForWeapon(item.name);
  const sub = st?.sub || item.sub || "?", sp = st?.special || item.special || "?";
  const bits = [];
  if(st?.special_points) bits.push(`<b>${esc(String(st.special_points))}p</b> special`);
  if(st?.unlock_rank != null && st.unlock_rank >= 0) bits.push(`<b>Rank ${esc(String(st.unlock_rank))}</b>`);
  if(st?.range) bits.push(`<b>${esc(String(st.range))}</b> range`);
  if(currentGame === "Splatoon3") bits.push(`<b>1×</b> Sheldon ticket`);
  if(st?.season != null) bits.push(st.season === 0 ? `<b>Launch</b> kit` : `<b>Season ${esc(String(st.season))}</b>`);
  return `<div class="weapon-widget">` +
    `<div class="weapon-head">` +
    weaponPhoto(item, st) +
    `<div class="weapon-headtext"><div class="weapon-name">${esc(item.name)}</div>` +
    `<div class="weapon-class-row"><span class="weapon-class"><i class="fa-solid fa-crosshairs"></i> ${esc(item.class || "Weapon")}</span></div>` +
    `<div class="weapon-kit"><span>${esc(sub)}</span><span class="kit-arrow">+</span><span>${esc(sp)}</span></div></div></div>` +
    (bits.length ? `<div class="stat-strip">${bits.join("<span class='dot'>•</span>")}</div>` : "") +
    (item.notes ? `<p class="weapon-notes">${esc(item.notes)}</p>` : "") +
    `<a class="weapon-builds" href="https://sendou.ink/builds/${sendouSlug(item.name)}" target="_blank" rel="noopener"><i class="fa-solid fa-shirt"></i> Community builds on sendou.ink</a></div>`;
}
function detailWidget(icon, title, tag, body){
  return `<div class="detail-widget"><div class="detail-top"><span class="detail-icon"><i class="fa-solid ${icon}"></i></span>` +
    `<span class="detail-name">${esc(title)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>` +
    `<div class="detail-body">${body}</div></div>`;
}
function resultWidget(hit){
  const { cat, item } = hit;
  if(cat === "weapons" || cat === "weapon_stats") return weaponWidget(item);
  if(cat === "gear") return gearCard(item);
  if(cat === "maps") return detailWidget("fa-map", item.name, "", esc(item.description || ""));
  if(cat === "modes") return detailWidget("fa-gamepad", item.name, item.ranked ? "Ranked" : "Casual", esc(item.description || ""));
  if(cat === "salmonids") return detailWidget("fa-fish", item.name, item.category || "", `Golden eggs on kill: <b>${esc(String(item.golden_eggs_on_kill ?? "?"))}</b>`);
  if(cat === "abilities") return detailWidget("fa-bolt", item.name, "", esc(item.description || ""));
  return detailWidget("fa-book-open", item.title || "Record", item.location || "", esc(item.text_summary || ""));
}
function initCarousel(msg, hits){
  const box = msg.querySelector("[data-carousel]");
  const pos = msg.querySelector("[data-car-pos]");
  const prev = msg.querySelector("[data-car-prev]");
  const next = msg.querySelector("[data-car-next]");
  if(!box || !pos || !prev || !next || !hits.length) return;
  let idx = 0;
  const paint = () => {
    box.innerHTML = resultWidget(hits[idx]);
    const meta = CAT_META[hits[idx].cat] || { label: "Result" };
    pos.textContent = `${idx + 1} of ${hits.length} · ${meta.label}`;
    chat.scrollTop = chat.scrollHeight;
  };
  prev.addEventListener("click", () => { idx = (idx - 1 + hits.length) % hits.length; paint(); });
  next.addEventListener("click", () => { idx = (idx + 1) % hits.length; paint(); });
  paint();
}
function showSearchCarousel(hits){
  const msg = addMsg("assistant", `<h3>Top match</h3><div data-carousel></div>` +
    `<div class="carousel-nav"><button data-car-prev aria-label="Previous result"><i class="fa-solid fa-arrow-left"></i></button>` +
    `<span data-car-pos></span>` +
    `<button data-car-next aria-label="Next result"><i class="fa-solid fa-arrow-right"></i></button></div>`);
  if(!msg) return;
  initCarousel(msg, hits);
}
/* ---------- notes (local only) ---------- */
const NOTES_KEY = "splatgpt.notes.v1";
let notes = [];
try{ notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); }catch{ notes = []; }
function saveNotes(){ try{ localStorage.setItem(NOTES_KEY, JSON.stringify(notes.slice(0,100))); }catch{} }
function notesListHTML(){
  if(!notes.length) return `<div class="empty-state"><i class="fa-regular fa-note-sticky"></i><h3>No notes yet</h3><p>Tell me <b>“note …”</b> and I'll keep it here.</p></div>`;
  return `<div class="notes-list">` + notes.map((n) =>
    `<div class="notif-item"><i class="fa-regular fa-note-sticky"></i>` +
    `<span class="notif-text">${esc(n.text)}<small>${esc(new Date(n.t).toLocaleString())}</small></span>` +
    `<button class="notif-open" data-note-del="${n.id}">Forget</button></div>`
  ).join("") + `</div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-note-del]");
  if(!b) return;
  notes = notes.filter(n => n.id !== b.dataset.noteDel);
  saveNotes();
  const scope = b.closest(".bubble, .settings-card");
  if(scope){
    const old = scope.querySelector(".notes-list, .empty-state");
    const tmp = document.createElement("div");
    tmp.innerHTML = notesListHTML();
    const fresh = tmp.firstChild;
    if(old && fresh) old.replaceWith(fresh);
    const head = scope.querySelector("h3");
    if(head && head.textContent.startsWith("Saved notes")) head.textContent = `Saved notes (${notes.length})`;
  }
  renderProfileNotes();
});
function renderProfileNotes(){
  const box = el("profile-notes");
  if(box) box.innerHTML = notes.length
    ? notes.slice(0,5).map(n => `• ${esc(n.text)}`).join("<br/>") + (notes.length > 5 ? `<br/><span class="muted">+${notes.length - 5} more — ask “my notes” in chat.</span>` : "")
    : "None yet — tell me “note …” in chat.";
}
function handleNotes(q){
  const t = q.trim();
  let m = t.match(/^(?:note|remember|write down|jot down)[:\s]+(.+)/);
  if(m && m[1].trim()){
    notes.unshift({ id: "n" + Date.now().toString(36), text: m[1].trim().slice(0, 280), t: new Date().toISOString() });
    saveNotes(); renderProfileNotes(); track("notes");
    addMsg("assistant", `<p>Noted — <b>${esc(notes[0].text)}</b>. Ask “my notes” anytime to review.</p>`);
    return true;
  }
  if(/^(my notes|show( me)? notes|list notes|what are my notes|show what you (noted|remember))$/.test(t)){
    track("notes");
    addMsg("assistant", `<h3>Saved notes (${notes.length})</h3>` + notesListHTML());
    return true;
  }
  m = t.match(/^(?:forget|delete|remove)(?: note)? #?(\d+)$/);
  if(m){
    const i = parseInt(m[1],10) - 1;
    if(notes[i]){ const gone = notes.splice(i,1)[0]; saveNotes(); renderProfileNotes(); addMsg("assistant", `<p>Forgot note #${m[1]} (“${esc(gone.text)}”).</p>`); }
    else addMsg("assistant", `<p>There's no note #${m[1]} — you have ${notes.length}.</p>`);
    return true;
  }
  return false;
}
function smallTalk(text){
  const t = text.toLowerCase().trim().replace(/[!.?~]+$/,"").trim();
  const f = profile.facts || {};
  const greet = () => {
    const bits = [];
    if(f.name) bits.push(esc(f.name));
    const known = [];
    if(f.weapon) known.push(`your ${esc(f.weapon)}`);
    if(f.mode) known.push(`${esc(f.mode)}`);
    if(f.div) known.push(`${esc(f.div)}`);
    if(!bits.length && !known.length) return "Hello!";
    return bits.length && known.length
      ? `Hello, ${bits[0]} — ${known.join(", ")}.`
      : bits.length ? `Hello, ${bits[0]}!` : `Hello! Still remember ${known.join(", ")}.`;
  };
  if(/^(hi|hello|hey|yo|sup|howdy|hiya|hello there|hey there|hi there)$/.test(t))
    return `<p>${greet()} Ask about literally anything Splatoon related.</p>`;
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
let settings = { theme: "dark", accent: "ink", customAccent: "#6e8bff", sendouToken: "", navMode: "sidebar", navPos: "left", buildsMode: "startup", buildsSize: "large", homeOnLaunch: true };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch {}
function saveSettings(){ try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
function applySettings(){
  document.body.dataset.theme = settings.theme === "light" ? "light" : "dark";
  document.body.dataset.accent = settings.accent || "ink";
  if(settings.accent === "custom" && /^#[0-9a-f]{6}$/i.test(settings.customAccent || "")){
    document.body.style.setProperty("--accent", settings.customAccent);
    document.body.style.setProperty("--accent-soft", settings.customAccent + "26");
  } else {
    document.body.style.removeProperty("--accent");
    document.body.style.removeProperty("--accent-soft");
  }
  const ts = el("setting-theme"); if(ts) ts.value = settings.theme;
  const tk = el("setting-sendou-token"); if(tk && document.activeElement !== tk) tk.value = settings.sendouToken || "";
  const cc = el("setting-custom-color"); if(cc && document.activeElement !== cc) cc.value = settings.customAccent || "#6e8bff";
  document.querySelectorAll("[data-accent-pick]").forEach(b => b.classList.toggle("active", b.dataset.accentPick === settings.accent));
  const hl = el("setting-home-launch"); if(hl) hl.value = settings.homeOnLaunch === false ? "chat" : "home";
  applyNavMode();
}

/* ---------- builds fetcher mode ---------- */
const BUILD_MODES = ["startup", "ondemand", "off"];
function buildsMode(){ return BUILD_MODES.includes(settings.buildsMode) ? settings.buildsMode : "startup"; }
function buildsTier(){
  return settings.buildsSize === "large" ? { file: "data/builds-large.json", label: "7.2 MB" } : { file: "data/builds.json", label: "1.3 MB" };
}
function syncBuildsFields(){
  const sel = el("setting-builds");
  if(sel) sel.value = buildsMode();
  const sz = el("setting-builds-size");
  if(sz) sz.value = settings.buildsSize === "large" ? "large" : "1";
  const st = el("setting-builds-state");
  if(!st) return;
  if(buildsMode() === "off"){ st.textContent = "Off — kits won't be downloaded"; return; }
  const tier = buildsTier();
  if(buildsData){
    const wn = Object.keys(buildsData.weapons || {}).length;
    const n = Object.values(buildsData.weapons || {}).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
    st.textContent = `Loaded ${tier.label} — ${wn} weapons, ${n.toLocaleString("en-US")} kits`;
  } else {
    st.textContent = `Not loaded yet (${tier.label})`;
  }
}

/* ---------- navigation style: sidebar vs floating pill ---------- */
const NAV_POS = ["top", "left", "right", "bottom"];
function applyNavMode(){
  const mode = settings.navMode === "pill" ? "pill" : "sidebar";
  const pos = NAV_POS.includes(settings.navPos) ? settings.navPos : "left";
  document.body.dataset.nav = mode;
  document.body.dataset.navPos = pos;
  if(mode === "pill") document.body.classList.remove("collapsed");
  syncNavPicks();
}
function syncNavPicks(){
  document.querySelectorAll("[data-nav-mode]").forEach(b => b.classList.toggle("active", b.dataset.navMode === (settings.navMode === "pill" ? "pill" : "sidebar")));
  document.querySelectorAll("[data-nav-pos]").forEach(b => b.classList.toggle("active", b.dataset.navPos === (NAV_POS.includes(settings.navPos) ? settings.navPos : "left")));
  const pf = el("nav-pos-field");
  if(pf) pf.hidden = settings.navMode !== "pill";
}

/* ---------- learned preferences (stored locally, never uploaded) ---------- */
const PROFILE_KEY = "splatgpt.profile.v1";
let profile = { topics:{}, weapons:{}, modes:{}, divs:{}, games:{}, chats:0, firstSeen:null, facts:{}, style:[], msgs:0 };
try{ profile = { ...profile, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") }; }catch{}
if(!profile.firstSeen){ profile.firstSeen = new Date().toISOString(); }
function saveProfile(){ try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }catch{} }
const FACT_LABELS = { name:"Name", weapon:"Main weapon", mode:"Favourite mode", div:"Division", skill:"Experience", style:"Reply style" };
/* Only first-person phrasings count — otherwise a query like "top 500" would
 * be mistaken for a statement about the user's own play style. */
const SKILL_WORDS = {
  casual: /\bi(?:'m| am)?\s+(?:casual|just (?:here )?for fun|not too serious|chill|relaxed|really bad|bad)\b/i,
  competitive: /\bi(?:'m| am)?\s+(?:a )?(?:competitive|competitive player|grinder|tryhard)\b|\bi (?:grind|push|climb|tilt|compete)\b/i,
  regular: /\bi (?:play|grind|practice)\s+(?:every|most|almost)\s+(?:day|days|week|weeks)\b/i,
};
/* Learn durable facts about the user from free text. Anything the assistant
 * learns lives in profile.facts and is echoed back in Settings → About you. */
function learnFacts(text){
  const t = String(text || "");
  if(!t.trim()) return [];
  const found = [];
  if(!profile.facts || typeof profile.facts !== "object") profile.facts = {};
  const setFact = (k, v) => {
    v = String(v || "").trim().replace(/[.!?,;]+$/,"").slice(0, 60);
    if(!v || profile.facts[k] === v) return;
    profile.facts[k] = v; found.push([k, v]);
  };
  let m = t.match(/\b(?:my name is|i am called|call me|i'm called|name'?s|this is)\s+([A-Za-z][\w'’-]{1,24})/i);
  if(m && !/\b(splatgpt|the app)\b/i.test(m[1])) setFact("name", m[1]);
  m = t.match(/\b(?:my main is|main weapon is|i main|i play|i use|i run|i use my)\s+(?:the\s+)?([A-Za-z0-9][\w'’\-. ]{1,28})/i);
  if(m){
    const hit = findWeapon(m[1]);
    if(hit) setFact("weapon", hit.name);
  }
  m = t.match(/\b(?:my favou?rite|favou?rite|preferred|prefer|best|main|usual)\s+(?:game\s+)?mode\s+(?:is\s+)?(.+?)(?:\.|,|$)/i)
    || t.match(/\bmy mode is\s+(.+?)(?:\.|,|$)/i)
    || t.match(/\bi (?:usually |mostly |mainly |normally )?(?:play|push|queue)\s+(.+?)(?:\s+in\b.*)?(?:\.|,|$)/i);
  if(m && m[1] && m[1].trim().length > 2){
    const needle = m[1].toLowerCase();
    const hit = (localData.modes || []).find(x => x.name && needle.includes(x.name.toLowerCase()))
      || (localData.modes || []).find(x => x.name && x.name.toLowerCase().includes(needle));
    if(hit) setFact("mode", hit.name);
  }
  // People mention both divisions when they compare or correct themselves
  // ("I was Takoroka but I'm Tentatek now"), so the *last* mention wins.
  // Pure questions ("is tentatek harder than takoroka") are not statements about
  // the user, so they must not overwrite what we already know.
  const hits = [...t.matchAll(/\b(takoroka|tentatek|tako|tenta)\b/gi)];
  if(hits.length && (hits.length === 1 || /\b(i|i'm|im|my|me|mine)\b/i.test(t))){
    const w = hits[hits.length - 1][1].toLowerCase();
    setFact("div", /tenta/.test(w) ? "Tentatek" : "Takoroka");
  }
  for(const [k, re] of Object.entries(SKILL_WORDS)) if(re.test(t)) setFact("skill", k);
  m = t.match(/\b(?:keep|make|give me)\s+(?:it|your replies?|things?)\s+(short|brief|concise|simple|to the point)\b/i);
  if(m && addStyleFact("short replies")) found.push(["style", "short replies"]);
  m = t.match(/\b(?:don'?t|do not|stop|no more)\s+(.+?)\s*(?:please)?[.!]*$/i);
  if(m && /long|ramble|monologue|wall of text|lecture/i.test(m[1]) && addStyleFact("no long monologues")) found.push(["style", "no long monologues"]);
  if(found.length){ saveProfile(); }
  return found;
}
function addStyleFact(s){
  s = String(s || "").trim().slice(0, 60);
  if(!s) return false;
  profile.style = profile.style || [];
  if(profile.style.includes(s)) return false;
  profile.style.push(s); saveProfile();
  return true;
}
/* True when a message is the user telling us about themselves rather than
 * asking for data — so we can acknowledge instead of running a search. */
function isSelfStatement(text){
  const t = String(text || "").toLowerCase().trim();
  return /^(?:hi|hey|hello|yo|ok|okay|thanks|thank you)?,?\s*(?:my name is|i am called|call me|i'm called|name'?s|this is|i main|my main is|main weapon is|i play|i use|i run|my mode is|my favou?rite|my division is|i(?:'m| am)? (?:in|playing in|play in|usually|mostly|mainly|competitive|a grind)|keep it|make it|don't|do not|no more)\b/.test(t)
    || /(?:keep|make|give me)\s+(?:it|your replies?|things?)\s+(?:short|brief|concise|simple|to the point)/i.test(t)
    || /^(?:don't|do not|stop|no more)\b/i.test(t);
}
function factCount(){ return Object.keys(profile.facts || {}).length + (profile.style || []).length + (profile.msgs || 0); }
function youName(){
  const n = (profile.facts || {}).name;
  return n ? String(n) : null;
}
function addressUser(){
  const n = youName();
  return n ? `${esc(n)}` : "you";
}
function brevityHint(){
  const s = (profile.style || []).join(" ").toLowerCase();
  return /short|brief|concise|to the point|no long/.test(s);
}
function syncMeFields(){
  const f = profile.facts || {};
  const nm = el("setting-me-name"); if(nm && document.activeElement !== nm) nm.value = f.name || "";
  const wp = el("setting-me-weapon"); if(wp && document.activeElement !== wp) wp.value = f.weapon || "";
  const md = el("setting-me-mode"); if(md && document.activeElement !== md) md.value = f.mode || "";
  const dv = el("setting-me-div"); if(dv) dv.value = f.div || "";
  const sk = el("setting-me-skill"); if(sk) sk.value = f.skill || "";
  renderMeChips();
}
/* ---------- my player card (SplatTag name + SplatNet ID) ---------- */
function myPlayerCard(){
  const p = profile.player || {};
  return { name: (p.name || "").trim(), id: (p.id || "").trim() };
}
function syncPlayerFields(){
  const p = myPlayerCard();
  const n = el("setting-player-name"); if(n && document.activeElement !== n) n.value = p.name;
  const i = el("setting-player-id"); if(i && document.activeElement !== i) i.value = p.id;
}
function savePlayerCard(){
  const n = el("setting-player-name"), i = el("setting-player-id");
  const name = (n?.value || "").trim();
  let id = (i?.value || "").replace(/\D/g, "").slice(0, 12);
  const err = [];
  if(id && id.length < 8) err.push("SplatNet ID should be about 8 digits");
  if(err.length){
    const ok = el("setting-player-saved");
    if(ok){ ok.textContent = err[0]; return; }
  }
  profile.player = { name, id };
  saveProfile();
  if(i) i.value = id;
  renderMeCard(); renderHome();
  const ok = el("setting-player-saved");
  if(ok){ ok.textContent = "Saved."; setTimeout(() => { ok.textContent = ""; }, 2000); }
}
function playerMatches(node){
  const p = myPlayerCard();
  if(!p.name && !p.id) return false;
  const nm = String(node?.name || "").toLowerCase();
  const id = node?.id != null ? String(node.id) : null;
  if(p.id && id && p.id === id) return true;
  if(p.name && nm === p.name.toLowerCase()) return true;
  if(p.name && nm.replace(/[\s_]+/g, "") === p.name.replace(/[\s_]+/g, "").toLowerCase()) return true;
  return false;
}
function renderMeCard(){
  const box = el("me-card");
  if(!box) return;
  const p = myPlayerCard();
  if(!p.name && !p.id){
    box.innerHTML = `<div class="settings-card"><h3><i class="fa-solid fa-id-card"></i> My player</h3>` +
      `<p class="muted">Nothing saved yet. Add your SplatTag name and SplatNet ID in <b>Settings → My player card</b>, and you'll be able to look yourself up on the X Power boards from here.</p></div>`;
    return;
  }
  const line = (k, v) => `<div class="profile-line"><span>${k}</span><span>${v}</span></div>`;
  const selfWatched = (watched || []).filter(w => w.self || (!p.name || String(w.name || "").toLowerCase() === p.name.toLowerCase()));
  const last = (profile.player || {}).last || {};
  const ranks = Object.values(last).filter(v => v && v.rank != null);
  const best = ranks.length ? ranks.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
  box.innerHTML = `<div class="settings-card"><h3><i class="fa-solid fa-id-card" style="color:var(--accent)"></i> ${esc(p.name || "Your player")}</h3>` +
    line("SplatTag", p.name ? esc(p.name) : `<span class="muted">not set</span>`) +
    line("SplatNet ID", p.id ? `<code>${esc(p.id)}</code>` : `<span class="muted">not set</span>`) +
    line("Main weapon", esc((profile.facts || {}).weapon || "not set")) +
    line("Division", esc((profile.facts || {}).div || "not set")) +
    line("Best rank seen", best ? `<span class="rank ${rankMedal(best.rank)}">${best.rank}</span>` : `<span class="muted">run a lookup</span>`) +
    line("Boards watched", selfWatched.length
      ? `${selfWatched.length} · <button id="me-unwatch" class="link-btn">stop watching</button>`
      : `<span class="muted">none</span>`) +
    ((profile.player || {}).lastChecked ? line("Last checked", esc(new Date(profile.player.lastChecked).toLocaleString())) : "") +
    `<p class="muted">Stored in this browser only. Change it in Settings → My player card.</p></div>`;
}
/* Search the latest X Power board per mode for the saved player.
 * Results are stashed on meBoards so the Watch buttons below can act on them. */
let meBoards = [];
async function lookupMeOnBoards(){
  const out = el("me-lookup-out"), st = el("me-lookup-state");
  const p = myPlayerCard();
  if(!p.name && !p.id){
    if(st) st.textContent = "Set your name or ID in Settings first.";
    return;
  }
  if(out) out.innerHTML = `<div class="skeleton-card"><div class="sk sk-row"></div><div class="sk sk-row"></div></div>`;
  if(st) st.textContent = "Searching…";
  const known = detectDiv((profile.facts || {}).div || "");
  // no division on file? check both rather than silently assuming Takoroka
  const divs = known ? [known] : ["p", "a"];
  const divNames = { p: "Takoroka", a: "Tentatek" };
  const found = [];
  for(const div of divs){
    for(const mode of XRANK_MODES){
      try{
        const { season, edges } = await xrankFetch(mode.key, div);
        const hit = edges.find(playerMatches);
        if(hit && !found.some(f => f.div === div && f.mode.key === mode.key))
          found.push({ mode, modeLabel: mode.label, hit, season, div, total: Math.max(500, edges.length) });
      }catch{}
      if(st) st.textContent = `Searching ${divNames[div]}…`;
    }
  }
  meBoards = found;
  if(st) st.textContent = found.length ? `${found.length} board${found.length > 1 ? "s" : ""} found` : "Not in the latest boards";
  if(!out) return;
  if(!found.length){
    out.innerHTML = `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>No match</h3><p>Not in the latest ${divs.map(d => divNames[d]).join(" or ")} Top 500 for any mode. Only the latest season is archived — try again after the next rotation.</p></div>`;
    return;
  }
  // remember where we were last time so the card can show movement
  const prev = profile.player?.last || {};
  const now = {};
  for(const f of found) now[f.mode.key] = { rank: f.hit.rank, xp: Number(f.hit.xPower ?? f.hit.x_power) };
  profile.player = { ...(profile.player || {}), last: now, lastChecked: new Date().toISOString() };
  saveProfile();
  out.innerHTML = found.map(f => meBoardHTML(f, prev[f.mode.key])).join("");
  renderMeCard();
  if(st && found.length) st.innerHTML = `Found · <button id="me-watch-all" class="link-btn"><i class="fa-solid fa-bell"></i> Watch all ${found.length}</button>`;
}
function meBoardHTML(f, before){
  const { hit, season, div, total } = f;
  const pct = total ? ((hit.rank / total) * 100).toFixed(1) : "—";
  const xp = Number(hit.xPower ?? hit.x_power);
  const watching = isWatched(hit.name, f.mode.key, div, season);
  let delta = "";
  if(before && before.rank != null && before.rank !== hit.rank){
    const up = hit.rank < before.rank;
    delta = ` <span class="hw-delta ${up ? "up" : "down"}" title="was #${before.rank}">${up ? "▲" : "▼"} ${Math.abs(before.rank - hit.rank)}</span>`;
  } else if(before && before.xp != null && isFinite(xp) && xp > before.xp){
    delta = ` <span class="hw-delta up" title="was ${Math.round(before.xp)} XP">▲ ${Math.round(xp - before.xp)} XP</span>`;
  }
  const watching2 = watching
    ? `<button class="watch-btn watching" data-me-watch="${esc(hit.name)}|${esc(f.mode.key)}|${esc(div)}|${season}|${hit.rank}|${xp}"><i class="fa-solid fa-bell"></i> Watching</button>`
    : `<button class="watch-btn" data-me-watch="${esc(hit.name)}|${esc(f.mode.key)}|${esc(div)}|${season}|${hit.rank}|${xp}"><i class="fa-solid fa-bell"></i> Watch</button>`;
  return `<div class="mini-card me-board"><b>${esc(hit.name)}</b> · ${esc(f.modeLabel)}<br/>` +
    `<span class="rank ${rankMedal(hit.rank)}">${hit.rank}</span>${delta} of ${total} (top ${pct}%) · <b>${isFinite(xp) ? xp.toLocaleString("en-US") : "?"} XP</b><br/>` +
    `${hit.weapon?.name ? `${esc(hit.weapon.name)} · ` : ""}<span class="muted">season ${div}-${season}</span> ${watching2}</div>`;
}
/* Both of these buttons are re-rendered on every lookup, so they are wired by
 * delegation rather than bound once at load. */
document.addEventListener("click", e => {
  if(e.target.closest("#me-watch-all")){ watchAllMeBoards(); return; }
  const un = e.target.closest("#me-unwatch");
  if(un){ unwatchMe(); return; }
  const w = e.target.closest("[data-me-watch]");
  if(!w) return;
  const [name, mode, div, seasonStr, rankStr, xpStr] = w.dataset.meWatch.split("|");
  watchMe({ name, mode, div, season: parseInt(seasonStr, 10), rank: parseInt(rankStr, 10), xp: parseFloat(xpStr) });
});
/* Register the saved player on the boards so the normal rank-alert system
 * reports movement without needing a separate self-tracking loop. */
function watchMe(board){
  const { name, mode, div, season, rank, xp } = board;
  const key = watchKey(name, mode, div, season);
  const ix = watched.findIndex(x => x.key === key);
  if(ix >= 0){ watched.splice(ix, 1); }
  else{
    watched.unshift({ key, name, mode, div, season, lastRank: rank, lastXP: xp, self: true,
      modeLabel: (XRANK_MODES.find(m => m.key === mode) || {}).label || mode,
      divLabel: (XRANK_DIVS.find(d => d.key === div) || {}).label || div,
      addedAt: new Date().toISOString() });
    watched = watched.slice(0, 50);
  }
  saveWatched();
  const out = el("me-lookup-out");
  if(out) out.innerHTML = meBoards.map(f => meBoardHTML(f, (profile.player?.last || {})[f.mode.key])).join("");
  const st = el("me-lookup-state");
  if(st && meBoards.length) st.innerHTML = `Found · <button id="me-watch-all" class="link-btn"><i class="fa-solid fa-bell"></i> Watch all ${meBoards.length}</button>`;
  renderMeCard();
}

/* ---------- home dashboard: draggable, resizable, user-arranged widgets ----------
   Layout lives in localStorage as [{id, type, w, h}] — a free grid where the
   user drops widgets wherever they like. Position is implicit in the array
   order; size is per-widget columns/rows.
*/
const HOME_KEY = "splatgpt.home.v2";
const HOME_GRID = 8;   // snap granularity in px
let homeLayout = null;
let homeEditing = false;
/* Free-form placement: each widget carries its own x/y/w/h in px, so cards can
 * sit anywhere rather than snapping to columns. Defaults are roomy because the
 * rotation widgets need real height to show a map image legibly. */
const DEFAULT_SIZES = { clock: [220, 104], xbattle: [560, 300], me: [260, 200], goals: [260, 140],
  notes: [360, 150], builds: [520, 240], salmon: [520, 300], chats: [220, 140], about: [300, 150], stats: [260, 140] };
const DEFAULT_HOME = [
  { id: "h-clock", type: "clock", x: 0, y: 0 },
  { id: "h-xbattle", type: "xbattle", x: 236, y: 0 },
  { id: "h-me", type: "me", x: 812, y: 0 },
  { id: "h-goals", type: "goals", x: 0, y: 120 },
  { id: "h-notes", type: "notes", x: 236, y: 316 },
  { id: "h-builds", type: "builds", x: 812, y: 216 },
  { id: "h-salmon", type: "salmon", x: 236, y: 482 },
  { id: "h-chats", type: "chats", x: 0, y: 276 },
  { id: "h-about", type: "about", x: 812, y: 472 },
];
const HOME_TYPES = {
  clock:   { label: "Clock", icon: "fa-clock" },
  xbattle: { label: "X Battle now", icon: "fa-crosshairs" },
  me:      { label: "My player", icon: "fa-id-card" },
  goals:   { label: "Goals", icon: "fa-bullseye" },
  notes:   { label: "Notes", icon: "fa-note-sticky" },
  builds:  { label: "Build kits", icon: "fa-shirt" },
  salmon:  { label: "Salmon Run", icon: "fa-fish" },
  chats:   { label: "Chats", icon: "fa-comments" },
  about:   { label: "About me", icon: "fa-user-astronaut" },
  stats:   { label: "Stats", icon: "fa-chart-simple" },
};
const MIN_W = 180, MIN_H = 96;
function loadHome(){
  const defaults = () => DEFAULT_HOME.map(d => ({ ...d, ...sizeOf(d.type) }));
  const sizeOf = t => { const s = DEFAULT_SIZES[t] || [260, 150]; return { w: s[0], h: s[1] }; };
  try{
    const raw = JSON.parse(localStorage.getItem(HOME_KEY) || "null");
    if(!Array.isArray(raw)) return defaults();
    // v1 stored grid columns/rows; translate so old layouts survive the upgrade
    return raw.filter(x => x && HOME_TYPES[x.type]).map((x, i) => {
      const s = sizeOf(x.type);
      if(x.x != null) return { id: "h" + x.type + i, type: x.type, x: +x.x || 0, y: +x.y || 0, w: +x.w || s.w, h: +x.h || s.h };
      return { id: "h" + x.type + i, type: x.type, x: (i % 3) * 300, y: Math.floor(i / 3) * 220, w: s.w, h: s.h };
    });
  }catch{}
  return defaults();
}
function saveHome(){ try{ localStorage.setItem(HOME_KEY, JSON.stringify(homeLayout)); }catch{} }
function clampSize(v, lo, hi){ const n = parseInt(v, 10); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
function resetHome(){
  homeLayout = DEFAULT_HOME.map(d => { const s = DEFAULT_SIZES[d.type] || [260, 150]; return { ...d, w: s[0], h: s[1] }; });
  saveHome();
}
let homeClockTimer = null;
function toggleHomeEdit(on){
  homeEditing = on;
  document.body.classList.toggle("home-editing", on);
  const lbl = el("home-edit-label");
  if(lbl) lbl.textContent = on ? "Done" : "Edit layout";
  const bar = el("home-editbar");
  if(bar) bar.hidden = !on;
  const hint = el("home-hint");
  if(hint) hint.hidden = on;
  renderHomeShelf();
}
function renderHomeShelf(){
  const box = el("home-shelf-list");
  if(!box) return;
  const used = new Set((homeLayout || []).map(w => w.type));
  const avail = Object.entries(HOME_TYPES).filter(([t]) => !used.has(t));
  box.innerHTML = avail.length
    ? avail.map(([t, m]) => `<span class="chip"><button data-home-add="${t}"><i class="fa-solid ${m.icon}"></i> ${esc(m.label)}</button></span>`).join("")
    : `<span class="muted">Every widget is on the page.</span>`;
  const snap = el("home-snap");
  if(snap) snap.checked = !!settings.homeSnap;
}
function homeWidgetBody(t){
  const f = profile.facts || {};
  const p = myPlayerCard();
  switch(t){
    case "clock": {
      const now = new Date();
      return `<div class="hw-clock"><b id="hw-clock-time">${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>` +
        `<span>${now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</span></div>`;
    }
    case "xbattle": {
      const node = schedulesCache?.data?.xSchedules?.nodes ? currentNode(schedulesCache.data.xSchedules.nodes) : null;
      if(!node) return `<div class="hw-empty"><i class="fa-solid fa-cloud-arrow-down"></i> Rotation data unavailable.</div>`;
      const s = node.xMatchSetting;
      return rotationWidgetHTML({ label: "X Battles", rule: s.vsRule?.name, ruleCode: s.vsRule?.rule, stages: s.vsStages, startTime: node.startTime, endTime: node.endTime });
    }
    case "salmon": {
      const nodes = schedulesCache?.data?.coopGroupingSchedule?.regularSchedules?.nodes;
      const node = nodes ? currentNode(nodes) : null;
      if(!node) return `<div class="hw-empty"><i class="fa-solid fa-cloud-arrow-down"></i> Shift data unavailable.</div>`;
      return rotationWidgetHTML({ label: "Salmon Run", rule: node.setting.coopStage?.name || "Grizzco Shift", stages: [{ name: node.setting.coopStage?.name || "Stage", image: node.setting.coopStage?.image }], startTime: node.startTime, endTime: node.endTime });
    }
    case "me": {
      if(!p.name && !p.id) return `<div class="hw-empty"><i class="fa-solid fa-id-card"></i><p>Save your SplatTag + SplatNet ID to track yourself.</p><button data-w="me">Set up</button></div>`;
      const last = (profile.player || {}).last || {};
      const ranks = Object.values(last).filter(v => v && v.rank != null);
      const best = ranks.length ? ranks.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
      const selfWatched = (watched || []).filter(w => w.self).length;
      return `<div class="hw-me"><b>${esc(p.name || "Unnamed")}</b>${p.id ? `<code>${esc(p.id)}</code>` : ""}` +
        `${f.weapon ? `<span class="tag">${esc(f.weapon)}</span>` : ""}${f.mode ? `<span class="tag">${esc(f.mode)}</span>` : ""}` +
        `${f.div ? `<span class="tag">${esc(f.div)}</span>` : ""}` +
        (best ? `<span class="hw-stats"><b style="font-size:20px">#${best.rank}</b><span>best rank${selfWatched ? ` · ${selfWatched} watched` : ""}</span></span>` : `<span class="muted" style="font-size:11.5px">No ranks recorded yet</span>`) +
        `</div>`;
    }
    case "goals": {
      if(!goals.length) return `<div class="hw-empty"><i class="fa-solid fa-bullseye"></i><p>No goals yet.</p><button data-w="goals">New goal</button></div>`;
      return goals.slice(0, 3).map(g => `<div class="hw-goal"><span class="hw-goal-t">${esc(goalTitle(g))}</span>` +
        `<span class="hw-bar"><i style="width:${goalPct(g).toFixed(1)}%"></i></span>` +
        `<span class="hw-goal-p">${goalPct(g).toFixed(0)}%</span></div>`).join("");
    }
    case "notes": {
      if(!notes.length) return `<div class="hw-empty"><i class="fa-regular fa-note-sticky"></i><p>No notes. Say “note …” in chat.</p></div>`;
      return `<ul class="hw-notes">${notes.slice(0, 4).map(n => `<li>${esc(n.text)}</li>`).join("")}</ul>`;
    }
    case "builds": {
      const w = (f.weapon && findWeapon(f.weapon)) || (localData.weapons || [])[0];
      if(!w) return `<div class="hw-empty">No weapon data loaded.</div>`;
      if(buildsMode() === "off") return `<div class="hw-empty"><i class="fa-solid fa-shirt"></i><p>Build fetcher is off in Settings.</p><a href="https://sendou.ink/builds/${encodeURIComponent(sendouSlug(w.name))}" target="_blank" rel="noopener">Browse kits</a></div>`;
      const cards = buildsForWeapon(sendouSlug(w.name));
      if(!cards) return `<div class="hw-empty"><i class="fa-solid fa-shirt"></i><p>Kits for <b>${esc(w.name)}</b> load on demand.</p><button data-ask="best build for ${esc(w.name)}">Show kits</button></div>`;
      const top = popularAbilities(cards, 4);
      return `<div class="hw-builds"><b>${esc(w.name)}</b><div class="builds-sum">${top.map(a => `<span class="build-ab" title="${a.count}/${cards.length}">${abilityIcon(a.name)}<span>${esc(a.name)}</span><em>${Math.round(a.count / cards.length * 100)}%</em></span>`).join("")}</div>` +
        `<p class="rot-small">${cards.length} kits · <a href="https://sendou.ink/builds/${encodeURIComponent(sendouSlug(w.name))}" target="_blank" rel="noopener">sendou.ink</a></p></div>`;
    }
    case "chats": {
      const n = conversations.length;
      return `<div class="hw-stats"><b>${n}</b><span>chat${n === 1 ? "" : "s"} saved</span>` +
        `<span class="muted">${profile.chats || 0} started all-time</span></div>`;
    }
    case "stats": {
      const topics = topOf(profile.topics, 4);
      return `<div class="hw-stats"><b>${profile.msgs || 0}</b><span>messages read</span>` +
        (topics.length ? `<span class="muted">${topics.map(([t]) => esc(t)).join(" · ")}</span>` : `<span class="muted">chat a little to build this up</span>`) + `</div>`;
    }
    case "about": {
      const seen = SEEN_AS[topOf(profile.topics, 1)[0]?.[0]] || "still getting to know you";
      return `<div class="hw-stats"><b style="font-size:13px">${esc(seen)}</b><span>${Object.keys(profile.facts || {}).length} things I know about you</span>` +
        `<button data-w="about">Review</button></div>`;
    }
  }
  return "";
}
function homeWidgetHTML(w){
  const meta = HOME_TYPES[w.type] || { label: w.type, icon: "fa-square" };
  return `<div class="hw" data-id="${esc(w.id)}" data-type="${esc(w.type)}" tabindex="0" ` +
    `style="left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px">` +
    `<div class="hw-head"><i class="fa-solid ${meta.icon}"></i><span>${esc(meta.label)}</span>` +
    `<span class="hw-tools">` +
    `<button class="hw-size" data-size="-1" title="Narrower"><i class="fa-solid fa-minus"></i></button>` +
    `<button class="hw-size" data-size="1" title="Wider"><i class="fa-solid fa-plus"></i></button>` +
    `<button class="hw-x" data-remove="1" title="Remove widget"><i class="fa-solid fa-xmark"></i></button>` +
    `</span></div>` +
    `<div class="hw-body">${homeWidgetBody(w.type)}</div>` +
    `<span class="hw-grip" title="Drag to move"><i class="fa-solid fa-grip-vertical"></i></span>` +
    `<span class="hw-resize" title="Drag to resize"><i class="fa-solid fa-arrow-down-right"></i></span>` +
    `</div>`;
}
function homeCanvasHeight(){
  const g = el("home-grid");
  if(!g) return 0;
  const cw = el("home-canvas");
  if(!cw) return 0;
  return homeLayout.reduce((m, w) => Math.max(m, w.y + w.h), 0) + 24;
}
function renderHome(){
  if(!homeLayout) homeLayout = loadHome();
  const grid = el("home-grid"), canvas = el("home-canvas");
  if(!grid || !canvas) return;
  grid.innerHTML = homeLayout.map(homeWidgetHTML).join("");
  canvas.style.height = homeCanvasHeight() + "px";
  if(homeClockTimer) clearInterval(homeClockTimer);
  homeClockTimer = setInterval(() => {
    const e = el("hw-clock-time");
    if(!e || el("view-home")?.hidden){ clearInterval(homeClockTimer); homeClockTimer = null; return; }
    e.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, 15000);
  tickWidgets();
  renderHomeShelf();
}
/* FLIP: remember rects, move the model, then animate every widget from its old
 * box to its new one so swaps glide instead of jumping. */
function homeAnimate(mutate){
  const grid = el("home-grid");
  if(!grid) { mutate(); renderHome(); return; }
  const before = {};
  for(const c of grid.querySelectorAll(".hw")) before[c.dataset.id] = c.getBoundingClientRect();
  mutate();
  renderHome();
  for(const c of grid.querySelectorAll(".hw")){
    const b = before[c.dataset.id];
    if(!b) continue;
    const a = c.getBoundingClientRect();
    const dx = b.left - a.left, dy = b.top - a.top;
    if(Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    c.style.transition = "none";
    c.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      c.style.transition = "transform .42s cubic-bezier(.34,1.28,.5,1)";
      c.style.transform = "";
      setTimeout(() => { c.style.transition = ""; }, 460);
    });
  }
}
function homeMove(id, targetId){
  const from = homeLayout.findIndex(w => w.id === id);
  const to = homeLayout.findIndex(w => w.id === targetId);
  if(from < 0 || to < 0 || from === to) return;
  homeAnimate(() => {
    const [item] = homeLayout.splice(from, 1);
    homeLayout.splice(to, 0, item);
    saveHome();
  });
}
function homeResize(id, dw, dh){
  const w = homeLayout.find(x => x.id === id);
  if(!w) return;
  homeAnimate(() => {
    if(dw) w.w = clampSize(w.w + dw, MIN_W, 900);
    if(dh) w.h = clampSize(w.h + dh, MIN_H, 700);
    saveHome();
  });
}
function homeRemove(id){
  homeAnimate(() => { homeLayout = homeLayout.filter(w => w.id !== id); saveHome(); });
}
function homeAdd(type){
  if(!HOME_TYPES[type]) return;
  const s = DEFAULT_SIZES[type] || [260, 150];
  // drop it into the first free-ish slot under the tallest card
  const y = homeLayout.reduce((m, w) => Math.max(m, w.y + w.h), 0);
  const w = { id: "h-" + type + "-" + Math.random().toString(36).slice(2, 6), type, x: 0, y: y + 16, w: s[0], h: s[1] };
  homeAnimate(() => { homeLayout.push(w); saveHome(); });
}
/* Pointer-based drag & resize — works for mouse, pen and touch with no library.
 * Dropping a card swaps it with whichever widget it was released over. */
(function wireHomeDnD(){
  let drag = null;
  const grid = () => el("home-grid");
  function cardAt(x, y, ignoreId){
    const g = grid();
    if(!g) return null;
    let best = null, bestDist = Infinity;
    for(const c of g.querySelectorAll(".hw")){
      if(c.dataset.id === ignoreId) continue;
      const r = c.getBoundingClientRect();
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(x - cx, y - cy);
      if(inside && d < bestDist){ best = c; bestDist = d; }
    }
    return best;
  }
  document.addEventListener("pointerdown", e => {
    if(e.button != null && e.button !== 0) return;
    const grip = e.target.closest(".hw-grip"), rz = e.target.closest(".hw-resize");
    const card = e.target.closest(".hw");
    if(!card) return;
    if(grip || rz){
      e.preventDefault();
      const item = homeLayout.find(x => x.id === card.dataset.id) || {};
      drag = { mode: grip ? "move" : "resize", id: card.dataset.id, card, startX: e.clientX, startY: e.clientY,
        x0: item.x || 0, y0: item.y || 0,
        w0: parseInt(card.style.width, 10) || item.w || MIN_W,
        h0: parseInt(card.style.height, 10) || item.h || MIN_H, moved: false };
      card.classList.add(drag.mode === "move" ? "dragging" : "resizing");
      try { card.setPointerCapture(e.pointerId); } catch {}
    } else if(e.target.closest(".hw-x, .hw-size, .hw-body button, a")){
      return;
    } else if(homeEditing && card){
      // grabbing the card body only starts a drag while in edit mode
      const item = homeLayout.find(x => x.id === card.dataset.id) || {};
      drag = { mode: "move", id: card.dataset.id, card, startX: e.clientX, startY: e.clientY,
        x0: item.x || 0, y0: item.y || 0,
        w0: parseInt(card.style.width, 10) || MIN_W, h0: parseInt(card.style.height, 10) || MIN_H, moved: false };
      card.classList.add("dragging");
    }
  });
  document.addEventListener("pointermove", e => {
    if(!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if(Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if(drag.mode === "move"){
      const nx = Math.max(0, drag.x0 + dx), ny = Math.max(0, drag.y0 + dy);
      const s = settings.homeSnap ? HOME_GRID : 1;
      drag.card.style.left = Math.round(nx / s) * s + "px";
      drag.card.style.top = Math.round(ny / s) * s + "px";
      drag.card.style.width = drag.w0 + "px";
      drag.card.style.height = drag.h0 + "px";
      drag.card.style.transform = "scale(1.02)";
      drag.card.style.zIndex = 30;
      const over = cardAt(e.clientX, e.clientY, drag.id);
      for(const c of (grid()?.querySelectorAll(".hw") || [])) c.classList.toggle("drop-target", over === c);
      drag.over = over ? over.dataset.id : null;
    } else {
      const w = clampSize(drag.w0 + Math.round(dx / 10), MIN_W, 900);
      const h = clampSize(drag.h0 + Math.round(dy / 10), MIN_H, 700);
      drag.card.style.width = w + "px";
      drag.card.style.height = h + "px";
      drag.w1 = w; drag.h1 = h;
    }
  });
  const endDrag = () => {
    if(!drag) return;
    const d = drag; drag = null;
    d.card.classList.remove("dragging", "resizing");
    d.card.style.transform = ""; d.card.style.zIndex = "";
    const item = homeLayout.find(x => x.id === d.id);
    if(item){
      if(d.mode === "resize" && d.w1){ item.w = d.w1; item.h = d.h1; }
      else if(d.mode === "move"){ item.x = parseInt(d.card.style.left, 10) || 0; item.y = parseInt(d.card.style.top, 10) || 0; }
      else return;
      saveHome();
    }
    // committing a move onto another card swaps their slots
    if(d.mode === "move" && d.moved && d.over){
      const other = homeLayout.find(x => x.id === d.over);
      if(other && item){ const tx = other.x, ty = other.y; other.x = item.x; other.y = item.y; item.x = tx; item.y = ty; saveHome(); }
    }
    renderHome();
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  document.addEventListener("click", e => {
    const add = e.target.closest("[data-home-add]");
    if(add){ homeAdd(add.dataset.homeAdd); return; }
    const rm = e.target.closest("[data-remove]");
    if(rm){ const c = rm.closest(".hw"); if(c) homeRemove(c.dataset.id); return; }
    const sz = e.target.closest("[data-size]");
    if(sz){ const c = sz.closest(".hw"); if(c) homeResize(c.dataset.id, parseInt(sz.dataset.size, 10) * 60, 0); return; }
    const nav = e.target.closest("[data-w]");
    if(nav){ const m = { me: "me", goals: "goals", about: "settings" }[nav.dataset.w]; if(m) showView(m); return; }
    const ask = e.target.closest("[data-ask]");
    if(ask){ newConversation(); showView("chat"); const q = ask.dataset.ask; addMsg("user", esc(q)); handleQuery(q); return; }
    const card = e.target.closest(".hw");
    if(card && e.detail === 2 && homeEditing) homeRemove(card.dataset.id);
  });
})();
function renderMeChips(){
  const box = el("setting-me-style-chips");
  if(!box) return;
  const s = profile.style || [];
  box.innerHTML = s.length
    ? s.map((x, i) => `<span class="chip">${esc(x)}<button data-style-del="${i}" title="Remove"><i class="fa-solid fa-xmark"></i></button></span>`).join("")
    : `<span class="muted">None yet — I'll learn these as you talk.</span>`;
}
function track(topic){
  if(!topic) return;
  profile.topics[topic] = (profile.topics[topic] || 0) + 1;
  saveProfile();
  paintSuggestions();
}
function trackDetail(bucket, name){
  if(!name || !profile[bucket]) return;
  profile[bucket][name] = (profile[bucket][name] || 0) + 1;
  saveProfile();
  paintSuggestions();
}
function topOf(obj, n=3){
  return Object.entries(obj || {}).sort((a,b)=>b[1]-a[1]).slice(0,n);
}
function favWeapon(){
  const t = topOf(profile.weapons, 1)[0];
  return t ? t[0] : null;
}
const TOPIC_PROMPTS = {
  rotations: () => "What is the current X Battle rotation?",
  builds: () => favWeapon() ? `Best build for ${favWeapon()}?` : "Best build for Splattershot?",
  weapons: () => favWeapon() ? `How good is ${favWeapon()}?` : "List all weapons",
  rankings: () => "Show the Top 500 X leaderboard",
  gear: () => "Show gear with Swim Speed Up",
  salmon: () => "What is the current Salmon Run shift?",
  maps: () => "List all maps",
  modes: () => "List all modes",
  story: () => "Tell me a story log",
  notes: () => "Show my notes",
};
const DEFAULT_PROMPTS = ["What is the current X Battle rotation?", "Show the Top 500 X leaderboard", "Best build for Splattershot?"];
function paintSuggestions(){
  const box = el("suggestions");
  if(!box) return;
  const ranked = topOf(profile.topics, 6).map(([t]) => t).filter(t => TOPIC_PROMPTS[t]);
  const picks = [];
  for(const t of ranked){ const p = TOPIC_PROMPTS[t](); if(p && !picks.includes(p)) picks.push(p); }
  for(const p of DEFAULT_PROMPTS){ if(picks.length >= 3) break; if(!picks.includes(p)) picks.push(p); }
  box.innerHTML = picks.slice(0,3).map(p => `<button data-q="${esc(p)}">${esc(p)}</button>`).join("");
}
const SEEN_AS = {
  builds: "a kit tinkerer chasing the right build",
  weapons: "a kit tinkerer chasing the right build",
  rankings: "a ranked climber with an eye on X Power",
  rotations: "a queue planner who checks rotations first",
  gear: "a gear collector",
  salmon: "a Grizzco part-timer",
  maps: "a stage strategist",
  modes: "a mode specialist",
  story: "a lore diver",
  notes: "an archivist of your own ideas",
};
function factLine(k, v){ return `<div class="profile-line"><span>${k}</span><span>${v}</span></div>`; }
function renderProfile(){
  const box = el("profile-box");
  if(!box) return;
  const topics = topOf(profile.topics);
  const weapons = topOf(profile.weapons);
  const games = topOf(profile.games);
  const seen = SEEN_AS[(topics[0] || [])[0]] || "a fresh squid I'm still getting to know";
  const since = profile.firstSeen ? new Date(profile.firstSeen).toLocaleDateString() : "today";
  const f = profile.facts || {};
  const line = factLine;
  const known = [];
  for(const k of ["name","weapon","mode","div","skill"]) if(f[k]) known.push(FACT_LABELS[k] + ": " + f[k]);
  box.innerHTML =
    `<p class="profile-seeing">${youName() ? `Hi ${esc(youName())} — I see you as` : "Right now I see you as"} ${seen}.</p>` +
    line("What I know", known.length ? known.map(esc).join(" · ") : "nothing yet — try “my name is …” or fill in About you") +
    line("Reply style", (profile.style || []).length ? profile.style.map(esc).join(", ") : "normal length") +
    line("Top interests", topics.length ? topics.map(([t,c]) => `${esc(t)} (${c})`).join(", ") : "nothing yet — chat a little first") +
    line("Favorite weapons", weapons.length ? weapons.map(([t,c]) => `${esc(t)} (${c})`).join(", ") : "none yet") +
    line("Games used", games.length ? games.map(([t,c]) => `${esc(t)} (${c})`).join(", ") : "none yet") +
    line("Conversations", `${profile.chats || 0} started · ${profile.msgs || 0} messages read`) +
    line("Member since", esc(since)) +
    `<div class="profile-line"><span>Saved notes</span><span id="profile-notes">Loading…</span></div>` +
    `<p class="muted">This lives only in this browser's localStorage. Resetting removes it and restores default prompts.</p>`;
  renderProfileNotes();
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
/* ---------- community builds snapshot (data/builds.json, scraped from sendou.ink) ---------- */
let buildsData = null;
let buildsAt = 0;
let buildsFile = "";
async function getBuilds(force=false){
  if(buildsMode() === "off" && !force) throw new Error("disabled");
  const now = Date.now();
  const tier = buildsTier();
  if(!force && buildsData && buildsFile === tier.file && (now - buildsAt) < 6 * 3600_000) return buildsData;
  try{
    const res = await fetch(tier.file);
    if(!res.ok) throw new Error("no snapshot");
    const d = await res.json();
    if(!d || !d.weapons) throw new Error("no snapshot");
    buildsData = d; buildsAt = Date.now(); buildsFile = tier.file; bbNameCache = null; bbState.slug = null;
    return buildsData;
  }catch(e){ buildsData = null; throw e; }
}
function buildsForWeapon(slug){
  if(!buildsData) return null;
  const list = buildsData.weapons[slug];
  return Array.isArray(list) ? list : null;
}
/* Popularity proxy: how often each ability shows up across the weapon's builds. */
function popularAbilities(cards, n=5){
  const counts = {};
  for(const c of cards) for(const a of c.abilities || []){
    const key = /^[A-Z0-9]{2,3}$/.test(a) ? abilityName(a) : a;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, n).map(([a, c]) => ({ name: a, count: c }));
}
const ABILITY_CDN = "https://sendou-assets.nyc3.cdn.digitaloceanspaces.com/img";
const MODE_CDN = "https://sendou-assets.nyc3.cdn.digitaloceanspaces.com/img/modes";
/* code -> full name, from the local abilities dataset (26 main-ability codes) */
let abilNameMap = null;
function abilityName(code){
  if(!abilNameMap){
    abilNameMap = {};
    for(const a of (localData.abilities || [])){
      if(a.code) abilNameMap[a.code.toUpperCase()] = a.name;
      const ic = a.icon || "";
      const m = ic.match(/\/abilities\/([A-Z0-9]+)\.avif/i);
      if(m) abilNameMap[m[1].toUpperCase()] = a.name;
    }
  }
  return abilNameMap[String(code).toUpperCase()] || String(code);
}
function abilityIcon(name){
  if(/^[A-Z0-9]{2,3}$/.test(name)){
    const ic = `${ABILITY_CDN}/abilities/${String(name).toUpperCase()}.avif`;
    const label = abilityName(name);
    return `<img src="${ic}" alt="" loading="lazy" title="${esc(label)}" onerror="this.closest('.bc-abs')?.classList.add('no-img')"/>`;
  }
  const a = (localData.abilities || []).find(x => x.name && x.name.toLowerCase() === String(name).toLowerCase());
  if(a && a.icon) return `<img src="${a.icon}" alt="" loading="lazy" title="${esc(a.name)}"/>`;
  return `<i class="fa-solid fa-bolt" title="${esc(name)}"></i>`;
}
function gearBySplatnet(id){
  return (localData.gear || []).find(g => g.gear_id === id) || null;
}
const SLOT_LABEL = { headgear: "Headgear", clothes: "Clothing", shoes: "Shoes" };
/* Mirrors sendou.ink's own card: weapon badge + mode icons, author/date, the
 * weapon images, then circular ability and gear icons. */
function buildCardHTML(c){
  const modes = (c.modeCodes || c.modes || []).map(m => {
    const code = /^[A-Z]{2}$/.test(m) ? m : ({ "Splat Zones": "SZ", "Tower Control": "TC", "Rainmaker": "RM", "Clam Blitz": "CB" }[m] || "");
    return code ? `<img class="bc-mode" src="${MODE_CDN}/${code}.avif" alt="${esc(abilityNameSafe(m) || code)}" title="${esc(m)}" loading="lazy" onerror="this.remove()"/>` : "";
  }).join("");
  const name = c.title || c.weapon || "Kit";
  // sendou sometimes addresses profiles by a long internal id; those read as gibberish
  const author = c.author && !/^\d{6,}$/.test(c.author) ? c.author : null;
  const meta = [ author ? `<a href="https://sendou.ink/u/${encodeURIComponent(c.author)}/builds" target="_blank" rel="noopener">${esc(c.author)}</a>` : "",
    c.edits ? `<span>+${esc(String(c.edits))}</span>` : "",
    c.date ? `<span>${esc(String(c.date).slice(0, 10))}</span>` : "" ].filter(Boolean).join('<span class="dot">•</span>');
  // weapon images; id 0 is sendou's "any weapon" placeholder
  const wids = (c.weapons || []).filter(id => id > 0);
  const weapons = wids.length
    ? wids.map(id => `<img class="bc-weapon" src="${ABILITY_CDN}/main-weapons/${id}.avif" alt="" loading="lazy" title="${esc(name)}" onerror="this.remove()"/>`).join("")
    : (c.weapon ? `<span class="bc-weapon-name">${esc(c.weapon)}</span>` : "");
  const raw = c.abilMain;
  const flags = Array.isArray(raw) ? raw.map(String) : String(raw || "").split("");
  const abs = (c.abilities || []).map((a, i) => {
    const isMain = flags.length === c.abilities.length ? flags[i] === "1" : false;
    const label = /^[A-Z0-9]{2,3}$/.test(a) ? abilityName(a) : a;
    return `<span class="bc-ab${isMain ? " main" : ""}" title="${esc(label)}${isMain ? " — main ability" : ""}">${abilityIcon(a)}</span>`;
  }).join("");
  const gear = (c.gear || []).map(g => {
    const local = gearBySplatnet(g.splatnet);
    const label = SLOT_LABEL[g.slot] || g.slot;
    const name2 = local ? local.name : `${label} #${g.splatnet}`;
    const img = local && local.image ? `<img src="${local.image}" alt="" loading="lazy" onerror="this.remove()"/>` : `<i class="fa-solid ${GEAR_SLOTS[g.slot]?.icon || "fa-shirt"}"></i>`;
    return `<span class="bc-ab bc-gear" title="${esc(name2)} — ${esc(label)}">${img}</span>`;
  }).join("");
  const slug = c.weapon || "";
  const analyzer = (c.abilities || []).length
    ? `<a class="bc-btn" href="https://sendou.ink/analyzer?weapon=${encodeURIComponent((c.weapons || [])[0] || "")}&build=${encodeURIComponent((c.abilities || []).join(","))}" target="_blank" rel="noopener" title="Test this kit in the analyzer"><i class="fa-solid fa-flask"></i></a>`
    : "";
  const open = slug ? `<a class="bc-btn" href="https://sendou.ink/builds/${encodeURIComponent(slug)}" target="_blank" rel="noopener" title="More kits for this weapon on sendou.ink"><i class="fa-solid fa-download"></i></a>` : "";
  return `<div class="bc">` +
    `<div class="bc-top"><span class="bc-title">${esc(name)}</span><span class="bc-modes">${modes}</span></div>` +
    `<div class="bc-meta">${meta || '<span class="muted">anonymous</span>'}</div>` +
    (weapons ? `<div class="bc-weapons">${weapons}</div>` : "") +
    (abs ? `<div class="bc-abs">${abs}</div>` : "") +
    (gear ? `<div class="bc-gear">${gear}</div>` : "") +
    `<div class="bc-foot">${analyzer}${open}</div>` +
    `</div>`;
}
function abilityNameSafe(m){ return /^[A-Z]{2}$/.test(m) ? ({ SZ: "Splat Zones", TC: "Tower Control", RM: "Rainmaker", CB: "Clam Blitz" }[m] || m) : m; }
function buildsWidget(slug, w){
  const cards = buildsForWeapon(slug);
  if(!cards || !cards.length) return "";
  const top = popularAbilities(cards, 5);
  const modeCounts = {};
  for(const c of cards) for(const m of c.modes || []) modeCounts[m] = (modeCounts[m] || 0) + 1;
  const modes = Object.entries(modeCounts).sort((a,b) => b[1] - a[1]).slice(0,4);
  const n = cards.length;
  return `<div class="builds-box" data-builds="${esc(slug)}">` +
    `<div class="builds-sum"><b>Most-used abilities</b> ${top.map(t => `<span class="build-ab" title="used in ${t.count} of ${n} kits">${abilityIcon(t.name)}<span>${esc(t.name)}</span><em>${Math.round(t.count / n * 100)}%</em></span>`).join("")}</div>` +
    (modes.length ? `<div class="builds-sum"><b>Most-used modes</b> ${modes.map(([m, c]) => `<span class="tag">${esc(m)} ${Math.round(c / n * 100)}%</span>`).join("")}</div>` : "") +
    `<div class="builds-list">${cards.slice(0, 6).map(buildCardHTML).join("")}</div>` +
    `<p class="rot-small">${n} community kits in this snapshot${buildsData ? `, scraped ${esc(String(buildsData.generatedAt || "").slice(0,10))}` : ""}. ` +
    `Browse all: <a href="https://sendou.ink/builds/${encodeURIComponent(slug)}" target="_blank" rel="noopener">sendou.ink</a>.</p>` +
    `</div>`;
}
function buildsOffHTML(slug){
  return `<div class="builds-box"><p class="rot-small">Builds are turned off in Settings, so kits aren't downloaded. Turn them back on under <b>Build fetcher</b>, or browse ` +
    `<a href="https://sendou.ink/builds/${encodeURIComponent(slug)}" target="_blank" rel="noopener">sendou.ink</a> now.</p></div>`;
}
async function answerBuild(queryText){
  const w = findWeapon(queryText);
  if(!w){
    addMsg("assistant", `<h3>Builds</h3><p>Which weapon? Try “best build for ${esc((profile.facts||{}).weapon || "Splattershot")}” or “N-ZAP 85 kit”. Every weapon's kits are also on <a href="https://sendou.ink/builds" target="_blank" rel="noopener">sendou.ink/builds</a>.</p>`);
    return;
  }
  const slug = sendouSlug(w.name);
  const st = statForWeapon(w.name);
  trackDetail("weapons", w.name);
  track("builds");
  const skel = addMsg("assistant", `<h3><i class="fa-solid fa-shirt" style="color:var(--accent)"></i> ${esc(w.name)} — kit &amp; builds</h3>` + weaponWidget({ ...w, ...st }) + `<div class="builds-box"><div class="skeleton-card"><div class="sk sk-row"></div><div class="sk sk-row"></div></div></div>`);
  const box = skel ? skel.querySelector(".builds-box") : null;
  if(box){
    if(buildsMode() === "off"){
      box.outerHTML = buildsOffHTML(slug);
    } else {
      box.innerHTML = `<p class="rot-small">Loading kits…</p>`;
      try{
        await getBuilds();
        const html = buildsWidget(slug, w);
        box.outerHTML = html || `<p class="rot-small">No kits in the local snapshot for this weapon yet — see <a href="https://sendou.ink/builds/${encodeURIComponent(slug)}" target="_blank" rel="noopener">sendou.ink</a>.</p>`;
      }catch(e){
        box.outerHTML = `<p class="rot-small">Could not load the kit snapshot (${esc(e.message)}) — browse <a href="https://sendou.ink/builds/${encodeURIComponent(slug)}" target="_blank" rel="noopener">sendou.ink</a>.</p>`;
      }
    }
  }
  addMsg("assistant", `<p>Test gear combinations yourself: <a href="https://sendou.ink/analyzer" target="_blank" rel="noopener">sendou.ink/analyzer</a></p>` +
    `<p class="rot-small">Kit stats mined from game parameters. Community kits are a snapshot of <a href="https://sendou.ink" target="_blank" rel="noopener">sendou.ink</a> — credited in About.</p>` +
    (personalizedTip("builds") || ""));
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
let rankFlow = null; // { rank, mode, div } — latest season only
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
  wireRankChoices(msg);
}
function wireRankChoices(msg, rank=null){
  if(rank != null) rankFlow = rankFlow || { rank, mode: null, div: null };
  msg.querySelectorAll("[data-rank-mode]").forEach(b => b.addEventListener("click", () => {
    if(!rankFlow) return;
    rankFlow.mode = b.dataset.rankMode; continueRankFlow();
  }));
  msg.querySelectorAll("[data-rank-div]").forEach(b => b.addEventListener("click", () => {
    if(!rankFlow) return;
    rankFlow.div = b.dataset.rankDiv; continueRankFlow();
  }));
}
async function continueRankFlow(){
  const flow = rankFlow;
  if(!flow) return;
  if(!flow.mode){ askRankSlot("mode"); return; }
  if(!flow.div){ askRankSlot("div"); return; }
  // all slots filled — latest season only, then show
  let season = null;
  try{
    season = (await xrankSeasonList(flow.div))[0];
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
    track("rankings"); trackDetail("modes", flow.mode); trackDetail("divs", divLabel);
    if(skel) skel.remove();
    if(!hit){
      addMsg("assistant", `<p>No player found at rank #${flow.rank} in ${esc(modeLabel)} (${esc(divLabel)}, season ${flow.div}-${season}). The archive may be incomplete for that season.</p>`);
    } else {
      const pid = "pl" + (++playerSeq);
      playerCache[pid] = { node: hit, mode: flow.mode, div: flow.div, season };
      addMsg("assistant", `<h3><i class="fa-solid fa-trophy" style="color:#f59e0b"></i> Rank #${hit.rank} — ${esc(modeLabel)}</h3><div class="rank-list">` +
        `<div class="rank-row"><span class="rank ${rankMedal(hit.rank)}">${hit.rank}</span>` +
        `${hit.weapon?.image?.url?`<img class="rank-weapon" src="${hit.weapon.image.url}" alt="" loading="lazy"/>`:""}` +
        `<button class="rank-name as-btn" data-player="${pid}" data-origin="chat">${esc(hit.name)}<small>${esc(hit.weapon?.name||"")} · tap for details</small></button>` +
        `<span class="rank-xp">${esc(String(hit.xPower))} XP</span></div></div>` +
        `<p class="rot-small">${esc(divLabel)} division • latest season</p>`);
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
  const num = t.match(/^#?([1-9]\d{0,2})$/); if(num) rankFlow.rank = parseInt(num[1],10);
  continueRankFlow();
  return true;
}

function answerWhatYouKnow(){
  const f = profile.facts || {};
  const rows = [];
  for(const k of ["name","weapon","mode","div","skill"]) if(f[k]) rows.push(factLine(FACT_LABELS[k], esc(f[k])));
  const topics = topOf(profile.topics, 5);
  const head = youName() ? `Here's what I know about you, ${esc(youName())}:` : `Here's what I've picked up so far:`;
  addMsg("assistant", `<h3><i class="fa-solid fa-user-astronaut" style="color:var(--accent)"></i> What I know about you</h3>` +
    (rows.length ? `<div class="profile-line-list">${rows.join("")}</div>` : `<p>I don't know much yet. Tell me things like <b>“my name is Sam”</b>, <b>“I main Splattershot”</b>, <b>“my favourite mode is Splat Zones”</b>, or <b>“I'm competitive and play in Takoroka”</b>.</p>`) +
    ((profile.style || []).length ? `<p class="rot-small">Reply style: ${profile.style.map(esc).join(", ")}</p>` : "") +
    (topics.length ? `<p class="rot-small">Topics you ask about most: ${topics.map(([t,c]) => `${esc(t)} (${c})`).join(", ")}</p>` : "") +
    (notes.length ? `<p class="rot-small">Notes: ${esc(notes[0].text)}${notes.length > 1 ? ` (+${notes.length - 1} more)` : ""}</p>` : "") +
    `<p class="rot-small">Stored only in this browser. Change or erase it in Settings → About you, or ask “forget …”.</p>`);
}
const FORGET_ALL = /^(?:everything|all|it|that|my (?:data|details|info|information|profile)|all about me|about me)$/i;
function answerForget(q){
  let t = q.replace(/^(?:forget|delete|remove|erase|reset)\s+/i, "").trim().replace(/[.?!]+$/,"");
  if(FORGET_ALL.test(t)){
    profile.facts = {}; profile.style = []; profile.weapons = {}; profile.modes = {}; profile.divs = {};
    saveProfile(); renderProfile(); syncMeFields(); paintSuggestions();
    addMsg("assistant", `<p>Forgotten — I no longer know anything about you, beyond what this chat just told me.</p>`);
    return;
  }
  t = t.replace(/^my\s+/i, "").trim();
  if(!t){ profile.facts = {}; profile.style = []; saveProfile(); renderProfile(); syncMeFields(); addMsg("assistant", `<p>Forgotten — I no longer have any details about you, beyond what this chat just told me.</p>`); return; }
  const word = t.split(/\s+/)[0].toLowerCase();
  const key = ["name","weapon","mode","div","skill"].find(k => FACT_LABELS[k].toLowerCase().startsWith(word) || k === word);
  if(key && profile.facts[key]){
    const old = profile.facts[key];
    delete profile.facts[key];
    if(key === "weapon") profile.weapons = {};
    if(key === "mode") profile.modes = {};
    saveProfile(); renderProfile(); syncMeFields();
    const plural = { name: "name", weapon: "main weapon", mode: "favourite mode", div: "division", skill: "experience" }[key] || key;
    addMsg("assistant", `<p>Forgotten — I no longer have your ${plural} (“${esc(old)}”).</p>`);
    return;
  }
  const i = (profile.style || []).findIndex(s => s.toLowerCase().includes(t.toLowerCase()));
  if(i >= 0){
    const gone = profile.style.splice(i, 1)[0];
    saveProfile(); renderProfile(); syncMeFields();
    addMsg("assistant", `<p>Dropped the “${esc(gone)}” preference.</p>`);
    return;
  }
  addMsg("assistant", `<p>Nothing stored matches “${esc(t)}”. Try “forget everything”, or set details in Settings → About you.</p>`);
}
function personalizedTip(topic){
  const f = profile.facts || {};
  const name = youName();
  const who = name ? `${esc(name)},` : "";
  if(topic === "rotations" && f.mode){
    const modeHit = (localData.modes || []).find(m => m.name && f.mode.toLowerCase().includes(m.name.toLowerCase()));
    const label = modeHit ? modeHit.name : f.mode;
    if(/anarchy/i.test(label)) return `<p class="rot-small">${who} you main <b>${esc(label)}</b> — I default to Anarchy battles and ${esc(f.div || "Takoroka")} when a mode isn't specified.</p>`;
    if(/splatzones|splat zones/i.test(label)) return `<p class="rot-small">${who} you main <b>${esc(label)}</b> — I'll lead with Turf-adjacent zones info and ${esc(f.div || "Takoroka")} rankings.</p>`;
    return `<p class="rot-small">${who} since <b>${esc(label)}</b> is your main, I'll keep that first unless you ask for something else.</p>`;
  }
  if(topic === "builds" && f.weapon) return `<p class="rot-small">${who} showing builds around your main, <b>${esc(f.weapon)}</b>.</p>`;
  return "";
}
async function handleQuery(text){
  const q = text.toLowerCase();
  if(handleRankFlowText(text)) return;
  if(/^(?:what do you (?:know|remember) about me|who am i|what have you (?:learned|got) about me|your memory of me|about me)$/.test(q)){ answerWhatYouKnow(); return; }
  if(/^(?:forget|delete|erase|reset)\b/.test(q)){ answerForget(q); return; }
  const learned = learnFacts(text);
  profile.msgs = (profile.msgs || 0) + 1; saveProfile();
  if(learned.length && isSelfStatement(text)){
    const STYLE_PHRASE = { "short replies": "to keep replies short", "no long monologues": "to skip the long explanations" };
    const bits = learned.map(([k, v]) => k === "style" ? `${STYLE_PHRASE[v] || "this preference"} (<b>${esc(v)}</b>)` : `your ${FACT_LABELS[k].toLowerCase()} is <b>${esc(v)}</b>`);
    addMsg("assistant", `<p>Noted — ${bits.join(", ")}. I'll remember that.</p>` +
      `<p class="rot-small">Ask “what do you know about me” any time, or change it in Settings → About you.${brevityHint() ? " I'll keep replies short." : ""}</p>`);
    paintSuggestions();
    return;
  }
  const st = smallTalk(text);
  if(st){ addMsg("assistant", st); return; }
  const sendouUser = q.match(/sendou\s+(?:user|player|profile)\s+(.+)/);
  if(sendouUser){ track("rankings"); await answerSendouUser(sendouUser[1].replace(/[?.!]+$/,"")); return; }
  if(/sendou\s*(api|token|key)/.test(q) || q.trim() === "sendou"){ addMsg("assistant", `<p>sendou.ink's public API needs a personal token (free at <a href="https://sendou.ink/api" target="_blank" rel="noopener">sendou.ink/api</a>). Save it in Settings, then try “sendou user …”. Build pages need no token.</p>`); return; }
  if(/\b(builds?|kits?|loadouts?|setups?|combos?)\b/.test(q) && !/^\s*(show|list)\s+(all\s+)?(my\s+)?builds?\s*$/.test(q)){ await answerBuild(text); return; }
  const rankN = wantsRankLookup(q);
  if(rankN){
    rankFlow = { rank: rankN, mode: detectMode(q), div: detectDiv(q) };
    continueRankFlow();
    return;
  }
  if(/previous|last season|older|past seasons|season\s*[pa]?-?\d{1,2}|takoroka|tentatek/.test(q)){
    const div = /tentatek/.test(q) ? "a" : "p";
    const mk = (XRANK_MODES.find(m => q.includes(m.label.toLowerCase())) || XRANK_MODES[0]).key;
    track("rankings"); trackDetail("modes", mk);
    await answerTop500(mk, div, true);
    if(/previous|last season|older|past seasons|season\s*[pa]?-?\d{1,2}/.test(q))
      addMsg("assistant", `<p class="rot-small">Only the latest season is kept — showing latest above.</p>`, true);
    return;
  }
  if(/leaders? right now|who'?s (top|leading|first|number one)|current leaders?|live now|live leaders/.test(q)){ track("rankings"); showView("live"); return; }
  if(/top ?500|leaderboard/.test(q) || (/x ?power/.test(q) && /top|rank|leader/.test(q))){ track("rankings"); await answerTop500(); return; }
  if(q.includes("x battle") || (q.includes("current") && q.includes("x"))){ track("rotations"); trackDetail("modes", "X Battles"); await answerRotation("x"); return; }
  if(q.includes("turf")){ track("rotations"); trackDetail("modes", "Turf War"); await answerRotation("turf"); return; }
  if(q.includes("anarchy")){ track("rotations"); trackDetail("modes", "Anarchy Battle"); await answerRotation("anarchy"); return; }
  if(q.includes("event") || q.includes("challenge")){ track("rotations"); trackDetail("modes", "Event"); await answerRotation("event"); return; }
  if(q.includes("salmon") || q.includes("grizzco")){ track("rotations"); track("salmon"); await answerRotation("salmon"); return; }
  if(q.includes("rotation") || q.includes("schedule")){ track("rotations"); showView("live", "rotations"); return; }
  if(/help|what can you|^hi$|^hello$/.test(q)){
    addMsg("assistant", `<h3>Capabilities</h3><p>Dataset: <b>${esc(currentGame)}</b> (<code>data/${esc(currentGame)}/</code>).</p><p>Supported: live rotations, weapons and community build kits, maps, modes, story records, Top 500 (current and previous seasons, both divisions), single-rank lookup (try “who was #247 last season?”), and sendou.ink user lookup. I also remember things about you — ask “what do you know about me”, or just say “my name is…” / “I main…” in chat. Every chat lives under <b>Chats</b>; Settings switches between the sidebar and a floating navigation pill.</p>`);
    return;
  }
  if(q.includes("list all weapons") || q.trim()==="weapons"){
    addMsg("assistant", `<h3>${esc(currentGame)} weapons (${localData.weapons.length})</h3><div class="card-grid">`+
      localData.weapons.slice(0,18).map(w=>`<div class="mini-card"><b>${esc(w.name)}</b><br/><span class="tag">${esc(w.class)}</span><br/>${esc(w.sub)} / ${esc(w.special)}</div>`).join("")+`</div>`);
    return;
  }
  if(q.includes("list all maps") || q.trim()==="maps"){
    track("maps");
    addMsg("assistant", `<h3>${esc(currentGame)} maps</h3><p>`+localData.maps.map(m=>`• <b>${esc(m.name)}</b> — ${esc(m.description)}`).join("<br/>")+`</p>`);
    return;
  }
  if(q.includes("list all modes") || q.trim()==="modes"){
    track("modes");
    addMsg("assistant", `<h3>${esc(currentGame)} modes</h3><p>`+localData.modes.map(m=>`• <b>${esc(m.name)}</b> — ${esc(m.description)}`).join("<br/>")+`</p>`);
    return;
  }
  if(q.includes("story") || q.includes("log") || q.includes("lore")){
    track("story");
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
    track("gear");
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
      track("weapons"); trackDetail("weapons", st.name);
      addMsg("assistant", `<h3>${esc(st.name)} — game data</h3>` + weaponWidget({ ...w, ...st }));
      return;
    }
  }
  if(handleNotes(q)) return;
  const hits = searchLocal(q);
  if(hits.length===0){
    addMsg("assistant", `<p>No matching records in <code>data/${esc(currentGame)}/</code> for “${esc(text)}”. Try “Current X Battle rotation”, “best build for …”, “Top 500”, or a weapon or map name.</p>`);
    return;
  }
  const first = hits[0];
  if(first && (first.cat === "weapons" || first.cat === "weapon_stats")){
    track("weapons"); trackDetail("weapons", first.item.name);
  }
  showSearchCarousel(hits);
}

/* ---------- wiring (safe: no-ops if an element is missing) ---------- */
on("nav-live", "click", () => showView("live"));
on("nav-me", "click", () => showView("me"));
on("pill-me", "click", () => showView("me"));
on("me-back", "click", () => showView("home"));
on("me-edit", "click", () => toggleMeEditor(true));
function toggleMeEditor(on){
  const ed = el("me-editor");
  if(ed) ed.hidden = !on;
  const btn = el("me-edit");
  if(btn){ btn.innerHTML = on ? `<i class="fa-solid fa-xmark"></i> Close` : `<i class="fa-solid fa-pen"></i> Edit`; }
  if(on){
    const p = myPlayerCard();
    const n = el("me-edit-name"), i = el("me-edit-id"), d = el("me-edit-div");
    if(n) n.value = p.name;
    if(i) i.value = p.id;
    if(d) d.value = (profile.facts || {}).div || "";
    if(n) n.focus();
  }
}
function commitPlayerFields(msgEl){
  const n = el("me-edit-name"), i = el("me-edit-id");
  const name = (n?.value || "").trim();
  const id = (i?.value || "").replace(/\D/g, "").slice(0, 12);
  if(id && id.length < 8){
    const m = el(msgEl || "me-edit-msg");
    if(m) m.textContent = "That ID looks too short — it's usually 8 digits.";
    return false;
  }
  profile.player = { name, id, ...(profile.player?.last ? { last: profile.player.last } : {}), ...(profile.player?.lastChecked ? { lastChecked: profile.player.lastChecked } : {}) };
  // division lives with the player card too, so lookups don't have to guess
  const dv = el("me-edit-div");
  if(dv){
    profile.facts = profile.facts || {};
    if(dv.value) profile.facts.div = dv.value; else delete profile.facts.div;
  }
  saveProfile();
  if(i) i.value = id;
  const m = el(msgEl || "me-edit-msg");
  if(m) m.textContent = "Saved.";
  renderMeCard(); renderHome(); syncPlayerFields();
  return true;
}
on("me-edit-save", "click", () => { if(commitPlayerFields("me-edit-msg")) setTimeout(() => toggleMeEditor(false), 700); });
on("me-edit-cancel", "click", () => toggleMeEditor(false));
on("setting-home-open", "click", () => showView("home"));
on("setting-player-save", "click", savePlayerCard);
on("setting-player-clear", "click", () => {
  profile.player = { name: "", id: "" }; saveProfile(); syncPlayerFields(); renderMeCard();
  const ok = el("setting-player-saved"); if(ok){ ok.textContent = "Cleared."; setTimeout(() => { ok.textContent = ""; }, 2000); }
});
on("setting-builds", "change", () => {
  const sel = el("setting-builds");
  settings.buildsMode = BUILD_MODES.includes(sel?.value) ? sel.value : "startup";
  saveSettings(); syncBuildsFields(); renderHome();
  if(buildsMode() === "startup") getBuilds().then(() => { syncBuildsFields(); renderHome(); }).catch(() => syncBuildsFields());
});
on("setting-builds-size", "change", () => {
  const s = el("setting-builds-size");
  settings.buildsSize = s?.value === "large" ? "large" : "1";
  saveSettings(); buildsData = null; buildsFile = ""; syncBuildsFields(); renderHome();
  if(buildsMode() === "startup") getBuilds().then(() => { syncBuildsFields(); renderHome(); renderLiveBuilds(); }).catch(() => syncBuildsFields());
});
on("setting-builds-now", "click", async () => {
  const st = el("setting-builds-state");
  if(st) st.textContent = "Fetching…";
  try{ await getBuilds(true); syncBuildsFields(); renderHome(); renderLiveBuilds(); }
  catch(e){ if(st) st.textContent = "Fetch failed: " + e.message; }
});
on("setting-builds-forget", "click", () => {
  buildsData = null; buildsAt = 0; buildsFile = ""; bbNameCache = null; bbState.slug = null; syncBuildsFields(); renderHome();
  const st = el("setting-builds-state"); if(st) st.textContent = "Cache cleared";
});
on("me-lookup", "click", lookupMeOnBoards);
function unwatchMe(){
  const p = myPlayerCard();
  watched = watched.filter(w => !(w.self || (p.name && String(w.name || "").toLowerCase() === p.name.toLowerCase())));
  saveWatched(); renderMeCard(); renderHome();
  const st = el("me-lookup-state");
  if(st) st.textContent = "Stopped watching your boards.";
}
function watchAllMeBoards(){
  const list = meBoards.map(f => ({ name: f.hit.name, mode: f.mode.key, div: f.div, season: f.season, rank: f.hit.rank, xp: Number(f.hit.xPower ?? f.hit.x_power) }));
  let added = 0;
  for(const b of list){
    const key = watchKey(b.name, b.mode, b.div, b.season);
    if(watched.some(x => x.key === key)) continue;
    watched.unshift({ key, name: b.name, mode: b.mode, div: b.div, season: b.season, lastRank: b.rank, lastXP: b.xp, self: true,
      modeLabel: (XRANK_MODES.find(m => m.key === b.mode) || {}).label || b.mode,
      divLabel: (XRANK_DIVS.find(d => d.key === b.div) || {}).label || b.div,
      addedAt: new Date().toISOString() });
    added++;
  }
  watched = watched.slice(0, 50);
  saveWatched();
  const out = el("me-lookup-out");
  if(out) out.innerHTML = meBoards.map(f => meBoardHTML(f, (profile.player?.last || {})[f.mode.key])).join("");
  const st = el("me-lookup-state");
  if(st) st.textContent = added ? `Watching ${added} board${added > 1 ? "s" : ""} — alerts will show on the bell.` : "Already watching those boards.";
  renderMeCard();
}
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && homeEditing){ toggleHomeEdit(false); return; }
  // number keys swap game datasets without reaching for the mouse
  if(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if(n >= 1 && n <= 3){
    const g = ["Splatoon1","Splatoon2","Splatoon3"][n-1];
    if(g && g !== currentGame) loadGame(g).then(() => {
      document.querySelectorAll(".game-toggle button").forEach(b => b.classList.toggle("active", b.dataset.game === g));
      renderHome();
    });
  }
});
on("setting-home-reset", "click", () => { resetHome(); renderHome(); });
on("home-add", "click", () => toggleHomeEdit(true));
on("home-edit", "click", () => toggleHomeEdit(!homeEditing));
on("home-reset", "click", () => { resetHome(); renderHome(); });
on("home-snap", "change", () => { const s = el("home-snap"); settings.homeSnap = !!s?.checked; saveSettings(); });
on("nav-goals", "click", () => showView("goals"));
on("goal-new", "click", () => { goalFormSync(); showView("goal-new"); });
on("goal-back", "click", () => showView("goals"));
on("goal-detail-back", "click", () => showView("goals"));
{
  const gf = el("goal-chat-form");
  if(gf) gf.addEventListener("submit", e => {
    e.preventDefault();
    const inp = el("goal-chat-input");
    const t = (inp?.value || "").trim();
    if(!t || !goalById(currentGoalId)) return;
    inp.value = "";
    goalChatAdd("user", esc(t));
    answerGoalChat(t);
  });
}
on("goal-type", "change", goalFormSync);
document.querySelectorAll("[data-rank-pick]").forEach(b => b.addEventListener("click", () => {
  const t = el("goal-target");
  if(t){ t.value = b.dataset.rankPick; }
}));
on("goal-create", "click", createGoal);
on("nav-notifs", "click", () => showView("notifs"));
on("notifs-clear", "click", () => { notifications = []; saveNotifs(); updateNotifBadge(); renderNotifs(); });
on("refresh-live", "click", refreshLiveActive);
document.querySelectorAll("[data-live-sec-btn]").forEach(b => b.addEventListener("click", () => showLiveSection(b.dataset.liveSecBtn)));
on("nav-chats", "click", () => showView("chats"));
on("chats-new", "click", () => { newConversation(); showView("chat"); });
on("nav-settings", "click", () => showView("settings"));
on("pill-brand", "click", () => showView("home"));
on("pill-chats", "click", () => showView("chats"));
on("pill-live", "click", () => showView("live"));
on("pill-goals", "click", () => showView("goals"));
on("pill-settings", "click", () => showView("settings"));
on("pill-notifs", "click", () => showView("notifs"));
document.querySelectorAll("[data-nav-mode]").forEach(b => b.addEventListener("click", () => { settings.navMode = b.dataset.navMode; saveSettings(); applyNavMode(); }));
document.querySelectorAll("[data-nav-pos]").forEach(b => b.addEventListener("click", () => { settings.navPos = b.dataset.navPos; saveSettings(); applyNavMode(); }));
document.addEventListener("click", e => {
  const d = e.target.closest("[data-style-del]");
  if(!d) return;
  profile.style.splice(parseInt(d.dataset.styleDel, 10), 1);
  saveProfile(); renderProfile(); renderMeChips();
});
on("setting-me-style-add", "click", () => {
  const i = el("setting-me-style");
  if(i && i.value.trim()){ addStyleFact(i.value); i.value = ""; renderProfile(); renderMeChips(); }
});
on("setting-me-style", "keydown", e => {
  if(e.key !== "Enter") return;
  e.preventDefault();
  const b = el("setting-me-style-add");
  if(b) b.click();
});
on("setting-me-save", "click", () => {
  const f = profile.facts || (profile.facts = {});
  const set = (k, id) => { const n = el(id); const v = n ? String(n.value || "").trim() : ""; if(v) f[k] = v; else delete f[k]; };
  set("name", "setting-me-name");
  set("weapon", "setting-me-weapon");
  set("mode", "setting-me-mode");
  set("div", "setting-me-div");
  set("skill", "setting-me-skill");
  if(f.weapon) profile.weapons[f.weapon] = (profile.weapons[f.weapon] || 0) + 1;
  if(f.mode) profile.modes[f.mode] = (profile.modes[f.mode] || 0) + 1;
  if(f.div) profile.divs[f.div] = (profile.divs[f.div] || 0) + 1;
  saveProfile(); renderProfile(); paintSuggestions();
  const ok = el("setting-me-saved");
  if(ok){ ok.textContent = "Saved. I'll use this in my answers."; setTimeout(() => { ok.textContent = ""; }, 2500); }
});
on("open-about", "click", () => showView("about"));
on("about-back", "click", () => showView("settings"));
on("setting-theme", "change", () => { const s = el("setting-theme"); settings.theme = s ? s.value : "dark"; saveSettings(); applySettings(); });
document.querySelectorAll("[data-accent-pick]").forEach(b => b.addEventListener("click", () => { settings.accent = b.dataset.accentPick; saveSettings(); applySettings(); }));
on("setting-save-token", "click", () => { const t = el("setting-sendou-token"); settings.sendouToken = t ? t.value.trim() : ""; saveSettings(); applySettings(); const ok = el("setting-saved"); if(ok){ ok.textContent = "Saved."; setTimeout(()=>{ ok.textContent=""; }, 2000); } });
on("setting-clear-token", "click", () => { settings.sendouToken = ""; saveSettings(); applySettings(); });
on("setting-custom-color", "change", () => { const c = el("setting-custom-color"); if(c && /^#[0-9a-f]{6}$/i.test(c.value)){ settings.accent = "custom"; settings.customAccent = c.value; saveSettings(); applySettings(); } });
on("profile-reset", "click", () => { profile = { topics:{}, weapons:{}, modes:{}, divs:{}, games:{}, chats: profile.chats || 0, msgs: 0, firstSeen: profile.firstSeen, facts:{}, style:[] }; saveProfile(); renderProfile(); syncMeFields(); paintSuggestions(); });
on("setting-wipe", "click", () => { try{ localStorage.clear(); }catch{} conversations = []; currentId = null; newConversation(); showView("chat"); });
on("setting-home-launch", "change", () => { const s = el("setting-home-launch"); settings.homeOnLaunch = s ? s.value === "home" : true; saveSettings(); });
on("setting-tour", "click", () => { maybeTour(true); });
on("topbar-new", "click", () => { newConversation(); showView("chat"); });
on("collapse-btn", "click", () => document.body.classList.toggle("collapsed"));
on("brand", "click", () => showView("home"));
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
const suggBox = el("suggestions");
if(suggBox) suggBox.addEventListener("click", e => {
  const b = e.target.closest("[data-q]");
  if(!b) return;
  showView("chat");
  addMsg("user", esc(b.dataset.q));
  handleQuery(b.dataset.q);
});
document.querySelectorAll(".game-toggle button").forEach(b=>b.addEventListener("click", async ()=>{
  await loadGame(b.dataset.game);
  trackDetail("games", b.dataset.game);
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

/* Re-attach wiring to interactive widgets restored from storage.
 * Saved HTML survives refresh, but listeners don't — without this,
 * every pill, tab, and arrow in old messages is dead after reload. */
function rehydrateChat(){
  if(!chat) return;
  const msgs = [...chat.querySelectorAll(".msg")];
  msgs.forEach((m, i) => {
    if(!m.classList.contains("bot")) return;
    if(m.querySelector("[data-xdivs]")) initTop500(m);
    const car = m.querySelector("[data-carousel]");
    if(car){
      let q = "";
      for(let j = i - 1; j >= 0; j--){
        if(msgs[j].classList.contains("user")){ q = msgs[j].querySelector(".bubble")?.textContent || ""; break; }
      }
      const hits = searchLocal(q.toLowerCase());
      const nav = m.querySelector(".carousel-nav");
      if(hits.length) initCarousel(m, hits);
      else if(nav) nav.style.display = "none";
    }
    if(m.querySelector("[data-rank-mode]") || m.querySelector("[data-rank-div]")){
      const r = m.textContent.match(/#(\d{1,3})/);
      if(r) wireRankChoices(m, parseInt(r[1],10));
    }
    });
  tickWidgets();
}

async function boot(){
  if(!chat || !form){ console.error("SplatGPT: required chat elements missing"); return; }
  applySettings();
  await loadGame(currentGame);
  try{ await getSchedules(); }catch{ setLive(false, "splatoon3.ink: unavailable"); }
  if(buildsMode() === "startup"){
    // don't block first paint on a 1 MB download
    getBuilds().then(() => { syncBuildsFields(); renderHome(); }).catch(() => { syncBuildsFields(); });
  }
  try{
    if(conversations.length > 0 && conversations[0].messages.length > 0){
      currentId = conversations[0].id;
      chat.innerHTML = "";
      currentConvo().messages.forEach(m => addMsg(m.role, m.html, true));
      rehydrateChat();
    } else {
      newConversation();
    }
  }catch(e){ console.warn(e); try{ newConversation(); }catch{} }
  showView(settings.homeOnLaunch ? "home" : "chat");
  paintSuggestions();
  updateNotifBadge();
  updateChatCount();
  syncBuildsFields();
  renderHome();
  const vv = el("app-version");
  if(vv) vv.textContent = `v${APP_VERSION}`;
  try{ console.log(`%cSplatGPT v${APP_VERSION}`, "font-weight:bold"); }catch{}
  if(window.location.hash === "#live") showView("live");
  setTimeout(() => maybeTour(), 600);
  setTimeout(checkWatched, 20000);
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
