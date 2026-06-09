#!/usr/bin/env python3
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

FACEBOOK_RAW = Path('data/raw/facebook_ads_last_7d.json')
INSTAGRAM_RAW = Path('data/raw/instagram_insights_last_7d.json')
OUT_PATH = Path('data/social/latest.json')


def rows_from(path: Path):
    payload = json.loads(path.read_text())
    return payload.get('data', payload if isinstance(payload, list) else [])


def num(value):
    if value in (None, ''):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def last_value_by_date(rows, field):
    dated = [(row.get('date') or '', num(row.get(field))) for row in rows if row.get('date')]
    if not dated:
        return 0
    return int(sorted(dated, key=lambda item: item[0])[-1][1])


def normalize_facebook(rows):
    by_date = defaultdict(lambda: {'clicks': 0.0, 'spend': 0.0, 'leads': 0.0, 'campaigns': set(), 'accounts': set()})
    accounts = set()
    campaigns = set()
    for row in rows:
        date = row.get('date') or 'unknown'
        account = row.get('account_name') or 'Conta sem nome'
        campaign = row.get('campaign') or 'Sem campanha'
        clicks = num(row.get('clicks'))
        spend = num(row.get('spend'))
        leads = num(row.get('actions_lead'))
        accounts.add(account)
        campaigns.add(campaign)
        bucket = by_date[date]
        bucket['clicks'] += clicks
        bucket['spend'] += spend
        bucket['leads'] += leads
        bucket['campaigns'].add(campaign)
        bucket['accounts'].add(account)

    total_clicks = sum(v['clicks'] for v in by_date.values())
    total_spend = sum(v['spend'] for v in by_date.values())
    total_leads = sum(v['leads'] for v in by_date.values())
    daily = [
        {
            'date': date,
            'clicks': int(values['clicks']),
            'spend': round(values['spend'], 2),
            'leads': int(values['leads']),
            'costPerLead': round(values['spend'] / values['leads'], 2) if values['leads'] else 0,
            'campaigns': len(values['campaigns']),
            'accounts': len(values['accounts']),
        }
        for date, values in sorted(by_date.items())
    ]
    return {
        'totals': {
            'clicks': int(total_clicks),
            'spend': round(total_spend, 2),
            'leads': int(total_leads),
            'costPerLead': round(total_spend / total_leads, 2) if total_leads else 0,
            'rows': len(rows),
            'accounts': len(accounts),
            'campaigns': len(campaigns),
        },
        'daily': daily,
    }


def normalize_instagram(rows):
    by_date = defaultdict(lambda: {
        'accountsEngaged': 0.0,
        'followsAndUnfollows': 0.0,
        'follows': 0.0,
        'audienceGenderAgeSize': 0.0,
        'accounts': set(),
    })
    accounts = set()
    for row in rows:
        date = row.get('date') or 'unknown'
        account = row.get('account_name') or 'Conta sem nome'
        accounts.add(account)
        bucket = by_date[date]
        bucket['accountsEngaged'] += num(row.get('accounts_engaged'))
        bucket['followsAndUnfollows'] += num(row.get('follows_and_unfollows'))
        bucket['follows'] += num(row.get('follows_count'))
        bucket['audienceGenderAgeSize'] += num(row.get('audience_gender_age_size'))
        bucket['accounts'].add(account)

    daily = [
        {
            'date': date,
            'accountsEngaged': int(values['accountsEngaged']),
            'followsAndUnfollows': int(values['followsAndUnfollows']),
            'follows': int(values['follows']),
            'audienceGenderAgeSize': int(values['audienceGenderAgeSize']),
            'accounts': len(values['accounts']),
        }
        for date, values in sorted(by_date.items())
    ]
    return {
        'totals': {
            'followersCount': last_value_by_date(rows, 'followers_count'),
            'followerCount1d': last_value_by_date(rows, 'follower_count_1d'),
            'accountsEngaged': int(sum(day['accountsEngaged'] for day in daily)),
            'followsAndUnfollows': int(sum(day['followsAndUnfollows'] for day in daily)),
            'follows': int(sum(day['follows'] for day in daily)),
            'audienceGenderAgeSize': int(sum(day['audienceGenderAgeSize'] for day in daily)),
            'rows': len(rows),
            'accounts': len(accounts),
        },
        'daily': daily,
    }


