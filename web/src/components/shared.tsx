import type { ReactNode } from 'react'
import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { agentLabel, money, percent } from '@/lib/metrics'
import { parseBrief, safeUrl } from '@/lib/briefing-output'
import type { Inline } from '@/lib/briefing-output'
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
export { safeUrl }
function Inlines({ items }: { items: Inline[] }) {
  return <>{items.map((item, i) => 'cite' in item
    ? <a key={i} className="brief-cite" href={item.url} target="_blank" rel="noopener noreferrer" title={item.domain} aria-label={`Source ${item.cite}: ${item.domain}`}>{item.cite}<span className="brief-cite-domain" aria-hidden="true">{item.domain}</span></a>
    : item.bold ? <strong key={i}>{item.text}</strong> : item.text)}</>
}
/** `sources` fixes citation numbers to match a Sources list. Without it, numbers follow first appearance in the text. */
export function BriefText({ text, sources }: { text: string; sources?: string[] }) {
  return <div className="brief-text">{parseBrief(text, sources).map((block, i) => {
    if (block.kind === 'ul') return <ul key={i}>{block.items.map((item, j) => <li key={j}><Inlines items={item} /></li>)}</ul>
    const content = block.inlines.map(item => 'text' in item ? item.text : '').join('')
    if (block.kind === 'h1') return <h2 key={i}>{content}</h2>
    if (block.kind === 'h2') return <h3 key={i} className={`brief-section section-${content.toLowerCase().replaceAll(' ', '-')}`}>{content}</h3>
    return <p key={i}><Inlines items={block.inlines} /></p>
  })}</div>
}
