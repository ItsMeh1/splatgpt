# 🦑 SplatGPT

Fan-made ChatGPT-like AI for Splatoon 1 / 2 / 3. **100% static — hosts on GitHub Pages.**

Congrats on X 3-0 +75 X Power btw. I heard there's a `splatgpt` in your lobby — now it's real.

## How it works (your vision, built)

```
data/
  Splatoon1/ weapons.json maps.json modes.json story_logs.json
  Splatoon2/ ...
  Splatoon3/ ... + weapon_stats.json kits.json salmonids.json gear.json abilities.json
  live/ top500.json   <- auto-updated by Action (splatnet3-scraper)
index.html  <- ChatGPT-like search UI + game toggle + sidebar
main.js     <- local search + live widgets
styles.css  <- Splatoon ink theme
```

- **Toggle S1/S2/S3** up top → switches which `data/<Game>/` folder is searched.
- **Navigation**: sidebar by default, or a floating pill docked top/left/right/bottom — Settings → Appearance → Navigation. Each pill expands individually on hover via a pure-CSS `grid-template-columns: auto 0fr → auto 1fr` transition (no JS measuring, so it can't break on late font loads); the bar grows out of its docked edge on load and pulses faintly while idle. The notifications pill only appears once you actually have notifications.
- **Home dashboard** (the launch view; the SplatGPT logo goes here): a widget canvas you arrange yourself. **Edit layout** (pencil) is the only control until you click it — then Add widget, Snap to grid, Reset and the widget shelf appear. Drag a card anywhere (free-form x/y in px, no snapping unless you enable it), drag the corner handle to resize, `+`/`−` to step size, double-click or `×` to remove. Ten widget types ship by default and the layout persists in `splatgpt.home.v2`. Cards are flat inside — widgets render full-bleed rather than as boxes within a box — and defaults are sized so rotation maps and the clock stay legible. Dropping a card onto another swaps their slots with a FLIP animation.
- **Build fetcher** — Settings → Build fetcher has three modes: *At startup* (default, prefetches `data/builds.json` without blocking first paint), *On demand* (fetches only when you actually ask for a kit), and *Off* (skips the ~1 MB download entirely and links out to sendou.ink instead). Fetch Now / Clear Cache are there too.
- **My player card** — save your SplatTag name and SplatNet ID under Settings → My player card. The My player view then looks you up across the latest X Power Top 500 boards for all four modes and reports your rank, percentile, and XP. Matching works by ID or by name. `Watch all` then registers you on those boards through the existing rank-alert system (the bell in navigation), so you get the same "climbed #42 → #30" alerts as any watched player; a follow-up lookup shows a `▲ 12` delta against where you were last time. Everything stays in `localStorage`.
- **Chats**: one section for every conversation plus a New chat button (topbar pencil works too). Stored in localStorage.
- **Learns about you**: say "my name is…", "I main…", "my favourite mode is…", "I'm in Tentatek" and it's remembered in `splatgpt.profile.v1`. Ask "what do you know about me" or "forget everything". Edit by hand in Settings → About you. Nothing leaves the browser.
- **Build kits**: `scripts/fetch_builds.py` scrapes community kits from sendou.ink's build pages into two snapshots — sendou.ink serves no CORS headers, so builds are snapshapped at build time rather than fetched live (daily via `.github/workflows/update-builds.yml`). Settings → Build fetcher picks the tier: **light** `data/builds.json` (1.3 MB, 3,080 kits) or **heavy** `data/builds-large.json` (7.2 MB, 16,389 kits, the default). **Live → Builds** has a single weapon search box and a Most-edited/Newest/A–Z toggle; type a weapon, pick it, browse its kits 24 at a time. Cards mirror sendou.ink's own layout: weapon-name badge with mode icons, author/date, the weapon image, then circular ability and gear badges — the active main ability renders larger than its subs, mirroring sendou.ink's own 42px/32px sizing — with hover tooltips, plus analyzer/download buttons. Gear names resolve against the local `gear.json` by SplatNet ID. **Known ceiling:** sendou.ink server-renders at most 240 builds per weapon with no offset or pagination (`limit=1000` silently falls back to 24), and `mode`/`date`/`abilities` filters only ever return subsets of that same window. 70 of the 77 weapons are therefore capped; there is no public builds API to go further.
- **Sidebar Splatoon ops**: X Battles Live, Turf, Anarchy, Event, Salmon Run, Top 500, Weapons, Maps, Modes.
- **Widgets**: ask “What is the current X battle rotation?” → shows the 2 maps big, `X Battles` label + mode pill, and a bottom bar that fills as time passes. Text shows e.g. `1hr 48m 27s elapsed`, hover = time until rotation over. Ticks every second.
- **Live data split (as you asked)**:
  - `splatnet3-scraper` → serious scores: Top 500 X + event scores. Runs in `.github/workflows/update-top500.yml` via `scripts/fetch_top500.py`, commits `data/live/top500.json`. Browser can't do this (needs NSO session token).
  - `splatoon3.ink` → casual/immediate: rotations, Salmon shifts. Fetched live in-browser from `https://splatoon3.ink/data/schedules.json` + `coop.json`.

## Run locally

```bash
npx serve .   # or: python3 -m http.server 8000
# open http://localhost:8000 (file:// blocks fetch of /data JSONs, use http)
```

## Deploy to GitHub Pages

1. Push to GitHub, Settings → Pages → Deploy from branch → `main` / root.
2. (Optional, for real Top 500): add repo secret `SN3S_SESSION_TOKEN` (get via s3s/nxapi login), then run Actions → “Update Top500”.

## Contribute data

Add/edit JSONs in `data/SplatoonX/`. Keep schema: `{id, name, ...}`. See existing files. PRs welcome — that's how SplatGPT gets smarter, no backend needed.

## Data sources

- Local lore/weapons/maps: community JSONs in `/data`
- Mined game parameters + text (weapon stats/kits, gear, abilities, Salmonids): https://gitlab.com/AeonSake2/splat3-data — refresh with `python3 scripts/import_gamedata.py` (monthly via Actions → “Update game data”)
- Live rotations: https://splatoon3.ink
- Top 500: SplatNet 3 via https://github.com/cesaregarza/SplatNet3_Scraper
- Community build kits: https://sendou.ink/builds (AGPL-3.0; credited and linked from every kit card). Gear/ability reference cross-checked against https://stat.ink's public API. No runtime proxy and no libcurl.js — see `scripts/fetch_builds.py`.

Fan project. Not affiliated with Nintendo.
