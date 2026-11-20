import { Fragment } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { Circle, List, Plus, ReceiptText, Trophy, X, Check } from 'lucide-react'
import { Coins, Flag, Shield, Target } from 'kubai-icons-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CountUp } from '@/components/count-up'
import { BenchmarkRail } from '@/components/benchmark-rail'
import { LoadState } from '@/components/shared'
import { data, sampleData } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, aggregate, money, percent } from '@/lib/metrics'
import { hasNumber, metricComparison, resultVerdict } from '@/lib/result-verdict'
import type { LeaderboardRow, RunSummary } from '@/types'
import './results.css'

const spring = { type: 'spring' as const, stiffness: 220, damping: 32 }
const metricDefinitions = [
  { key: 'accuracy', label: 'Accuracy', icon: Target, note: 'Clean, answerable tasks only. Higher is better.' },
  { key: 'cost_per_correct', label: 'Cost per correct', icon: Coins, note: 'List price. Shorter bar is better.' },
  { key: 'trap_resistance', label: 'Trap resistance', icon: Shield, note: 'Share of planted traps it did not fall for.' },
  { key: 'honesty', label: 'Honesty', icon: Flag, note: 'Correct abstentions, with over-refusals counted against it.' },
] as const

function ReceiptGrid({ records, params }: { records: RunSummary[]; params: URLSearchParams }) {
  const groups = new Map<string, RunSummary[]>()
  records.forEach(run => {
    const key = `${run.batch_id}:${run.task_id}:${run.trap ?? 'clean'}`
    groups.set(key, [...(groups.get(key) ?? []), run])
  })
  return <div className="results-receipt-groups">{[...groups.entries()].map(([group, runs]) => <div key={group} className="results-receipt-group">
    <div className="results-receipt-context"><strong>{runs[0].task_id}</strong><span>{runs[0].trap?.replaceAll('_', ' ') ?? 'No trap'} · {runs[0].batch_id}</span></div>
    <div className="results-receipt-grid">
      <span aria-hidden="true" />{[1, 2, 3].map(repeat => <span key={repeat} className="results-repeat-label">Repeat {repeat}</span>)}
      {[...new Set(runs.map(run => run.agent_id))].map(agent => <Fragment key={agent}><strong className="results-receipt-agent">{agentLabel(agent)}</strong>{[1, 2, 3].map(repeat => {
        const matches = runs.filter(run => run.agent_id === agent && run.repeat === repeat)
        return <div key={repeat} className="results-receipt-cell">{matches.length ? matches.map(run => {
          const passed = run.status === 'done' && run.metrics.success
          const label = run.status === 'running' ? 'Running' : run.status === 'error' ? 'Error' : run.status === 'budget_exceeded' ? 'Budget cap' : passed ? 'Passed' : 'Failed'
          const search = new URLSearchParams(params); search.set('run', run.id)
          return <Link key={run.id} className={`results-runc ${run.status === 'running' ? 'pending' : passed ? 'pass' : 'fail'}`} to={`?${search}`} aria-label={`${agentLabel(agent)} repeat ${repeat}, ${label.toLowerCase()}`} title={run.id}>{run.status === 'running' ? <Circle size={15} /> : passed ? <Check size={16} /> : <X size={16} />}<span>{label}</span></Link>
        }) : <span className="results-no-run">No run</span>}</div>
      })}</Fragment>)}
    </div>
  </div>)}</div>
}

