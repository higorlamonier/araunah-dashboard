#!/usr/bin/env python3
import json
import sys
from pathlib import Path

REQUIRED_TOP_LEVEL = {"client", "period", "freshness", "totals", "daily", "insights"}
REQUIRED_TOTALS = {"spend", "impressions", "clicks", "conversions", "revenue", "sessions"}
REQUIRED_DAILY = {"date", "source", "campaign", "spend", "impressions", "clicks", "conversions", "revenue"}


def fail(message: str) -> None:
    print(f"DATA_VALIDATION_ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def validate(path: Path) -> None:
    data = json.loads(path.read_text())
    missing = REQUIRED_TOP_LEVEL - set(data)
    if missing:
        fail(f"missing top-level keys: {sorted(missing)}")
    missing_totals = REQUIRED_TOTALS - set(data["totals"])
    if missing_totals:
        fail(f"missing totals keys: {sorted(missing_totals)}")
    if not data["daily"]:
        fail("daily rows cannot be empty")
    for i, row in enumerate(data["daily"]):
        missing_daily = REQUIRED_DAILY - set(row)
        if missing_daily:
            fail(f"daily row {i} missing keys: {sorted(missing_daily)}")
        for numeric in ["spend", "impressions", "clicks", "conversions", "revenue"]:
            if not isinstance(row[numeric], (int, float)):
                fail(f"daily row {i} has non-numeric {numeric}")
    text = path.read_text().lower()
    forbidden = ["windsor_api_key", "api_key=", "netlify_auth_token", "github_token", "openai_api_key"]
    leaked = [needle for needle in forbidden if needle in text]
    if leaked:
        fail(f"possible secret marker found: {leaked}")
    print(f"OK: {path} contains {len(data['daily'])} daily rows and passed schema/secret checks")


if __name__ == "__main__":
    validate(Path(sys.argv[1] if len(sys.argv) > 1 else "data/demo/latest.json"))
