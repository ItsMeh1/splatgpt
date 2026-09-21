"""
SplatGPT game-data importer — curates compact JSONs from the
AeonSake2/splat3-data dump (full Splatoon 3 parameter + text dump).

  python3 scripts/import_gamedata.py

Source: https://gitlab.com/AeonSake2/splat3-data/-/tree/master/BYML/JSON
License of upstream data: game parameters/text (community dump).
Writes (all under data/Splatoon3/):
  weapon_stats.json  - 330 weapons: EUen name, class, kit, special points,
                       shop price, unlock rank, season, range
  kits.json          - subs + specials with EUen names
  salmonids.json     - 26 Salmonid types + egg rewards + EUen names
  gear.json          - head/clothes/shoes: name, brand, ability, price, rarity
  abilities.json     - gear abilities + descriptions
Run monthly (see .github/workflows/update-gamedata.yml) or on patch days.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

BASE = ("https://gitlab.com/api/v4/projects/AeonSake2%2Fsplat3-data"
        "/repository/files/{path}/raw?ref=master")
CACHE = "/tmp/splat3-import"
OUT = "data/Splatoon3"


def fetch(rel):
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, rel.replace("/", "__"))
    if not os.path.exists(local):
        url = BASE.format(path=urllib.parse.quote(rel, safe=""))
        print(f"GET {rel}")
        req = urllib.request.Request(url, headers={"User-Agent": "SplatGPT/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(local, "wb") as f:
            f.write(r.read())
    with open(local) as f:
        return json.load(f)


def euen(msbt_list):
    """label -> English name from an MSBT JSON list."""
    out = {}
    for e in msbt_list:
        loc = e.get("locale", {})
        name = loc.get("EUen") or loc.get("USen") or ""
        if e.get("label") and name:
            out[e["label"]] = name
    return out


def main():
    os.makedirs(OUT, exist_ok=True)

    names_main = euen(fetch("MSBT/JSON_merged/CommonMsg/Weapon/WeaponName_Main.msbt.json"))
    names_sub = euen(fetch("MSBT/JSON_merged/CommonMsg/Weapon/WeaponName_Sub.msbt.json"))
    names_sp = euen(fetch("MSBT/JSON_merged/CommonMsg/Weapon/WeaponName_Special.msbt.json"))
    print(f"names: main={len(names_main)} sub={len(names_sub)} sp={len(names_sp)}")

    # ---- weapons (join on __RowId: Blaster_LightLong_00, etc.) ----
    wmain = fetch("BYML/JSON/RSDB/WeaponInfoMain.Product.b10.rstbl.byml.json")["rootNode"]
    def gyml_key(path):
        m = re.search(r"/([^/]+)\.spl__WeaponInfo(?:Sub|Special)\.gyml", path or "")
        return m.group(1) if m else (path or "")
    def clean_name(n, fallback):
        n = (n or "").strip()
        return n if n and n != "-" else fallback
    stats = []
    for r in wmain:
        if r.get("Type", "") != "Versus":
            continue  # skip Coop/Mission/Other variants of the same kit
        rowid = r.get("__RowId", "")
        name = clean_name(names_main.get(rowid, ""), "")
        if not name:
            continue
        sub = clean_name(names_sub.get(gyml_key(r.get("SubWeapon", "")), ""), gyml_key(r.get("SubWeapon", "")))
        sp = clean_name(names_sp.get(gyml_key(r.get("SpecialWeapon", "")), ""), gyml_key(r.get("SpecialWeapon", "")))
        stats.append({
            "id": sendou_slug(name),
            "name": name,
            "label": rowid,
            "mode": r.get("Type", ""),
            "sub": sub,
            "special": sp,
            "special_points": r.get("SpecialPoint"),
            "price": r.get("ShopPrice"),
            "unlock_rank": r.get("ShopUnlockRank"),
            "season": r.get("Season"),
            "range": r.get("Range"),
        })
    stats.sort(key=lambda w: w["name"])
    write("weapon_stats.json", stats)

    # ---- subs + specials (dedupe variants sharing a display name) ----
    wsub = fetch("BYML/JSON/RSDB/WeaponInfoSub.Product.b10.rstbl.byml.json")["rootNode"]
    wsp = fetch("BYML/JSON/RSDB/WeaponInfoSpecial.Product.b10.rstbl.byml.json")["rootNode"]
    def dedupe(rows, namemap):
        seen, out = set(), []
        for r in rows:
            n = clean_name(namemap.get(r.get("__RowId", ""), ""), "")
            if not n or n in seen:
                continue
            seen.add(n)
            out.append({"id": sendou_slug(n), "name": n, "label": r.get("__RowId", "")})
        return sorted(out, key=lambda e: e["name"])
    kits = {
        "subs": dedupe(wsub, names_sub),
        "specials": dedupe(wsp, names_sp),
    }
    print(f"kits: subs={len(kits['subs'])} specials={len(kits['specials'])}")
    write("kits.json", kits)

    # ---- salmonids ----
    coop = fetch("BYML/JSON/RSDB/CoopEnemyInfo.Product.b10.rstbl.byml.json")["rootNode"]
    enemy_names = euen(fetch("MSBT/JSON_merged/CommonMsg/Coop/CoopEnemy.msbt.json"))
    print(f"coop rows={len(coop)} enemy names={len(enemy_names)}")
    sal = []
    for i, r in enumerate(coop):
        etype = r.get("Type", f"Enemy{i}")
        sal.append({
            "id": sendou_slug(etype),
            "type": etype,
            "name": enemy_names.get(etype, etype),
            "category": r.get("Category"),
            "golden_eggs_on_kill": r.get("KillIkuraNum"),
            "golden_eggs_on_hit": r.get("HitIkuraNum"),
        })
    # CoopEnemy.msbt.json uses different labels? show overlap for debugging
    overlap = sum(1 for s in sal if s["name"] != s["type"])
    print(f"salmonid name matches: {overlap}/{len(sal)}")
    write("salmonids.json", sal)

    # ---- gear + abilities ----
    gear_names = {}
    for slot in ("Head", "Clothes", "Shoes"):
        gear_names[slot] = euen(fetch(
            f"MSBT/JSON_merged/CommonMsg/Gear/GearName_{slot}.msbt.json"))
    brands = euen(fetch("MSBT/JSON_merged/CommonMsg/Gear/GearBrandName.msbt.json"))
    powers = euen(fetch("MSBT/JSON_merged/CommonMsg/Gear/GearPowerName.msbt.json"))
    power_exp = euen(fetch("MSBT/JSON_merged/CommonMsg/Gear/GearPowerExp.msbt.json"))
    print(f"gear names: {[(k, len(v)) for k, v in gear_names.items()]} "
          f"brands={len(brands)} powers={len(powers)}")
    gear = []
    for slot, fname in (("head", "GearInfoHead"), ("clothes", "GearInfoClothes"),
                        ("shoes", "GearInfoShoes")):
        rows = fetch(f"BYML/JSON/RSDB/{fname}.Product.b10.rstbl.byml.json")["rootNode"]
        if slot == "head":
            print("Gear sample:", {k: rows[0].get(k) for k in
                  ("Label", "Brand", "Skill", "Price", "Rarity", "Season")})
        for r in rows:
            rowid = r.get("__RowId", "")
            # GearInfo row ids carry a slot prefix (Hed_/Clt_/Shs_);
            # MSBT name labels are the bare suffix (ACC003, ...)
            key = rowid.split("_", 1)[1] if "_" in rowid else rowid
            label = r.get("Label", "")
            name = gear_names[slot.capitalize()].get(key, "").strip() or label.strip()
            skill = r.get("Skill", "")
            ability = powers.get(skill, skill)
            gear.append({
                "id": sendou_slug(name),
                "gear_id": r.get("Id"),
                "name": name,
                "slot": slot,
                "brand": brands.get(r.get("Brand", ""), r.get("Brand", "")),
                "ability": ability,
                "ability_icon": ability_icon(ability),
                "ability_desc": power_exp.get(skill, ""),
                "image": gear_icon(slot, r.get("Id")),
                "price": r.get("Price"),
                "rarity": r.get("Rarity"),
                "season": r.get("Season"),
            })
    gear.sort(key=lambda g: (g["slot"], g["name"]))
    write("gear.json", gear)
    abilities = [
        {"id": sendou_slug(v), "name": v, "code": ABILITY_CODES.get(v, ""),
         "icon": ability_icon(v), "description": power_exp.get(k, "")}
        for k, v in sorted(powers.items(), key=lambda kv: kv[1])
    ]
    unmapped = [a["name"] for a in abilities if not a["code"]]
    print(f"abilities without icon code: {unmapped if unmapped else 'none'}")
    write("abilities.json", abilities)
    print("done.")


def sendou_slug(name):
    return (str(name or "").lower().replace("'", "").replace(".", "")
            .replace("’", ""))


# Ability name -> sendou.ink CDN code (verified against
# sendou-ink/sendou.ink app/modules/in-game-lists/abilities.ts
# and data-testid attributes on sendou.ink build pages).
ABILITY_CODES = {
    "Ink Saver (Main)": "ISM", "Ink Saver (Sub)": "ISS",
    "Ink Recovery Up": "IRU", "Run Speed Up": "RSU",
    "Swim Speed Up": "SSU", "Special Charge Up": "SCU",
    "Special Saver": "SS", "Special Power Up": "SPU",
    "Quick Respawn": "QR", "Quick Super Jump": "QSJ",
    "Sub Power Up": "BRU", "Ink Resistance Up": "RES",
    "Sub Resistance Up": "SRU", "Intensify Action": "IA",
    "Opening Gambit": "OG", "Last-Ditch Effort": "LDE",
    "Tenacity": "T", "Comeback": "CB", "Ninja Squid": "NS",
    "Haunt": "H", "Thermal Ink": "TI", "Respawn Punisher": "RP",
    "Ability Doubler": "AD", "Stealth Jump": "SJ",
    "Object Shredder": "OS", "Drop Roller": "DR",
}
ASSET_CDN = "https://sendou-assets.nyc3.cdn.digitaloceanspaces.com/img/"


def ability_icon(name):
    code = ABILITY_CODES.get(name or "")
    return f"{ASSET_CDN}abilities/{code}.avif" if code else ""


def gear_icon(slot, gear_id):
    if slot and gear_id:
        return f"{ASSET_CDN}gear/{slot}/{gear_id}.avif"
    return ""


def write(name, obj):
    # slugify ids consistently
    for e in (obj if isinstance(obj, list) else []):
        if isinstance(e, dict) and e.get("id"):
            e["id"] = re.sub(r"[^a-z0-9]+", "-", e["id"].lower()).strip("-")
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print(f"wrote {path} ({os.path.getsize(path)//1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
