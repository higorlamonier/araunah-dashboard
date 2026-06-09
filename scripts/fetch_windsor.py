#!/usr/bin/env python3
"""Fetch Windsor.ai connector data server-side.

Usage:
  WINDSOR_API_KEY=*** python scripts/fetch_windsor.py --connector facebook --fields date,campaign,spend,clicks --date-preset last_30d --out data/raw/facebook.json

This script intentionally refuses to run without WINDSOR_API_KEY.
Commit only sanitized/aggregated snapshots after validation.
"""
import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

BASE_URL = "https://connectors.windsor.ai"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--connector", required=True, choices=["facebook", "google_ads", "googleanalytics4", "all"])
    parser.add_argument("--fields", required=True)
    parser.add_argument("--date-preset", default="last_30d")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    api_key = os.environ.get("WINDSOR_API_KEY")
    if not api_key:
        print("WINDSOR_API_KEY is required in the server environment", file=sys.stderr)
        return 2

    query = urlencode({"api_key": api_key, "fields": args.fields, "date_preset": args.date_preset})
    url = f"{BASE_URL}/{args.connector}?{query}"
    with urlopen(url, timeout=180) as response:
        payload = json.loads(response.read().decode("utf-8"))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
