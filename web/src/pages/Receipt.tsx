import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, FileCheck2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BriefText, Heading, LoadState, safeUrl } from '@/components/shared'
import { data } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, money, percent } from '@/lib/metrics'
import type { Step } from '@/types'

export default function Receipt() {
  const { id = '' } = useParams()
  const query = useData(() => data.run(id), id)
  const [filter, setFilter] = useState('all')
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const run = query.value
  const c = run.config
  const claims = run.claims.filter(claim => filter === 'all' || claim.verdict === filter)
  const phaseCosts = run.steps.reduce<Record<string, Step[]>>((groups, step) => {
    (groups[step.phase] ??= []).push(step)
    return groups
  }, {})
  function download() { const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${run.id}.json`; a.click(); URL.revokeObjectURL(url) }
  return <><Link className="text-link back-link" to="/compare"><ArrowLeft size={14} />Back to comparison</Link><Heading eyebrow="THE EVIDENCE BEHIND THE ANSWER" title={`${agentLabel(run.agent_id)} · Run receipt`} description={`${run.task_id} · Repeat ${run.repeat} · ${run.id}`} action={<Button variant="outline" onClick={download}><Download size={16} />Export JSON</Button>} />
    <div className="stat-grid">{[['Outcome', run.status === 'running' ? 'Running' : run.metrics.success ? 'Passed' : 'Did not pass'], ['Recorded model cost', money(run.metrics.cost_usd)], ['Duration', run.duration_s == null ? '—' : `${run.duration_s.toFixed(1)}s`], ['Claims supported', percent(run.metrics.claims_supported_pct)]].map(([label, value]) => <Card key={label}><CardContent><small>{label}</small><h2>{value}</h2></CardContent></Card>)}</div>
    <Card><CardContent><div className="config-line"><span>Version <b>{c.agent_version}</b></span><span>Prompt <code>{c.prompt_hash}</code></span><span>Pool <code>{c.pool_version}</code></span><span>Seed <b>{c.trap_seed ?? 'none'}</b></span><span>Trap <b>{run.trap?.replaceAll('_', ' ') ?? 'off'}</b></span><span>Fallback <b>{c.fallback_used ? 'Yes · flag for review' : 'No'}</b></span></div><p className="fine-print">Models: {c.models.join(' → ')}. Historical fixture model names are displayed as recorded. Research and judge charges are not separately provided in this run contract.</p></CardContent></Card>
    <div className="receipt-layout"><Card><CardHeader><div><h2>Execution timeline</h2><p>{run.steps.length} recorded steps · {run.metrics.tool_calls} tool calls · {run.metrics.tokens.toLocaleString()} tokens</p></div></CardHeader><CardContent><ol className="timeline">{run.steps.map(step => <li key={step.i}><span className={`step-dot dot-${step.kind}`} /><div><strong>{step.kind === 'llm' ? 'Model call' : step.kind === 'switch' ? 'Model switch' : step.kind}<span>{step.t.toFixed(1)}s</span></strong><p>{step.detail}</p><small>{step.phase}{step.model && ` · ${step.model}`} · {step.tokens.toLocaleString()} tokens · {money(step.cost_usd)}</small></div></li>)}</ol>{!run.steps.length && <p>No execution steps were recorded.</p>}</CardContent></Card><div className="stack"><Card><CardHeader><h2>Cost by model</h2></CardHeader><CardContent>{Object.entries(run.metrics.cost_by_model).map(([model, cost]) => <div className="cost-row" key={model}><span>{model}</span><b className="mono">{money(cost)}</b></div>)}<div className="cost-total"><span>Total recorded</span><b>{money(run.metrics.cost_usd)}</b></div></CardContent></Card><Card><CardHeader><h2>Cost by phase</h2></CardHeader><CardContent>{Object.entries(phaseCosts).map(([phase, steps]) => <div className="cost-row" key={phase}><span>{phase}</span><b className="mono">{money(steps!.reduce((s, step) => s + step.cost_usd, 0))}</b></div>)}<p className="fine-print">Derived from recorded steps. May differ from totals when accounting is incomplete.</p></CardContent></Card><Card className="soft-card"><CardContent><FileCheck2 size={25} /><h3>Evidence over confidence.</h3><p>Inspect the exact passage behind a claim. A citation alone is not verification.</p><Link className="text-link" to="#claims">Review claims <ArrowRight size={14} /></Link></CardContent></Card></div></div>
    <Card id="claims"><CardHeader><div><h2>Claim-by-claim evidence</h2><p>{run.claims.length} claims checked against their cited source.</p></div><select aria-label="Filter claims" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All verdicts</option>{['supported', 'unsupported', 'trap', 'not_found'].map(v => <option value={v} key={v}>{v.replaceAll('_', ' ')}</option>)}</select></CardHeader><CardContent><div className="claims-list">{claims.map((claim, i) => <article key={i} className={`claim claim-${claim.verdict}`}><div><span className="claim-number">{String(i + 1).padStart(2, '0')}</span><Badge variant={claim.verdict === 'supported' ? 'secondary' : 'destructive'}>{claim.verdict === 'supported' && <Check size={12} />}{claim.verdict.replaceAll('_', ' ')}</Badge></div><h3>{claim.text}</h3>{claim.source_quote ? <blockquote>{claim.source_quote}</blockquote> : <p className="muted">No supporting passage recorded. This is not a verified claim.</p>}{safeUrl(claim.source_url) && <a href={safeUrl(claim.source_url)!} target="_blank" rel="noreferrer" className="source-link">{claim.source_url}<ExternalLink size={13} /></a>}</article>)}</div>{!claims.length && <p className="empty-message">No claims match this filter. Simulated runs do not invent citation evidence.</p>}</CardContent></Card>
    <Card><CardHeader><h2>Agent output</h2><Badge variant="outline">As recorded</Badge></CardHeader><CardContent><BriefText text={run.output.text || 'No output recorded.'} /></CardContent></Card>
  </>
}
