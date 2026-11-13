import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Heading, LeaderTable, LoadState } from '@/components/shared'
import { data, sampleData } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, colors, defaultWeights, money, rankRows, type Weights } from '@/lib/metrics'

export default function Leaderboard() {
  const query = useData(() => data.agents().then(data.leaderboard))
  const [weights, setWeights] = useState<Weights>(defaultWeights)
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const rows = rankRows(query.value, weights)
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  return <><Heading eyebrow="FIND YOUR BEST FIT" title="Ranked by your priorities" description="Weight accuracy, cost, trap resistance, and honesty to rank the agents." />
    <div className="leader-layout"><Card className="priority-card"><CardHeader><h2><SlidersHorizontal size={17} />Your priorities</h2><button aria-label="Reset priorities" className="icon-button" onClick={() => setWeights(defaultWeights)}><RotateCcw size={16} /></button></CardHeader><CardContent>{([['accuracy', 'Accuracy', 'Correct answers on clean, answerable tasks.'], ['cost', 'Low cost', 'Lower list-price cost per correct answer.'], ['trap', 'Trap resistance', 'Avoiding planted misinformation.'], ['honesty', 'Honesty', 'Knowing when to answer or abstain.']] as const).map(([key, label, help]) => <label className="slider-field" key={key}><span>{label}<b>{weights[key]}</b></span><input type="range" min="0" max="100" value={weights[key]} onChange={e => setWeights({ ...weights, [key]: Number(e.target.value) })} /><small>{help}</small></label>)}<p className="fine-print">Weights are relative. Low cost is normalized using the cheapest positive cost. Zero total weight produces a tie.</p></CardContent></Card>
    <div className="stack"><div className="recommendation"><span className="eyebrow">BEST FIT FOR YOUR PRIORITIES</span><h2>{total && rows[0] ? agentLabel(rows[0].agent_id) : 'Set at least one priority'}</h2><p>{total ? 'Ranks highest under your current weighting. Inspect its evidence before deciding.' : 'All scores are tied while every priority is zero.'}</p>{rows[0] && <Link className="text-link" to={`/compare?a=${rows[0].agent_id}`}>See the comparison <ArrowRight size={15} /></Link>}</div><Card><CardHeader><h2>Ranked research agents</h2><span className="muted">{rows.length} configurations</span></CardHeader><LeaderTable rows={rows} scores /><div className="panel-foot">{sampleData ? 'Sample aggregates' : 'Benchmark aggregates'} · pass³ = tasks where all three repeats succeeded.</div></Card></div></div>
    <Card className="chart-card"><CardHeader><div><h2>What does accuracy cost?</h2><p>Upper left means higher accuracy at lower cost.</p></div></CardHeader><CardContent><div className="chart-wrap"><ResponsiveContainer width="100%" height={290}><ScatterChart margin={{ top: 20, right: 35, bottom: 25, left: 0 }}><CartesianGrid strokeDasharray="4 5" vertical={false} /><XAxis type="number" dataKey="cost" name="Cost / correct" tickFormatter={v => `$${v}`} label={{ value: 'List-price cost per correct answer (USD)', position: 'bottom', offset: 8 }} /><YAxis type="number" dataKey="accuracy" name="Accuracy" domain={[0, 100]} tickFormatter={v => `${v}%`} /><ZAxis range={[150, 150]} /><Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value, name) => name === 'Cost / correct' ? money(Number(value)) : `${value}%`} />{rows.map((r, i) => <Scatter key={r.agent_id} name={agentLabel(r.agent_id)} data={[{ cost: r.cost_per_correct, accuracy: r.accuracy * 100 }]} fill={colors[i]} />)}</ScatterChart></ResponsiveContainer></div><div className="chart-legend">{rows.map((r, i) => <span key={r.agent_id}><i style={{ background: colors[i] }} />{agentLabel(r.agent_id)}</span>)}</div><p className="fine-print">Spread bars are unavailable: the aggregate contract does not include variance. {sampleData ? 'Sample aggregates are separate from the example receipts.' : 'Inspect run receipts for evidence.'}</p></CardContent></Card><Button variant="outline" asChild><Link to="/run">Run your own comparison <ArrowRight size={15} /></Link></Button>
  </>
}
