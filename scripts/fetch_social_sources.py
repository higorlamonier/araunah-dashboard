#!/usr/bin/env python3
"""Fetch Facebook Ads and Instagram Insights from Windsor.ai for 7, 15 and 30-day windows."""
import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

BASE_URL = "https://connectors.windsor.ai"
OUT_DIR = Path("data/raw")
PERIODS = {
    "7d": "last_7d",
    "15d": "last_15d",
    "30d": "last_30d",
}
SOURCES = {
    "facebook": {
        "prefix": "facebook_ads",
        "fields": "date,datasource,account_name,source,campaign,clicks,spend,actions_lead,cost_per_action_type_lead",
    },
    "instagram": {
        "prefix": "instagram_insights",
        "fields": "date,account_name,source,followers_count,audience_gender_age_size,accounts_engaged,follows_and_unfollows,follows_count,follower_count_1d",
    },
}


def load_env_key() -> str:
    if os.environ.get("WINDSOR_API_KEY"):
        return os.environ["WINDSOR_API_KEY"]

    env_path = Path.home() / ".hermes" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("WINDSOR_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    raise SystemExit("WINDSOR_API_KEY missing. Add it to ~/.hermes/.env or export it in the shell.")


def fetch(connector: str, source: dict, period_key: str, date_preset: str, api_key: str) -> int:
    query = urlencode({
        "api_key": api_key,
        "date_preset": date_preset,
        "fields": source["fields"],
    })
    url = f"{BASE_URL}/{connector}?{query}"
    with urlopen(url, timeout=180) as response:
        payload = json.loads(response.read().decode("utf-8"))

    rows = payload.get("data", payload if isinstance(payload, list) else [])
    out_path = OUT_DIR / f"{source['prefix']}_last_{period_key}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    return len(rows) if hasattr(rows, "__len__") else 0


def main() -> None:
    api_key = load_env_key()
    for period_key, date_preset in PERIODS.items():
        for connector, source in SOURCES.items():
            row_count = fetch(connector, source, period_key, date_preset, api_key)
            print(f"{connector}:{period_key}: wrote {row_count} rows")


if __name__ == "__main__":
    main()
