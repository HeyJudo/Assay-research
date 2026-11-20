import { useState } from 'react'
import { Link } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { LoadState } from '@/components/shared'
import { data, sampleData } from '@/lib/data'
import { accuracyTop, chartPoint, costAxis } from '@/lib/leaderboard-chart'
import { useData } from '@/lib/use-data'
import { agentLabel, colors, defaultWeights, money, percent, rankRows, type Weights } from '@/lib/metrics'
import './leaderboard.css'

const priorities = [
  { key: 'accuracy', label: 'Accuracy', hint: 'Gets the answer right.' },
  { key: 'cost', label: 'Low cost', hint: 'Spends less per correct answer.' },
  { key: 'trap', label: 'Trap resistance', hint: 'Does not fall for planted pages.' },
  { key: 'honesty', label: 'Honesty', hint: 'Answers when it can, abstains when it should.' },
] as const

export default function Leaderboard() {
  const query = useData(() => data.agents().then(data.leaderboard))
  const [weights, setWeights] = useState<Weights>(defaultWeights)
  const reduced = useReducedMotion()
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const sourceRows = query.value
  const rows = rankRows(sourceRows, weights)
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  const best = rows[0]
  const top = [...priorities].sort((a, b) => weights[b.key] - weights[a.key])[0]
  const why = !best ? '' : {
    accuracy: `You weigh accuracy most. It answers ${percent(best.accuracy)} of clean, answerable tasks correctly.`,
    cost: `You weigh low cost most. Its recorded cost is ${money(best.cost_per_correct)} per correct answer.`,
    trap: `You weigh trap resistance most. It avoided ${percent(best.trap_resistance)} of planted traps.`,
    honesty: `You weigh honesty most. It answers or abstains correctly ${percent(best.honesty)} of the time.`,
  }[top.key]
  const color = (id: string) => colors[Math.max(0, sourceRows.findIndex(row => row.agent_id === id)) % colors.length]
  const points = rows.map(row => ({ row, point: chartPoint(row) })).filter(item => item.point !== null)
  const axis = costAxis(points.map(({ point }) => point!.cost))
  const yTop = accuracyTop(points.map(({ point }) => point!.spread ? point!.accuracy + point!.spread[1] : point!.accuracy))
  const atDefault = (Object.keys(defaultWeights) as (keyof Weights)[]).every(k => weights[k] === defaultWeights[k])
  const missingSpread = points.some(({ point }) => !point?.spread)

  return <div className="leaderboard-page">
    <aside className="leaderboard-priorities" aria-label="Your priorities">
      <div><h2>What matters to you?</h2><p>Drag to weigh each quality. The ranking updates as you move.</p></div>
      {priorities.map(({ key, label, hint }) => <div className="leaderboard-slider" key={key}>
        <div><label id={`w-${key}`} htmlFor={`slider-${key}`}>{label}</label><span className="mono">{total ? Math.round(weights[key] / total * 100) : 0}%</span></div>
        <Slider id={`slider-${key}`} aria-labelledby={`w-${key}`} min={0} max={100} step={5} value={[weights[key]]} onValueChange={values => setWeights(previous => ({ ...previous, [key]: values[0] }))} />
        <p>{hint}</p>
      </div>)}
      <Button variant="outline" disabled={atDefault} onClick={() => setWeights({ ...defaultWeights })}>Reset to default</Button>
    </aside>
    <div className="leaderboard-content">
      <section className="leaderboard-recommendation" aria-live="polite" aria-atomic="true">
        <h1>{best && total ? <><span>{agentLabel(best.agent_id)}</span> is the best fit for you.</> : total ? 'No benchmark results yet.' : 'Set at least one priority.'}</h1>
        <p>{total ? why : 'All scores are tied while every priority is zero.'}</p>
      </section>
      <section className="leaderboard-table-panel" aria-label="Ranked research agents">
        <div className="leaderboard-table-scroll" tabIndex={0} role="region" aria-label="Agent ranking table, scroll for all columns">
          <table className="leaderboard-table"><thead><tr><th>Agent</th><th>Your score</th><th>Accuracy</th><th>Cost / correct</th></tr></thead>
            <tbody>{rows.map((row, index) => <motion.tr layout={reduced ? false : 'position'} key={row.agent_id} transition={{ type: 'spring', bounce: 0, duration: .45 }}>
              <td><div className="leaderboard-agent"><span className={`mono ${index === 0 && total ? 'leaderboard-first' : ''}`}>{index + 1}</span><div><Link to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}>{agentLabel(row.agent_id)}</Link><details><summary>More <ChevronDown size={12} aria-hidden="true" /></summary><dl><dt>Trap resistance</dt><dd>{percent(row.trap_resistance)}</dd><dt>Honesty</dt><dd>{percent(row.honesty)}</dd><dt>pass³</dt><dd>{percent(row.pass3)}</dd><dt>Accuracy spread</dt><dd>{percent(row.accuracy_low)} to {percent(row.accuracy_high)}</dd><dt>Average steps</dt><dd>{row.avg_steps.toFixed(1)}</dd><dt>Average tokens</dt><dd>{Math.round(row.avg_tokens).toLocaleString()}</dd><dt>Average time</dt><dd>{row.avg_duration_s.toFixed(1)}s</dd><dt>Runs</dt><dd>{row.runs}</dd></dl></details></div></div></td>
              <td><div className="leaderboard-score"><span className="mono">{row.score.toFixed(1)}</span><span className="leaderboard-score-track" aria-hidden="true"><motion.i style={{ background: index === 0 && total ? 'var(--primary)' : '#c9bfb3', transformOrigin: 'left' }} initial={false} animate={{ scaleX: row.score / 100 }} transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0, duration: .5 }} /></span></div></td>
              <td className="mono">{percent(row.accuracy)}</td><td className="mono">{money(row.cost_per_correct)}</td>
            </motion.tr>)}</tbody>
          </table>
        </div>
        <p className="leaderboard-table-note">Open an agent to compare it head to head. {sampleData ? 'Sample aggregates.' : 'Benchmark aggregates.'}</p>
      </section>
      <motion.section className="leaderboard-chart-section" initial={reduced ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }}>
        <div><h2>Cost against accuracy</h2><p>Up and to the left is better. Cost is on a log scale. A vertical line shows the lowest and highest accuracy across repeats.</p></div>
        <div className="leaderboard-chart-panel">
          {points.length ? <div className="leaderboard-chart" role="img" aria-label="Cost per correct answer against accuracy. Spread bars show observed minimum and maximum accuracy across repeats. Exact values are in each agent's More section.">
            <ResponsiveContainer width="100%" height={290} minWidth={0} initialDimension={{ width: 600, height: 290 }}><ScatterChart margin={{ top: 20, right: 16, bottom: 16, left: -16 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="4 5" vertical={false} />
              <XAxis type="number" dataKey="cost" name="Cost / correct" scale={axis.scale} domain={axis.domain} ticks={axis.ticks} allowDataOverflow tickFormatter={v => `$${Number(v).toFixed(3)}`} tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'Fira Code' }} axisLine={{ stroke: 'var(--input)' }} tickLine={false} />
              <YAxis type="number" dataKey="accuracy" name="Accuracy" domain={[0, yTop]} tickFormatter={v => `${v}%`} tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'Fira Code' }} tickLine={false} axisLine={{ stroke: 'var(--input)' }} />
              <ZAxis range={[110, 110]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => { const point = payload?.find(item => item.payload?.agent)?.payload; return point ? <div className="leaderboard-chart-tooltip"><strong>{point.agent}</strong><p>{percent(point.accuracy / 100)} accuracy</p><p>{money(point.cost)} / correct</p></div> : null }} />
              {points.map(({ row, point }) => point?.spread && <Scatter key={`${row.agent_id}-range`} data={[{ cost: point.cost, accuracy: point.accuracy - point.spread[0] }, { cost: point.cost, accuracy: point.accuracy + point.spread[1] }]} line={{ stroke: color(row.agent_id), strokeWidth: 2 }} shape={({ cx, cy }: { cx?: number; cy?: number }) => <line x1={(cx ?? 0) - 5} x2={(cx ?? 0) + 5} y1={cy} y2={cy} stroke={color(row.agent_id)} strokeWidth={2} />} tooltipType="none" legendType="none" isAnimationActive={false} />)}
              {points.map(({ row, point }) => <Scatter key={row.agent_id} name={agentLabel(row.agent_id)} data={[{ ...point, agent: agentLabel(row.agent_id) }]} fill={color(row.agent_id)} isAnimationActive={false} />)}
            </ScatterChart></ResponsiveContainer>
          </div> : <p>No measured accuracy and cost pairs are available for this chart.</p>}
          <p className="leaderboard-axis-label mono">cost per correct answer (USD, log scale)</p>
          <div className="leaderboard-chart-legend">{rows.map(row => <Link to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`} key={row.agent_id}><i style={{ background: color(row.agent_id) }} />{agentLabel(row.agent_id)}{!chartPoint(row) && ' (unavailable)'}</Link>)}</div>
          {missingSpread && <p className="fine-print">Some repeat bounds are unavailable. Those agents have a dot without a spread bar.</p>}
        </div>
      </motion.section>
      <Link className="text-link" to="/run">Run your own benchmark <ArrowRight size={16} /></Link>
    </div>
  </div>
}
