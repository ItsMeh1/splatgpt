<div align="center">

<img src="coolsite/logo.svg" width="88" alt="SplatGPT">

# SplatGPT

A Splatoon 1 / 2 / 3 knowledge assistant. No account, no server, no build step.

</div>

## How it works

The site is plain HTML, CSS and JS on GitHub Pages. There's no backend and nothing is uploaded.

- **Static game data** — weapons, maps, modes, story logs and mined parameters live in `data/<Game>/`. The dataset switches with the S1/S2/S3 toggle.
- **Pre-scraped snapshots** — a few datasets can't be fetched from the browser (no CORS, or they need a session token), so Python scripts in `scripts/` refresh them on a schedule via GitHub Actions and commit the JSON:
  | Data | Source |
  | --- | --- |
  | Rotations, shifts, icons | [splatoon3.ink](https://splatoon3.ink) — fetched live in-browser |
  | Top 500 X Power | [splatnet3-scraper](https://github.com/cesaregarza/SplatNet3_Scraper) |
  | Community build kits | [sendou.ink](https://sendou.ink/builds) |
- **Chats, settings and what it learns about you** stay in `localStorage`, per browser. Tell it your name, main weapon or division and it remembers between chats.

## Features

- **Chat** — asks about weapons, kits, maps, modes, story records and rotations
- **Home** — a widget dashboard you arrange yourself: drag, resize, add, remove
- **Live** — rotations, Top 500, Salmon Run, and a Builds browser with 16,000+ community kits
- **Goals** — X Power, rank and Top 500 tracking with pace estimates and streaks
- **My player** — save your SplatTag and SplatNet ID to find yourself on the boards and get rank alerts
- **Personalised answers** — it learns your division and main, and uses them by default
- **Navigation** — full sidebar, or a floating pill on any screen edge
- **Offline-friendly** — after first load it keeps working without a connection

## Run it

```bash
npx serve .        # or: python3 -m http.server 8000
```

Open `http://localhost:8000`. Use `http://`, not `file://` — browsers block local JSON fetches on `file://`.

## Data sources

Community datasets in `data/`, [splat3-data](https://gitlab.com/AeonSake2/splat3-data) for mined parameters, [splatoon3.ink](https://splatoon3.ink), [splatnet3-scraper](https://github.com/cesaregarza/SplatNet3_Scraper) for rankings, and [sendou.ink](https://sendou.ink/builds) for build kits (AGPL-3.0, credited and linked from every kit card).

Do you want to contribute data? Click (me)[https://docs.google.com/forms/d/1ZrlP2BIjxmYBdA7Sn6_p3iSiesabpVIu49DtgaOi9FI/edit]!

---

Fan project. Not affiliated with or endorsed by Nintendo. Splatoon is a trademark of Nintendo.