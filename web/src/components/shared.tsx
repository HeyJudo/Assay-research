import type { ReactNode } from 'react'
import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { agentLabel, money, percent } from '@/lib/metrics'
import type { LeaderboardRow } from '@/types'

export function Heading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-heading"><div><p className="sr-only">{eyebrow}</p><h1>{title}</h1><p className="description">{description}</p></div>{action}</header>
}
export function LoadState({ error, retry }: { error?: string; retry?: () => void }) {
  return <div className="load-state" role={error ? 'alert' : 'status'}>{error ? <AlertCircle size={22} /> : <LoaderCircle className="spin" size={22} />}<p>{error || 'Loading research records…'}</p>{error && retry && <Button variant="outline" onClick={retry}>Try again</Button>}</div>
}
export function Empty({ children }: { children: ReactNode }) { return <div className="load-state">{children}</div> }
export function LeaderTable({ rows, scores = false }: { rows: (LeaderboardRow & { score?: number })[]; scores?: boolean }) {
  return <Table><TableHeader><TableRow><TableHead>Research agent</TableHead><TableHead>{scores ? 'Your score' : 'Accuracy'}</TableHead>{scores && <TableHead>Accuracy</TableHead>}<TableHead>Cost / correct</TableHead><TableHead>Trap resistance</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={row.agent_id}><TableCell><div className="agent-cell"><span className={`rank ${index === 0 ? 'rank-first' : ''}`}>{String(index + 1).padStart(2, '0')}</span><div><Link to={`/compare?a=${row.agent_id}`} className="agent-name">{agentLabel(row.agent_id)} <ArrowRight size={13} /></Link><span className="cell-note">{row.agent_id === 'gpt-researcher' ? 'External agent' : 'Assay Briefing Agent'}</span></div>{index === 0 && <Badge variant="secondary">Top fit</Badge>}</div></TableCell><TableCell><span className="metric-number">{scores ? row.score?.toFixed(1) : percent(row.accuracy)}</span></TableCell>{scores && <TableCell>{percent(row.accuracy)}</TableCell>}<TableCell className="mono">{money(row.cost_per_correct)}</TableCell><TableCell>{percent(row.trap_resistance)}</TableCell><TableCell><Link className="text-link" to={`/compare?a=${row.agent_id}`}>Compare <ArrowRight size={14} /></Link><details className="row-details"><summary>More metrics</summary><p>Trap resistance {percent(row.trap_resistance)} · Honesty {percent(row.honesty)} · pass³ {percent(row.pass3)}</p><p>{row.avg_steps} steps · {row.avg_tokens.toLocaleString()} tokens · {row.avg_duration_s}s · {row.runs} runs</p></details></TableCell></TableRow>)}</TableBody></Table>
}
export function safeUrl(url: string | null) { if (!url) return null; try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? u.href : null } catch { return null } }
export function BriefText({ text }: { text: string }) {
  return <div className="brief-text">{text.split('\n').map((line, i) => {
    const content = line.replace(/^#{1,3}\s+/, '').replace(/^-\s+/, '')
    if (line.startsWith('# ')) return <h2 key={i}>{content}</h2>
    if (line.startsWith('## ')) return <h3 key={i} className={`brief-section section-${content.toLowerCase().replaceAll(' ', '-')}`}>{content}</h3>
    if (!line.trim()) return null
    const parts = content.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\))/g)
    return <p key={i}>{line.startsWith('- ') && <span className="bullet">• </span>}{parts.map((part, j) => { const m = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part); return m && safeUrl(m[2]) ? <a key={j} href={safeUrl(m[2])!} target="_blank" rel="noreferrer">[{m[1]}]</a> : part })}</p>
  })}</div>
}
