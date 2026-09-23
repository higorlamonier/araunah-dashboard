import { useMemo } from 'react'
import type { DashboardPeriodData, PeriodKey } from '../types'

interface InstagramTabProps {
  data: DashboardPeriodData | null
  activePeriod: PeriodKey
  loading: boolean
}

function compactNum(val: number) {
  return new Intl.NumberFormat('pt-BR').format(val)
}

const ACCOUNTS = [
  {
    username: 'araunah.agua',
    name: 'Araunah Água & Agro',
    followers: 3037,
    posts: 157,
    status: 'Conectado (Graph API)',
    url: 'https://instagram.com/araunah.agua',
    isPrimary: true
  },
  {
    username: 'araunah.florestas',
    name: 'Araunah Florestas',
    followers: 1240,
    posts: 42,
    status: 'Monitorado',
    url: 'https://instagram.com',
    isPrimary: false
  },
  {
    username: 'araunah.tech',
    name: 'Araunah Tech',
    followers: 890,
    posts: 38,
    status: 'Monitorado',
    url: 'https://instagram.com',
    isPrimary: false
  }
]

const RECENT_POSTS = [
  {
    id: '18104387458968767',
    type: 'IMAGE',
    caption: 'Resultados comprovados no campo com tecnologia e controle biológico.',
    date: '2026-09-22',
    likes: 9,
    comments: 0
  },
  {
    id: '18066861614773709',
    type: 'REEL',
    caption: 'Operação da revolvedora de compostagem em fazenda parceira.',
    date: '2026-09-21',
    likes: 5,
    comments: 0
  },
  {
    id: '17968707402150101',
    type: 'REEL',
    caption: 'Eficiência e retenção hídrica com Polyter no solo.',
    date: '2026-09-16',
    likes: 9,
    comments: 1
  },
  {
    id: '18367220200244403',
    type: 'REEL',
    caption: 'Manejo correto de adubação orgânica enriquecida.',
    date: '2026-09-14',
    likes: 8,
    comments: 0
  }
]

export default function InstagramTab({ data, activePeriod, loading }: InstagramTabProps) {
  const igTotals = data?.instagramInsights?.totals ?? {
    followersCount: 3037,
    accountsEngaged: 0,
    followsAndUnfollows: 0,
    follows: 0,
    audienceGenderAgeSize: 3037
  }
  const daily = useMemo(() => data?.instagramInsights?.daily ?? [], [data?.instagramInsights?.daily])

  const maxEngaged = useMemo(() => Math.max(...daily.map((d) => d.accountsEngaged), 20), [daily])

  return (
    <div className="tab-pane animate-fade-in">
      {/* Contas Conectadas */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Contas Instagram da Araunah</h3>
            <p className="section-desc">Perfis comerciais integrados à Meta Graph API v22.0.</p>
          </div>
          {loading && <span className="tab-badge pink">Atualizando...</span>}
        </div>

        <div className="accounts-cards-grid">
          {ACCOUNTS.map((acc) => (
            <div key={acc.username} className={`account-card ${acc.isPrimary ? 'primary-account' : ''}`}>
              <div className="account-card-top">
                <div className="account-avatar">
                  <span>📸</span>
                </div>
                <div>
                  <h4 className="account-handle">@{acc.username}</h4>
                  <span className="account-desc">{acc.name}</span>
                </div>
                <span className={`badge ${acc.isPrimary ? 'badge-emerald' : 'badge-neutral'}`}>{acc.status}</span>
              </div>
              <div className="account-metrics-row">
                <div className="account-metric">
                  <span className="account-metric-val text-tabular">{compactNum(acc.followers)}</span>
                  <span className="account-metric-lbl">Seguidores</span>
                </div>
                <div className="account-metric">
                  <span className="account-metric-val text-tabular">{acc.posts}</span>
                  <span className="account-metric-lbl">Publicações</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* KPI Grid Orgânico */}
      <section className="kpi-grid">
        <div className="kpi-card highlight-glow">
          <div className="kpi-header">
            <span className="kpi-label">Seguidores (@araunah.agua)</span>
            <span className="badge badge-emerald">Oficial</span>
          </div>
          <div className="kpi-value text-tabular font-emerald">{compactNum(igTotals.followersCount || 3037)}</div>
          <div className="kpi-subtext">
            <span>Base ativa no Instagram</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Contas Engajadas</span>
            <span className="badge badge-cyan">Interações</span>
          </div>
          <div className="kpi-value text-tabular">{compactNum(igTotals.accountsEngaged)}</div>
          <div className="kpi-subtext">
            <span>Período de {activePeriod}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Visitas ao Perfil</span>
            <span className="badge badge-neutral">Tráfego</span>
          </div>
          <div className="kpi-value text-tabular">{compactNum(data?.socialTotals?.instagramProfileVisits ?? 0)}</div>
          <div className="kpi-subtext">
            <span>Conversão orgânica estimada</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Interações & Curtidas</span>
            <span className="badge badge-pink">Social</span>
          </div>
          <div className="kpi-value text-tabular">{compactNum(data?.socialTotals?.instagramMediaLikes ?? 0)}</div>
          <div className="kpi-subtext">
            <span>Reações em posts e reels</span>
          </div>
        </div>
      </section>

      {/* Gráfico de Tração Diária */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Contas Engajadas por Dia (Instagram)</h3>
            <p className="section-desc">Evolução do engajamento orgânico diário.</p>
          </div>
        </div>

        <div className="engagement-bars-container">
          {daily.map((item) => {
            const pct = Math.min(100, Math.round((item.accountsEngaged / maxEngaged) * 100))
            const [, month, day] = item.date.split('-')
            const dateFmt = `${day}/${month}`

            return (
              <div key={item.date} className="eng-bar-col">
                <div className="eng-track">
                  <span className="eng-val">{item.accountsEngaged}</span>
                  <div className="eng-fill" style={{ height: `${Math.max(pct, 12)}%` }} />
                </div>
                <span className="eng-label">{dateFmt}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Publicações e Reels Recentes */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h3 className="section-title">Publicações & Reels Recentes</h3>
            <p className="section-desc">Conteúdos publicados diretamente no perfil oficial.</p>
          </div>
        </div>

        <div className="posts-grid">
          {RECENT_POSTS.map((post) => (
            <div key={post.id} className="post-card">
              <div className="post-header">
                <span className="badge badge-neutral">{post.type}</span>
                <span className="post-date text-tabular">{post.date}</span>
              </div>
              <p className="post-caption">{post.caption}</p>
              <div className="post-stats">
                <span className="post-stat">❤️ {post.likes} curtidas</span>
                <span className="post-stat">💬 {post.comments} comentários</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
