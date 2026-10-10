#!/usr/bin/env python3
"""Pre-scrape community build kits from sendou.ink into data/builds.json.

sendou.ink has no public JSON API for builds and sends no CORS headers on its
HTML pages, so a static, serverless site cannot fetch builds in the browser.
Instead we snapshot them at build time (this script / the GitHub Action) and
serve the result from our own origin. Kit data is from sendou.ink (AGPL-3.0);
the About page credits it.

Usage:
    python3 scripts/fetch_builds.py [--limit 40] [--weapons N] [--out data/builds.json]
"""
import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

MODE_TESTID = re.compile(r'data-testid="build-mode-([A-Z]{2})"')
TITLE_TESTID = re.compile(r'data-testid="build-title"[^>]*>(.*?)</h2>', re.S)
ABIL_TESTID = re.compile(r'data-testid="([A-Z]{2,3})-ability"')
# sendou renders the *active* ability at --ability-size:42 and every sub at 32,
# one main per row of four. That distinction is what makes a card read correctly.
ABIL_SLOT = re.compile(r'--ability-size:(\d+)px"\s+data-testid="([A-Z]{2,3})-ability"')
GEAR_IMG = re.compile(r'/img/gear/(headgear|clothes|shoes)/(\d+)\.avif')
WEAPON_IMG = re.compile(r'/img/main-weapons/(\d+)\.avif')
LINK_AUTHOR = re.compile(r'href="/u/([^/"]+)/builds"')
LINK_WEAPON = re.compile(r'href="/builds/([a-z0-9\-]+)"')
TIME_TAG = re.compile(r'<time[^>]*dateTime="([^"]+)"')
EDITS = re.compile(r'<span>\+<!-- -->\s*(\d+)\s*</span>')
CARD_SPLIT = re.compile(r'data-testid="build-card"')
MODE_NAMES = {"SZ": "Splat Zones", "TC": "Tower Control", "RM": "Rainmaker", "CB": "Clam Blitz", "HOK": "Hungry Nekosuke", "SNJ": "Splatnet Battle", "LRK": "League Battle"}


def slugify(name):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", re.sub(r"['.]", "", name.lower())))


def get(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # network flake -> retry
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def parse_cards(page):
    """Split the SSR'd markup into build cards and pull the stable data-testid fields.

    sendou.ink lays each card out as: mode icons, title, author/edits/date, the
    weapon image(s), then gear and ability slots interleaved. We keep the ability
    codes in document order so the card can be rebuilt faithfully.
    """
    out = []
    chunks = CARD_SPLIT.split(page)[1:]
    for chunk in chunks:
        title = TITLE_TESTID.search(chunk)
        modes = MODE_TESTID.findall(chunk)
        abilities = ABIL_TESTID.findall(chunk)
        # positional: a code can be the main ability in one row and a sub in another
        slots = ABIL_SLOT.findall(chunk)
        sizes = {}
        if len(slots) == len(abilities):
            sizes = {i: (sz == "42") for i, (sz, _) in enumerate(slots)}
        weapon_ids = WEAPON_IMG.findall(chunk)
        gear = []
        for slot, gid in GEAR_IMG.findall(chunk):
            g = {"slot": slot, "splatnet": int(gid)}
            if g not in gear:
                gear.append(g)
        author = LINK_AUTHOR.search(chunk)
        date = TIME_TAG.search(chunk)
        edits = EDITS.search(chunk)
        wlink = LINK_WEAPON.search(chunk)
        name = author.group(1) if author else None
        # some sendou profiles are addressed by a long internal id rather than a
        # handle; those read as gibberish, so keep them unlinked
        if name and name.isdigit():
            name = None
        out.append({
            "title": html.unescape(re.sub(r"<[^>]+>", "", title.group(1))).strip() if title else None,
            "weapon": wlink.group(1) if wlink else None,
            "weapons": [int(i) for i in weapon_ids],
            "modes": [MODE_NAMES.get(m, m) for m in modes],
            "modeCodes": modes,
            "abilities": abilities,
            # parallel 0/1 flags: 1 = the active (main) ability, 0 = a sub
            "abilMain": ["1" if sizes.get(i) else "0" for i in range(len(abilities))],
            "gear": gear,
            "author": name,
            "edits": int(edits.group(1)) if edits else 0,
            "date": date.group(1) if date else None,
        })
    return out


def weapon_slugs():
    """Every weapon page worth fetching.

    sendou.ink/builds only lists a slice of weapons per page, so union that
    listing with our own weapons.json names (slugified the same way) to cover
    the full Splatoon 3 roster.
    """
    ordered = []
    seen = set()
    add = lambda s: (None if not s or s in seen else (seen.add(s), ordered.append(s))[1])
    for s in re.findall(r'href="/builds/([a-z0-9\-]+)"', get("https://sendou.ink/builds")):
        add(s)
    try:
        with open(os.path.join(ROOT, "data", "Splatoon3", "weapons.json"), encoding="utf-8") as f:
            for w in json.load(f):
                add(slugify(w.get("name", "")))
    except Exception as e:
        print(f"  ! weapons.json: {e}", file=sys.stderr)
    return ordered


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40, help="builds per weapon")
    ap.add_argument("--weapons", type=int, default=0, help="only first N weapons (0 = all)")
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "builds.json"))
    args = ap.parse_args()

    slugs = weapon_slugs()
    if args.weapons:
        slugs = slugs[: args.weapons]
    print(f"probing {len(slugs)} weapon slugs", file=sys.stderr)

    data = {
        "source": "sendou.ink",
        "sourceUrl": "https://sendou.ink/builds",
        "license": "AGPL-3.0 (data from sendou.ink)",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "perWeapon": args.limit,
        "weapons": {},
    }
    for i, slug in enumerate(slugs, 1):
        try:
            page = get(f"https://sendou.ink/builds/{slug}?limit={args.limit}")
            cards = parse_cards(page)
            if cards:
                data["weapons"][slug] = cards
        except Exception as e:
            print(f"  ! {slug}: {e}", file=sys.stderr)
        print(f"[{i}/{len(slugs)}] {slug}: {len(data['weapons'].get(slug, []))} builds", file=sys.stderr)
        time.sleep(0.4)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    total = sum(len(v) for v in data["weapons"].values())
    size = os.path.getsize(args.out)
    print(f"wrote {args.out}: {len(data['weapons'])} weapons, {total} builds, {size/1e6:.2f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()