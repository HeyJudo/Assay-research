import { Input } from '@/components/ui/input'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowRight, Check, Circle, FlaskConical, LoaderCircle, Play, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Heading, LoadState } from '@/components/shared'
import { apiMode, data } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, money } from '@/lib/metrics'
import type { BatchEvent, RunDoneEvent, RunStartedEvent, Step, Trap } from '@/types'

type Cell = RunStartedEvent & { steps: Step[]; done?: RunDoneEvent }
const traps = [{ id: '', label: 'No trap', help: 'A clean run against the frozen document pool.' }, { id: 'fake_article', label: 'Fake article', help: 'A planted document tests whether the agent trusts misinformation.' }, { id: 'hidden_instruction', label: 'Hidden instruction', help: 'An instruction embedded in a source tests the agent’s boundaries.' }, { id: 'search_outage', label: 'Search outage', help: 'The first two search requests fail.' }, { id: 'model_outage', label: 'Model outage', help: 'The first three model requests fail.' }]

export default function Run() {
  const [params] = useSearchParams()
  const preset = params.get('agents')
  const query = useData(() => Promise.all([data.agents(), data.tasks()]))
  const [selected, setSelected] = useState(() => preset ? [] : ['briefing-baseline', 'briefing-cheap-first'])
  const [task, setTask] = useState('brief-tavily')
  const [trap, setTrap] = useState('')
  const [passcode, setPasscode] = useState('')
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [activeCell, setActiveCell] = useState('')
  const [state, setState] = useState<'idle' | 'starting' | 'running' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [batch, setBatch] = useState('')
  const [batchAgents, setBatchAgents] = useState<string[]>([])
  const unsubscribe = useRef<() => void>(() => {})
  const currentSession = useRef(0)
  useEffect(() => () => { currentSession.current++; unsubscribe.current() }, [])
  const busy = state === 'starting' || state === 'running'
  useEffect(() => {
    if (!preset || busy || !query.value) return
    const available = query.value[0].map(agent => agent.id)
    const requested = [...new Set(preset.split(','))].filter(id => available.includes(id)).slice(0, 3)
    if (preset) {
      setSelected(requested)
      setCells({}); setActiveCell(''); setBatch(''); setError(''); setState('idle')
    }
  }, [preset, query.value])
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [agents, tasks] = query.value
  const actualTask = tasks.some(t => t.id === task) ? task : tasks[0]?.id ?? ''
  function receive(event: BatchEvent) {
    if (event.event === 'run_started') { const e = event.data; setCells(previous => ({ ...previous, [e.run_id]: previous[e.run_id] ?? { ...e, steps: [] } })); setActiveCell(previous => previous || e.run_id) }
    if (event.event === 'step') { const e = event.data; setCells(previous => { const cell = previous[e.run_id]; return cell ? { ...previous, [e.run_id]: { ...cell, steps: cell.steps.some(step => step.i === e.step.i) ? cell.steps : [...cell.steps, e.step] } } : previous }) }
    if (event.event === 'run_done') { const e = event.data; setCells(previous => previous[e.run_id] ? ({ ...previous, [e.run_id]: { ...previous[e.run_id], done: e } }) : previous) }
    if (event.event === 'batch_done') { setState('done'); unsubscribe.current() }
  }
  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!selected.length || selected.length > 3 || !actualTask) { setError('Select one to three agents and a task.'); return }
    if (apiMode && !passcode.trim()) { setError('Enter the team passcode for a live batch.'); return }
    setError(''); setState('starting'); setCells({}); setActiveCell(''); unsubscribe.current()
    const session = ++currentSession.current
    try {
      const result = await data.batch({ agents: selected, task_id: actualTask, trap: ((['fake_article', 'hidden_instruction'].includes(trap) && !actualTask.endsWith('-trap') ? '' : trap) || null) as Trap | null, passcode })
      if (session !== currentSession.current) return
      setBatchAgents([...selected]); setBatch(result.batch_id); setState('running')
      unsubscribe.current = data.subscribe(result.batch_id, receive, message => { setError(message); setState('error') })
      setPasscode('')
    } catch (e) { if (session === currentSession.current) { setError(e instanceof Error ? e.message : 'Unable to start the batch'); setState('error') } }
  }
  const completed = Object.values(cells).filter(c => c.done).length
  const cost = Object.values(cells).reduce((sum, c) => sum + (c.done?.metrics.cost_usd ?? c.steps.reduce((s, step) => s + step.cost_usd, 0)), 0)
  const active = cells[activeCell]
  const displayedAgents = batch ? batchAgents : selected
  const comparison = batchAgents.length > 1 ? `/compare?scope=batch&batch=${batch}&a=${batchAgents[0]}&b=${batchAgents[1]}` : `/runs/${Object.values(cells)[0]?.run_id ?? ''}`
  return <><Heading eyebrow="YOUR CONTROLLED EXPERIMENT" title="Run a benchmark" description="One task. Up to three agents. Three repeats each. The same evidence for everyone." />
    <div className="run-layout"><Card><CardHeader><h2>Configure a benchmark</h2><Badge variant="outline">{apiMode ? 'API' : 'Simulation'}</Badge></CardHeader><CardContent><form onSubmit={start} className="stack"><fieldset disabled={busy}><legend>01 <span>Choose agents</span><small>{selected.length} / 3 selected</small></legend><div className="agent-options">{agents.map(agent => <label key={agent.id} className={`agent-option ${selected.includes(agent.id) ? 'selected' : ''}`}><input type="checkbox" checked={selected.includes(agent.id)} disabled={!selected.includes(agent.id) && selected.length >= 3} onChange={() => setSelected(ids => ids.includes(agent.id) ? ids.filter(id => id !== agent.id) : [...ids, agent.id])} /><span><strong>{agentLabel(agent.id)}</strong><small>{agent.description}</small></span></label>)}</div></fieldset><fieldset disabled={busy}><legend>02 <span>Choose a task</span></legend><select aria-label="Benchmark task" value={actualTask} onChange={e => { setTask(e.target.value); setTrap('') }}>{tasks.map(t => <option value={t.id} key={t.id}>{t.type} · {t.id}</option>)}</select><p className="field-hint">{tasks.find(t => t.id === actualTask)?.prompt}</p></fieldset><fieldset disabled={busy}><legend>03 <span>Add a controlled failure</span></legend><select aria-label="Trap" value={trap} onChange={e => setTrap(e.target.value)}>{traps.filter(t => !['fake_article', 'hidden_instruction'].includes(t.id) || actualTask.endsWith('-trap')).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select><p className="field-hint">{traps.find(t => t.id === trap)?.help}</p></fieldset>{apiMode && <label>Team passcode<Input type="password" value={passcode} onChange={e => setPasscode(e.target.value)} autoComplete="off" disabled={busy} /></label>}<div className="run-summary"><span>3 repeats per agent</span><strong>{selected.length * 3} total runs</strong></div><p className="fine-print">{apiMode ? 'Budget limits are configured by the server. Starting a batch uses provider credits.' : 'Simulates progress locally in a few seconds. No searches, model calls, or provider spending occur.'}</p>{error && <p role="alert" className="error-message">{error}</p>}<Button type="submit" disabled={busy || !selected.length || !actualTask}>{busy ? <LoaderCircle size={17} className="spin" /> : <Play size={16} />}{busy ? 'Benchmark in progress…' : apiMode ? 'Start live benchmark' : 'Start demo benchmark'}</Button></form></CardContent></Card>
    <div className="stack"><Card className="progress-card"><CardHeader><div><h2>Experiment progress</h2><p>{state === 'idle' ? 'Your runs will appear here.' : `${completed} of ${displayedAgents.length * 3} runs completed`}</p></div><Badge variant={state === 'done' ? 'default' : 'secondary'}>{state === 'idle' ? 'Ready' : state}</Badge></CardHeader><CardContent><div className="progress-bar"><i style={{ width: `${completed / (displayedAgents.length * 3 || 1) * 100}%` }} /></div><div className="run-grid"><div className="grid-header"><span>Agent / repeat</span>{[1, 2, 3].map(n => <span key={n}>0{n}</span>)}</div>{displayedAgents.map(id => <div className="grid-agent" key={id}><strong>{agentLabel(id)}</strong>{[1, 2, 3].map(repeat => { const cell = Object.values(cells).find(c => c.agent_id === id && c.repeat === repeat); const status = !cell ? 'waiting' : !cell.done ? 'working' : cell.done.metrics.success && cell.done.status === 'done' ? 'passed' : 'failed'; return <button type="button" key={repeat} disabled={!cell} aria-label={`${agentLabel(id)} repeat ${repeat}: ${status}`} className={`run-cell ${status} ${cell?.run_id === activeCell ? 'cell-active' : ''}`} onClick={() => setActiveCell(cell!.run_id)}>{status === 'working' ? <LoaderCircle className="spin" size={17} /> : status === 'passed' ? <Check size={18} /> : status === 'failed' ? <ShieldAlert size={17} /> : <Circle size={12} />}</button> })}</div>)}</div><div className="run-ticker"><div><small>Recorded model cost</small><strong className="mono">{money(cost)}</strong></div><div><small>Repeats per task</small><strong>3×</strong></div><div><small>Environment</small><strong>{apiMode ? 'Frozen pool' : 'Demo simulation'}</strong></div></div>{state === 'done' && <div className="finished"><Check size={20} /><div><strong>Batch complete. Inspect what changed.</strong><small>{apiMode ? 'Open the recorded results.' : 'Simulation outcomes are not benchmark evidence.'}</small></div><Button asChild><Link to={comparison}>{batchAgents.length > 1 ? 'Compare' : 'View receipt'} <ArrowRight size={15} /></Link></Button></div>}{batch && state === 'error' && <Button asChild variant="outline"><Link to={comparison}>Inspect available records</Link></Button>}</CardContent></Card>
    <Card><CardHeader><div><h2>Inside the run</h2><p>{active ? `${agentLabel(active.agent_id)} · Repeat ${active.repeat}` : 'Select a cell to follow its execution.'}</p></div><FlaskConical size={18} /></CardHeader><CardContent>{active ? <><ol className="timeline compact">{active.steps.map(step => <li key={step.i}><span className={`step-dot dot-${step.kind}`} /><div><strong>{step.kind}<span>{step.t.toFixed(1)}s</span></strong><p>{step.detail}</p></div></li>)}</ol>{active.done && <Button asChild variant="outline"><Link to={`/runs/${active.run_id}`}>Open complete receipt <ArrowRight size={15} /></Link></Button>}</> : <div className="empty-experiment"><FlaskConical size={35} /><p>Every step leaves a trace.</p><small>Searches, model calls, switches, and errors appear as the run progresses.</small></div>}</CardContent></Card></div></div>
  </>
}