def main():
    facebook_rows = rows_from(FACEBOOK_RAW)
    instagram_rows = rows_from(INSTAGRAM_RAW)
    if not facebook_rows:
        raise SystemExit('No Facebook Ads rows found')
    if not instagram_rows:
        raise SystemExit('No Instagram Insights rows found')

    all_dates = sorted({*(r.get('date') for r in facebook_rows if r.get('date')), *(r.get('date') for r in instagram_rows if r.get('date'))})
    facebook = normalize_facebook(facebook_rows)
    instagram = normalize_instagram(instagram_rows)

    snapshot = {
        'client': {
            'id': 'meta-facebook-instagram',
            'name': 'Facebook Ads + Instagram Insights',
            'segment': 'Social / Performance',
        },
        'period': {
            'start': all_dates[0],
            'end': all_dates[-1],
            'label': 'Últimos 7 dias',
        },
        'freshness': {
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'dataTimezone': 'UTC/Windsor',
            'sources': [
                {'source': 'Meta Ads', 'status': 'ok', 'lastDate': max(r.get('date') for r in facebook_rows if r.get('date'))},
                {'source': 'GA4', 'status': 'missing'},
                {'source': 'Google Ads', 'status': 'missing'},
            ],
        },
        'facebookAds': facebook,
        'instagramInsights': instagram,
        'totals': {
            'spend': facebook['totals']['spend'],
            'impressions': instagram['totals']['accountsEngaged'],
            'clicks': facebook['totals']['clicks'],
            'conversions': facebook['totals']['leads'],
            'revenue': 0,
            'sessions': instagram['totals']['accountsEngaged'],
        },
        'socialTotals': {
            'leads': facebook['totals']['leads'],
            'instagramProfileVisits': instagram['totals']['accountsEngaged'],
            'instagramMediaLikes': instagram['totals']['follows'],
            'feedShares': 0,
            'rows': facebook['totals']['rows'] + instagram['totals']['rows'],
            'accounts': max(facebook['totals']['accounts'], instagram['totals']['accounts']),
            'campaigns': facebook['totals']['campaigns'],
        },
        'daily': [
            {
                'date': day['date'],
                'source': 'Meta Ads',
                'campaign': f"{day['campaigns']} campanhas / {day['accounts']} contas",
                'spend': day['spend'],
                'impressions': 0,
                'clicks': day['clicks'],
                'conversions': day['leads'],
                'revenue': 0,
                'sessions': 0,
            }
            for day in facebook['daily']
        ],
        'insights': [
            {
                'severity': 'positive' if facebook['totals']['leads'] else 'neutral',
                'title': 'Facebook Ads conectado',
                'detail': f"{facebook['totals']['leads']} leads, {facebook['totals']['clicks']} cliques e R$ {facebook['totals']['spend']:.2f} investidos nos últimos 7 dias.",
            },
            {
                'severity': 'positive' if instagram['totals']['accountsEngaged'] else 'neutral',
                'title': 'Instagram Insights conectado',
                'detail': f"{instagram['totals']['accountsEngaged']} contas engajadas e {instagram['totals']['followersCount']} seguidores no snapshot mais recente.",
            },
            {
                'severity': 'neutral',
                'title': 'Dados separados por fonte',
                'detail': 'O dashboard agora mantém Facebook Ads e Instagram Insights em blocos independentes para evitar mistura de métricas pagas e orgânicas.',
            },
        ],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2))
    print(f"Wrote {OUT_PATH}: facebook_rows={len(facebook_rows)} instagram_rows={len(instagram_rows)}")


if __name__ == '__main__':
    main()
