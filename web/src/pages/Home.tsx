import { Link } from 'react-router'
import { ArrowRight, Check, FileCheck2, Play, ShieldCheck, Sparkles, Target } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Heading, LeaderTable, LoadState } from '@/components/shared'
import { data, sampleData } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, defaultWeights, money, percent, rankRows } from '@/lib/metrics'

export default function Home() {
  const query = useData(() => Promise.all([data.leaderboard(), data.runs(), data.agents()]))
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [rows, runs] = query.value
  const ranked = rankRows(rows, defaultWeights)
  const top = ranked[0]
  const cheap = [...rows].sort((a, b) => a.cost_per_correct - b.cost_per_correct)[0]
  const honest = [...rows].sort((a, b) => b.honesty - a.honesty)[0]
  return <><Heading eyebrow="THE RESEARCH AGENT BENCHMARK" title="Research agent benchmark" description="Find the right research agent. See what it gets right, what it costs, and where it breaks." action={<Button asChild><Link to="/run"><Play size={15} />Run a benchmark</Link></Button>} />
    <div className="section-label"><h2>Accuracy, cost, and honesty</h2><span>{sampleData ? 'Illustrative fixture findings' : 'Benchmark findings'}</span></div>
    <div className="insight-grid">{top && <Link className="insight-card" to={`/compare?a=${top.agent_id}`}><span className="insight-icon green"><ShieldCheck size={19} /></span><p>Best fit with default priorities</p><h3>{agentLabel(top.agent_id)}</h3><small>{percent(top.trap_resistance)} trap resistance {sampleData ? 'in sample data' : 'in benchmark results'} <ArrowRight size={14} /></small></Link>}{cheap && <Link className="insight-card" to={`/compare?a=${cheap.agent_id}`}><span className="insight-icon amber"><Target size={19} /></span><p>Lowest cost per correct</p><h3>{money(cheap.cost_per_correct)}</h3><small>{agentLabel(cheap.agent_id)} <ArrowRight size={14} /></small></Link>}{honest && <Link className="insight-card" to={`/compare?a=${honest.agent_id}`}><span className="insight-icon violet"><Sparkles size={19} /></span><p>Highest honesty</p><h3>{percent(honest.honesty)} honesty</h3><small>Includes correct abstention and over-refusal <ArrowRight size={14} /></small></Link>}</div>
    <div className="bottom-grid"><Card><CardHeader><div><h2>The research leaderboard</h2><p>Same tasks. Different approaches.</p></div><Link className="text-link" to="/leaderboard">Explore rankings <ArrowRight size={15} /></Link></CardHeader>{ranked.length ? <LeaderTable rows={ranked.slice(0, 5)} /> : <p className="card-content">No benchmark results yet.</p>}<div className="panel-foot">Cost is list-price equivalent, not necessarily the amount billed.</div></Card><Card><CardHeader><div><h2>Recent run receipts</h2><p>Look inside the result.</p></div><FileCheck2 size={19} /></CardHeader><div className="recent-list">{runs.slice(0, 4).map(run => <Link key={run.id} to={`/runs/${run.id}`}><span className={`run-status ${run.metrics.success ? 'pass' : 'fail'}`}>{run.metrics.success ? <Check size={16} /> : '!'}</span><div><strong>{agentLabel(run.agent_id)}</strong><small>{run.task_id} · Repeat {run.repeat}</small></div><ArrowRight size={16} /></Link>)}</div></Card></div>
    <Card className="methodology" id="methodology"><CardHeader><div><span className="eyebrow">FROM QUESTION TO EVIDENCE</span><h2>How a fair comparison works</h2></div><Badge variant="outline">Research agents, not just models</Badge></CardHeader><CardContent><div className="method-steps">{['Choose a task', 'Freeze the sources', 'Run each agent', 'Repeat three times', 'Check every claim', 'Compare the evidence'].map((text, i) => <div key={text}><span>{String(i + 1).padStart(2, '0')}</span><p>{text}</p></div>)}</div></CardContent></Card>
  </>
}
