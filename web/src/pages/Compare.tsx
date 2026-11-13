import { useSearchParams, Link } from 'react-router'
import { ArrowRight, ArrowLeftRight } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Heading, LoadState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { data } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, aggregate, money, percent } from '@/lib/metrics'

export default function Compare() {
  const [params, setParams] = useSearchParams()
  const scope = params.get('scope') ?? 'full'
  const batch = params.get('batch') ?? ''
  const query = useData(() => Promise.all([data.leaderboard(), data.runs(scope === 'batch' ? batch : undefined).then(rs => Promise.all(rs.map(r => data.run(r.id))))]), `${scope}:${batch}`)
  const aId = params.get('a') ?? 'briefing-evidence-gated'
  const bId = params.get('b') ?? (aId === 'briefing-baseline' ? 'briefing-cheap-first' : 'briefing-baseline')
  function update(key: string, value: string) { setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next }) }
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [rows, records] = query.value
  const a = scope === 'batch' ? aggregate(records, aId) : rows.find(r => r.agent_id === aId)
  const b = scope === 'batch' ? aggregate(records, bId) : rows.find(r => r.agent_id === bId)
  const selectedRecords = records.filter(r => r.agent_id === aId || r.agent_id === bId)
  return <><Heading eyebrow="HEAD TO HEAD" title="See what one change makes." description="Compare outcomes, not promises. Each number has a scope, and every run has a receipt." />
    <Card><CardContent><div className="compare-controls"><label>Agent A<select value={aId} onChange={e => update('a', e.target.value)}>{rows.map(r => <option key={r.agent_id} value={r.agent_id}>{agentLabel(r.agent_id)}</option>)}</select></label><ArrowLeftRight size={22} className="muted" /><label>Agent B<select value={bId} onChange={e => update('b', e.target.value)}>{rows.map(r => <option key={r.agent_id} value={r.agent_id}>{agentLabel(r.agent_id)}</option>)}</select></label><label>Scope<select value={scope} onChange={e => update('scope', e.target.value)}><option value="full">Full benchmark</option><option value="batch" disabled={!batch}>This batch</option></select></label></div></CardContent></Card>
    {aId === bId ? <div className="notice">Select two different agents for a meaningful comparison.</div> : a && b ? <><div className="recommendation"><span className="eyebrow">WHAT THE NUMBERS SAY</span><h2>{Number.isFinite(a.accuracy) && Number.isFinite(b.accuracy) ? Math.abs(a.accuracy - b.accuracy) < .0001 ? 'These agents have equal accuracy in this scope.' : `${agentLabel(a.accuracy > b.accuracy ? aId : bId)} has higher accuracy.` : 'This scope has no clean, answerable accuracy result.'}</h2><p>This verdict is calculated from the displayed values. Cost and honesty may favor a different configuration.</p></div><Card><CardHeader><h2>Metrics at a glance</h2><span className="muted">{scope === 'batch' ? batch : 'Full benchmark · sample aggregates'}</span></CardHeader><div className="table-scroll"><table className="compare-table"><thead><tr><th>Metric</th><th>{agentLabel(aId)}</th><th>{agentLabel(bId)}</th><th>A − B</th></tr></thead><tbody>{([
      ['Accuracy', a.accuracy, b.accuracy, 'pct'], ['Cost per correct', a.cost_per_correct, b.cost_per_correct, 'money'], ['Trap resistance', a.trap_resistance, b.trap_resistance, 'pct'], ['Honesty', a.honesty, b.honesty, 'pct'], ['pass³ reliability', a.pass3, b.pass3, 'pct'], ['Average steps', a.avg_steps, b.avg_steps, 'num'], ['Average tokens', a.avg_tokens, b.avg_tokens, 'num'], ['Average duration (s)', a.avg_duration_s, b.avg_duration_s, 'num'],
    ] as const).map(([label, av, bv, kind]) => <tr key={label}><td>{label}</td><td>{kind === 'pct' ? percent(av) : kind === 'money' ? money(av) : av.toLocaleString()}</td><td>{kind === 'pct' ? percent(bv) : kind === 'money' ? money(bv) : bv.toLocaleString()}</td><td className="mono">{!Number.isFinite(av - bv) ? '—' : kind === 'pct' ? `${((av - bv) * 100).toFixed(1)} pp` : kind === 'money' ? money(av - bv) : (av - bv).toFixed(1)}</td></tr>)}</tbody></table></div><div className="panel-foot">No spread estimate is supplied by the aggregate API. Missing denominators are shown as —, not zero.</div></Card></> : <div className="notice">No completed records for both agents in this batch. Choose another pair or the full benchmark.</div>}
    <Card><CardHeader><div><h2>Inspect the underlying receipts</h2><p>{scope === 'full' ? 'Available examples only, not all runs behind the aggregate fixtures.' : 'Completed records in this batch.'}</p></div></CardHeader><CardContent><div className="receipt-links">{selectedRecords.length ? selectedRecords.map(r => <Link key={r.id} to={`/runs/${r.id}`}><strong>{agentLabel(r.agent_id)}</strong><span>{r.task_id} · Repeat {r.repeat}</span><ArrowRight size={16} /></Link>) : <p>No receipts available in this scope.</p>}</div>{scope === 'batch' && <p className="fine-print">Repeatability against the full benchmark is not asserted without matching task-level evidence.</p>}</CardContent></Card><Button variant="outline" asChild><Link to="/run">Start another batch</Link></Button>
  </>
}
