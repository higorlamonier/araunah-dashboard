#!/usr/bin/env python3
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

RAW_PATH = Path('data/raw/windsor_all_last_7d.json')
OUT_PATH = Path('data/social/latest.json')


def num(value):
    if value in (None, ''):
        return 0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def main():
    payload = json.loads(RAW_PATH.read_text())
    rows = payload.get('data', payload if isinstance(payload, list) else [])
    if not rows:
        raise SystemExit('No rows found in raw Windsor payload')

    by_date = defaultdict(lambda: {
        'leads': 0,
        'profile_visits': 0,
        'likes': 0,
        'feed_shares': 0,
        'campaigns': set(),
        'accounts': set(),
    })
    accounts = set()
    campaigns = set()
    source_names = set()
    media_urls = 0

    for row in rows:
        date = row.get('date') or 'unknown'
        account = row.get('account_name') or 'Conta sem nome'
        campaign = row.get('campaign') or 'Sem campanha'
        source = row.get('source') or 'facebook'
        leads = num(row.get('actions_lead'))
        visits = num(row.get('instagram_profile_visits'))
        likes = num(row.get('effective_instagram_media__like_count'))
        shared_to_feed = str(row.get('effective_instagram_media__is_shared_to_feed')).lower() in {'true', '1', 'yes'}

        accounts.add(account)
        campaigns.add(campaign)
        source_names.add(source)
        if row.get('effective_instagram_media__thumbnail_url'):
            media_urls += 1

        bucket = by_date[date]
        bucket['leads'] += leads
        bucket['profile_visits'] += visits
        bucket['likes'] += likes
        bucket['feed_shares'] += 1 if shared_to_feed else 0
        bucket['campaigns'].add(campaign)
        bucket['accounts'].add(account)

    dates = sorted(by_date)
    total_leads = sum(v['leads'] for v in by_date.values())
    total_visits = sum(v['profile_visits'] for v in by_date.values())
    total_likes = sum(v['likes'] for v in by_date.values())
    total_feed_shares = sum(v['feed_shares'] for v in by_date.values())

    daily = []
    for date in dates:
        bucket = by_date[date]
        daily.append({
            'date': date,
            'source': 'Meta Ads',
            'campaign': f"{len(bucket['campaigns'])} campanhas / {len(bucket['accounts'])} contas",
            'spend': 0,
            'impressions': int(bucket['profile_visits']),
            'clicks': int(bucket['likes']),
            'conversions': int(bucket['leads']),
            'revenue': 0,
            'sessions': int(bucket['profile_visits']),
        })

    insights = [
        {
            'severity': 'positive' if total_leads else 'neutral',
            'title': 'Captação Meta conectada',
            'detail': f'O snapshot Windsor trouxe {int(total_leads)} leads em {len(rows)} linhas nos últimos 7 dias.',
        },
        {
            'severity': 'positive' if total_visits else 'neutral',
            'title': 'Instagram Insights conectado',
            'detail': f'Foram registradas {int(total_visits)} visitas ao perfil e {int(total_likes)} curtidas em mídias no período.',
        },
        {
            'severity': 'neutral',
            'title': 'Próxima melhoria',
            'detail': 'Separar visualizações por conta/campanha e adicionar criativos com thumbnail quando validarmos o layout final.',
        },
    ]

    snapshot = {
        'client': {
            'id': 'social-meta-instagram',
            'name': 'Meta Ads + Instagram Insights',
            'segment': 'Social / Performance',
        },
        'period': {
            'start': dates[0],
            'end': dates[-1],
            'label': 'Últimos 7 dias',
        },
        'freshness': {
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'dataTimezone': 'UTC/Windsor',
            'sources': [
                {'source': 'Meta Ads', 'status': 'ok', 'lastDate': dates[-1]},
                {'source': 'GA4', 'status': 'missing'},
                {'source': 'Google Ads', 'status': 'missing'},
            ],
        },
        'totals': {
            'spend': 0,
            'impressions': int(total_visits),
            'clicks': int(total_likes),
            'conversions': int(total_leads),
            'revenue': 0,
            'sessions': int(total_visits),
        },
        'socialTotals': {
            'leads': int(total_leads),
            'instagramProfileVisits': int(total_visits),
            'instagramMediaLikes': int(total_likes),
            'feedShares': int(total_feed_shares),
            'rows': len(rows),
            'accounts': len(accounts),
            'campaigns': len(campaigns),
        },
        'daily': daily,
        'insights': insights,
        'metadata': {
            'rawSources': sorted(source_names),
            'rowsWithMediaThumbnail': media_urls,
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2))
    print(f'Wrote {OUT_PATH} from {len(rows)} raw rows')


if __name__ == '__main__':
    main()