export default function Results() {
  const [params, setParams] = useSearchParams()
  const reduced = useReducedMotion()
  const batch = params.get('batch') ?? ''
  const scope = params.get('scope') === 'batch' && batch ? 'batch' : 'full'
  const query = useData(() => Promise.all([data.leaderboard(), data.runs(scope === 'batch' ? batch : undefined), data.agents()]), `${scope}:${batch}`)
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [rows, records, agents] = query.value
  const ids = scope === 'batch' ? [...new Set(records.map(run => run.agent_id))] : [...new Set([...rows.map(row => row.agent_id), ...agents.map(agent => agent.id)])]
  const aId = ids.includes(params.get('a') ?? '') ? params.get('a')! : ids.includes('briefing-baseline') ? 'briefing-baseline' : ids[0] ?? ''
  const bId = ids.includes(params.get('b') ?? '') && params.get('b') !== aId ? params.get('b')! : ids.find(id => id === 'briefing-cheap-first' && id !== aId) ?? ids.find(id => id !== aId) ?? ''
  const a = scope === 'batch' ? aggregate(records, aId) : rows.find(row => row.agent_id === aId)
  const b = scope === 'batch' ? aggregate(records, bId) : rows.find(row => row.agent_id === bId)
  const verdict = resultVerdict(a, b, agentLabel(aId), agentLabel(bId))
  const reveal = { initial: reduced ? false as const : { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .15 }, transition: spring }
  const selected = [a, b].filter((row): row is LeaderboardRow => !!row)
  function update(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous); next.set(key, value)
      if (key === 'a' && value === bId) next.set('b', aId)
      if (key === 'b' && value === aId) next.set('a', bId)
      return next
    })
  }
  return <div className="results-page">
    <div className="results-topline"><BenchmarkRail stage={5} /><Button variant="outline" asChild><Link to="/run?new=1"><Plus size={16} />New benchmark</Link></Button></div>
    <motion.section className="results-hero" {...reveal} aria-labelledby="results-title">
      <div className="results-hero-main"><span className="results-trophy"><Trophy size={36} /></span><div><h1 id="results-title">{verdict.title}</h1><p>{verdict.description}</p></div></div>
      <div className="results-headline-number"><div className="mono"><CountUp value={verdict.value} format={value => `${Math.round(value)}${verdict.label.includes('percentage points') ? '' : '%'}`} /></div><span>{verdict.label}</span></div>
    </motion.section>
    {(sampleData || batch.startsWith('demo_') || (batch.startsWith('replay_') && scope === 'batch')) && <p className="results-data-note">{batch.startsWith('replay_') && scope === 'batch' ? 'Replay of recorded benchmark runs.' : scope === 'batch' ? 'Demo simulation. These outcomes demonstrate the interface and are not benchmark findings.' : 'Sample results. Illustrative aggregates are shown with their available example receipts.'}</p>}
    <div className="results-controls">
      <div className="results-agent-pickers"><span className="results-swatch agent-a" aria-hidden="true" /><Select value={aId || 'unavailable'} onValueChange={value => update('a', value)} disabled={!ids.length}><SelectTrigger aria-label="First agent"><SelectValue placeholder="First agent" /></SelectTrigger><SelectContent>{ids.map(id => <SelectItem value={id} key={id}>{agentLabel(id)}</SelectItem>)}</SelectContent></Select><span className="results-against">against</span><span className="results-swatch agent-b" aria-hidden="true" /><Select value={bId || 'unavailable'} onValueChange={value => update('b', value)} disabled={ids.length < 2}><SelectTrigger aria-label="Second agent">{ids.length < 2 ? <span>One agent</span> : <SelectValue placeholder="Second agent" />}</SelectTrigger><SelectContent>{ids.map(id => <SelectItem value={id} key={id}>{agentLabel(id)}</SelectItem>)}</SelectContent></Select></div>
      <Tabs value={scope} onValueChange={value => update('scope', value)} className="results-scope"><TabsList aria-label="Results scope"><TabsTrigger value="batch" disabled={!batch}>This batch</TabsTrigger><TabsTrigger value="full">Full benchmark</TabsTrigger></TabsList></Tabs>
    </div>
    {(!a || (!b && ids.length > 1)) && <p className="results-empty">No completed result for {a ? agentLabel(bId) : agentLabel(aId) || 'an agent'} in this scope. Available records remain below.</p>}
    <div className="results-metrics">{metricDefinitions.map(({ key, label, icon: Icon, note }) => {
      const av = a?.[key], bv = b?.[key], cost = key === 'cost_per_correct'
      const format = cost ? money : percent
      const comparison = metricComparison(av, bv, cost ? 'cost' : 'percent')
      const better = hasNumber(av) && hasNumber(bv) && Math.abs(av - bv) > .000001 ? (cost ? av < bv : av > bv) ? aId : bId : ''
      const costMax = Math.max(hasNumber(av) ? av : 0, hasNumber(bv) ? bv : 0)
      const ranges = key === 'accuracy' && a && b && [a.accuracy_low, a.accuracy_high, b.accuracy_low, b.accuracy_high].every(hasNumber)
      return <motion.section key={key} className={`results-tile ${cost && comparison.includes('cheaper') ? 'results-cost-highlight' : ''}`} {...reveal}>
        <div className="results-tile-title"><span className="results-icon"><Icon size={23} color="var(--primary)" trigger="none" /></span><h2>{label}</h2></div>
        <span className={`results-chip ${comparison === 'Tie' || comparison === 'Not comparable' ? 'equal' : 'better'}`}>{better ? `${agentLabel(better)}: ` : ''}{comparison}</span>
        <div className="results-bar-rows">{[[aId, av, 'a'], [bId, bv, 'b']].filter(([id]) => id).map(([id, value, side]) => <a href="#results-receipts" className="results-bar-row" key={String(side)} aria-label={`${agentLabel(String(id))}: ${label} ${format(value as number | null | undefined)}. See receipts.`}><span title={agentLabel(String(id))}>{agentLabel(String(id))}</span><span className="results-bar-track"><motion.i className={`agent-${side}`} initial={reduced ? false : { scaleX: 0 }} whileInView={{ scaleX: hasNumber(value as number | null | undefined) ? cost ? costMax ? Math.max(0, Number(value) / costMax) : 0 : Math.max(0, Math.min(1, Number(value))) : 0 }} viewport={{ once: true }} transition={spring} /></span><strong className="mono"><CountUp value={value as number | null | undefined} format={format} /></strong></a>)}</div>
        <p>{ranges ? `Observed ranges: ${percent(a!.accuracy_low)} to ${percent(a!.accuracy_high)} and ${percent(b!.accuracy_low)} to ${percent(b!.accuracy_high)}.` : note}{!hasNumber(av) || (bId && !hasNumber(bv)) ? ' N/A means this scope has no eligible denominator.' : ''}</p>
      </motion.section>
    })}</div>
    <div className="results-lower">
      <motion.section className="results-tile results-receipts" id="results-receipts" {...reveal}><div className="results-tile-title"><span className="results-icon"><ReceiptText size={20} /></span><div><h2>Receipts</h2><p>Open any run to see its steps, cost and proof.</p></div></div>{records.length ? <ReceiptGrid records={records} params={params} /> : <p>No run receipts are available in this scope.</p>}</motion.section>
      <motion.section className="results-tile results-more" {...reveal}><div className="results-tile-title"><span className="results-icon"><List size={20} /></span><h2>More numbers</h2></div><table><thead><tr><th scope="col">Metric</th>{selected.map(row => <th scope="col" key={row.agent_id}>{agentLabel(row.agent_id)}</th>)}</tr></thead><tbody>{([
        ['Passed all 3 repeats', 'pass3', 'percent', true], ['Average steps', 'avg_steps', 'number', false], ['Average tokens', 'avg_tokens', 'tokens', false], ['Average time', 'avg_duration_s', 'duration', false], ['Recorded runs', 'runs', 'tokens', false],
      ] as const).map(([label, key, kind, higher]) => <tr key={key}><th scope="row"><a href="#results-receipts">{label}</a></th>{selected.map(row => {
        const value = row[key], other = selected.find(item => item.agent_id !== row.agent_id)?.[key]
        const best = hasNumber(value) && hasNumber(other) && (higher ? value > other : value < other)
        return <td key={row.agent_id} className={`mono ${best && key !== 'runs' ? 'best' : ''}`}>{kind === 'percent' ? percent(value) : !hasNumber(value) ? 'N/A' : kind === 'tokens' ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : `${value.toFixed(1)}${kind === 'duration' ? ' s' : ''}`}</td>
      })}</tr>)}</tbody></table><p>Bold marks the better value. Runs with errors and failed grades remain in their receipts.</p>{scope === 'batch' && <p>Repeatability against the full benchmark is not asserted without matching task-level evidence.</p>}</motion.section>
    </div>
  </div>
}
