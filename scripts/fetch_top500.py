"""
SplatGPT Top500 fetcher — uses splatnet3-scraper for serious scores.
Runs in GitHub Actions (static hosting can't hold your NSO token safely in-browser).

  pip install splatnet3_scraper
  export SN3S_SESSION_TOKEN="..."  # from s3s / nxapi login flow
  python scripts/fetch_top500.py

Writes: data/live/top500.json (committed by Action)
Live casual data (rotations) is NOT fetched here — frontend uses splatoon3.ink directly.
"""
import json, os, datetime, sys

OUT = "data/live/top500.json"

def main():
    token = os.environ.get("SN3S_SESSION_TOKEN", "")
    snapshot = {
        "updated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "source": "splatnet3-scraper" if token else "placeholder (no SN3S_SESSION_TOKEN secret set)",
        "x_rank_top500": [],
        "event_top_scores": [],
    }
    if not token:
        print("No SN3S_SESSION_TOKEN — writing placeholder. Add repo secret to enable real fetch.", file=sys.stderr)
    else:
        try:
            from splatnet3_scraper.query import QueryHandler
            h = QueryHandler.from_session_token(token)
            # X ranking / schedules — query names vary by lib version; try a few
            for qname in ["XBattleHistoriesQuery", "StageScheduleQuery", "VsHistoryDetailQuery"]:
                try:
                    resp = h.query(qname)
                    # Save raw shape hint; real parsing should map to {rank,name,x_power,weapon,mode}
                    print(f"{qname}: OK, keys={list((resp.data or {}).keys())[:5] if isinstance(resp.data, dict) else type(resp.data)}")
                    break
                except Exception as e:
                    print(f"{qname} failed: {e}")
            # TODO(contributors): parse X ranking nodes into snapshot["x_rank_top500"]
            # Expected entry: {"rank":1,"name":"...","x_power":3000.0,"weapon":"Splattershot","mode":"Splat Zones"}
        except Exception as e:
            print(f"splatnet3-scraper error: {e}", file=sys.stderr)
            snapshot["error"] = str(e)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # preserve example_entry if file existed
    try:
        old = json.load(open(OUT))
        if "example_entry" in old:
            snapshot["example_entry"] = old["example_entry"]
    except Exception:
        snapshot["example_entry"] = {"rank":1,"name":"splatgpt","x_power":3200.5,"weapon":"Splattershot","mode":"Splat Zones"}
    json.dump(snapshot, open(OUT,"w"), indent=2)
    print(f"Wrote {OUT}")

if __name__ == "__main__":
    main()
