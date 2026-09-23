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
    "7d": "last_7dT",
    "15d": "last_15dT",
    "30d": "last_30dT",
}
SOURCES = {
    "facebook": {
        "source_value": "facebook",
        "prefix": "facebook_ads",
        "fields": "date,datasource,account_name,source,campaign,clicks,spend,actions_lead,cost_per_action_type_lead",
    },
    "instagram": {
        "source_value": "instagram",
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


def fetch(period_key: str, date_preset: str, api_key: str) -> dict[str, int]:
    query = urlencode({
        "api_key": api_key,
        "date_preset": date_preset,
    })
    counts = {}
    for name, source in SOURCES.items():
        source_query = f"{query}&{urlencode({'fields': source['fields']})}"
        with urlopen(f"{BASE_URL}/{name}?{source_query}", timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
        source_rows = payload.get("data", payload if isinstance(payload, list) else [])
        if not source_rows:
            raise SystemExit(f"No {name} rows found for {period_key}")
        out_path = OUT_DIR / f"{source['prefix']}_last_{period_key}.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps({'data': source_rows}, ensure_ascii=False, indent=2))
        counts[name] = len(source_rows)
    return counts


def main() -> None:
    api_key = load_env_key()
    for period_key, date_preset in PERIODS.items():
        counts = fetch(period_key, date_preset, api_key)
        print(f"{period_key}: facebook={counts['facebook']} instagram={counts['instagram']} rows")


if __name__ == "__main__":
    main()
