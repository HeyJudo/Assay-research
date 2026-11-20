import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Bot } from 'kubai-icons-react'
import { ArrowLeft, ArrowRight, Check, Clock, Coins, Cpu, FileText, PauseCircle, Play, Search, ShieldAlert, Shuffle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BenchmarkRail } from '@/components/benchmark-rail'
import { LoadState } from '@/components/shared'
import { apiMode, data, staticMode } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, money } from '@/lib/metrics'
import { savedPasscode } from '@/lib/passcode'
import { latestBatchId, loadDraft, loadSession, recoverCells, resetDraft, saveDraft, saveSession } from '@/lib/run-session'
import type { RunCell, RunSession, SetupDraft } from '@/lib/run-session'
import type { BatchEvent, Step, Trap } from '@/types'
import './run.css'

const mode = apiMode ? 'api' : staticMode ? 'static' : 'demo'
const defaults: SetupDraft = { selected: ['briefing-baseline', 'briefing-cheap-first'], task: 'brief-tavily', trap: '', step: 1 }
const traps = [
  { id: '', label: 'No trap', help: 'A clean run on the frozen pages.' },
  { id: 'fake_article', label: 'Fake article', help: 'One planted page states something false.' },
  { id: 'hidden_instruction', label: 'Hidden instruction', help: 'A page tells the agent to change its answer.' },
  { id: 'search_outage', label: 'Search outage', help: 'The first two search requests fail.' },
  { id: 'model_outage', label: 'Model outage', help: 'The first three model requests fail.' },
]
const stepIcons = { search: Search, read: FileText, llm: Cpu, switch: Shuffle, error: TriangleAlert }
const stepNames = { search: 'Searched', read: 'Read a page', llm: 'Model call', switch: 'Switched models', error: 'Encountered an error' }
const spring = { type: 'spring' as const, stiffness: 340, damping: 36, bounce: 0 }

function resultsUrl(session: RunSession) {
  const query = new URLSearchParams({ scope: 'batch', batch: session.batch })
  if (session.agents[0]) query.set('a', session.agents[0])
  if (session.agents[1]) query.set('b', session.agents[1])
  return `/results?${query}`
}

function StepChip({ step, active = false }: { step: Step; active?: boolean }) {
  const reduce = useReducedMotion()
  const Icon = stepIcons[step.kind]
  return <motion.span className={`run-chip run-chip-${step.kind}${active ? ' run-chip-current' : ''}`} title={`${stepNames[step.kind]}: ${step.detail}`} initial={reduce ? false : { opacity: 0, scale: .4 }} animate={{ opacity: 1, scale: 1 }} transition={reduce ? { duration: 0 } : spring}><Icon size={15} /></motion.span>
}

function cellStatus(cell?: RunCell) {
  if (!cell) return 'Waiting'
  if (cell.done) return cell.done.status === 'done' ? cell.done.metrics.success ? 'Passed' : 'Failed' : cell.done.status === 'budget_exceeded' ? 'Budget exceeded' : 'Error'
  const last = cell.steps.at(-1)
  if (!last) return 'Starting'
  return last.kind === 'search' ? 'Searching' : last.kind === 'read' ? 'Reading' : last.kind === 'switch' ? 'Switching' : last.kind === 'error' ? 'Recovering' : last.phase === 'write' ? 'Writing' : last.phase === 'check' ? 'Checking' : 'Planning'
}

function runCost(cell: RunCell) { return cell.done?.metrics.cost_usd ?? cell.steps.reduce((sum, step) => sum + step.cost_usd, 0) }

export default function Run() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const newRequested = params.get('new') === '1'
  const preset = params.get('agents') ?? ''
  const requestedBatch = params.get('batch') ?? ''
  const batch = requestedBatch || (newRequested ? '' : latestBatchId(mode))
  const [draft, setDraft] = useState<SetupDraft>(() => newRequested ? { ...defaults } : loadDraft(mode) ?? { ...defaults })
  const [passcode, setPasscode] = useState(savedPasscode)
  const [session, setSession] = useState<RunSession | null>(() => batch ? loadSession(mode, batch) : null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const unsubscribe = useRef<() => void>(() => {})
  const mounted = useRef(true)
  const query = useData(() => Promise.all([data.agents(), data.tasks()]))
  const trapTask = query.value ? (query.value[1].find(task => task.id === draft.task) ?? query.value[1][0])?.id ?? '' : ''
  const recorded = useData(() => staticMode && trapTask ? data.recordedTraps(trapTask) : Promise.resolve(null), trapTask)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; unsubscribe.current() } }, [])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [draft.step, batch])

  useEffect(() => {
    if (!newRequested) return
    unsubscribe.current()
    resetDraft(mode)
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the explicit New benchmark URL action.
    setSession(null); setDraft({ ...defaults }); setPasscode(savedPasscode()); setError('')
    setParams(previous => { const next = new URLSearchParams(previous); next.delete('new'); next.delete('batch'); return next }, { replace: true })
  }, [newRequested, setParams])

  useEffect(() => {
    if (!batch || requestedBatch || newRequested) return
    setParams(previous => { const next = new URLSearchParams(previous); next.set('batch', batch); return next }, { replace: true })
  }, [batch, requestedBatch, newRequested, setParams])

  useEffect(() => {
    if (!preset || batch || !query.value) return
    const available = new Set(query.value[0].map(agent => agent.id))
    const selected = [...new Set(preset.split(','))].filter(id => available.has(id)).slice(0, 3)
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize agent presets from the URL after the catalogue loads.
    if (selected.length) setDraft(previous => ({ ...previous, selected }))
  }, [preset, batch, query.value])

  useEffect(() => { if (!batch && !newRequested) saveDraft(mode, draft) }, [draft, batch, newRequested])
  useEffect(() => { if (session && session.batch === batch) saveSession(mode, session) }, [session, batch])
  useEffect(() => { if (session?.batch === batch && session.stage === 'done') navigate(resultsUrl(session), { replace: true }) }, [session, batch, navigate])
  const sessionBatch = session?.batch
  const sessionStage = session?.stage
  useEffect(() => {
    if (!sessionBatch || sessionStage === 'done') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sessionBatch, sessionStage])

  useEffect(() => {
    if (!batch || newRequested) return
    let active = true
    const saved = loadSession(mode, batch)
    const initial: RunSession = saved ?? { batch, agents: [], task: '', trap: '', startedAt: Date.now(), stage: 'running', cells: {}, activeCell: '' }
    // oxlint-disable-next-line react/set-state-in-effect -- Hydrate the session saved for this batch URL before attaching its stream.
    setSession({ ...initial, stage: initial.stage === 'done' ? 'done' : 'running' })
    setError('')
    if (initial.stage === 'done') return

    // Keep the existing SSE reducer: starts are idempotent, steps deduplicate by i,
    // and terminal outcomes remain visible even when they fail.
    function receive(event: BatchEvent) {
      if (!active) return
      setSession(previous => {
        if (!previous || previous.batch !== batch) return previous
        if (event.event === 'run_started') {
          const e = event.data
          return { ...previous, agents: previous.agents.includes(e.agent_id) ? previous.agents : [...previous.agents, e.agent_id], activeCell: previous.activeCell || e.run_id, cells: { ...previous.cells, [e.run_id]: previous.cells[e.run_id] ?? { ...e, steps: [] } } }
        }
        if (event.event === 'step') {
          const e = event.data; const cell = previous.cells[e.run_id]
          return cell ? { ...previous, cells: { ...previous.cells, [e.run_id]: { ...cell, steps: cell.steps.some(step => step.i === e.step.i) ? cell.steps : [...cell.steps, e.step].sort((a, b) => a.i - b.i) } } } : previous
        }
        if (event.event === 'run_done') {
          const e = event.data
          return previous.cells[e.run_id] ? { ...previous, cells: { ...previous.cells, [e.run_id]: { ...previous.cells[e.run_id], done: e } } } : previous
        }
        return event.event === 'batch_done' ? { ...previous, stage: 'done' } : previous
      })
      if (event.event === 'batch_done') unsubscribe.current()
    }
    unsubscribe.current = data.subscribe(batch, receive, message => {
      if (!active) return
      setError(message)
      setSession(previous => previous?.batch === batch ? { ...previous, stage: 'error' } : previous)
    })

    // API snapshots recover missed events after a refresh. Demo records are final
    // templates, so an in-progress simulation resumes from its saved event cursor.
    if (apiMode || !saved) {
      data.runs(batch).then(records => Promise.all(records.map(record => data.run(record.id)))).then(records => {
        if (!active || !records.length) return
        setSession(previous => {
          if (!previous || previous.batch !== batch) return previous
          const agents = [...new Set([...previous.agents, ...records.map(record => record.agent_id)])]
          const cells = recoverCells(records, previous.cells)
          const complete = records.length >= agents.length * 3 && records.every(record => record.status !== 'running')
          return { ...previous, agents, cells, activeCell: previous.activeCell || records[0].id, task: records[0].task_id, trap: records[0].trap ?? '', startedAt: Math.min(...records.map(record => Date.parse(record.started_at)).filter(Number.isFinite), previous.startedAt), stage: complete ? 'done' : previous.stage }
        })
      }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to recover this batch.') })
    }
    return () => { active = false; unsubscribe.current() }
  }, [batch, newRequested, attempt])

  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [agents, tasks] = query.value
  const actualTask = tasks.find(task => task.id === draft.task) ?? tasks[0]
  const selected = draft.selected.filter(id => agents.some(agent => agent.id === id)).slice(0, 3)
  const recordedTrapIds = recorded.value ?? [null]
  const availableTraps = staticMode ? traps.filter(trap => recordedTrapIds.includes((trap.id || null) as Trap | null)) : traps.filter(trap => !['fake_article', 'hidden_instruction'].includes(trap.id) || actualTask?.id.endsWith('-trap'))
  // Static mode may not record "No trap" for a trap task, so fall back to the first recorded trap.
  const actualTrap = availableTraps.find(trap => trap.id === draft.trap) ?? availableTraps[0] ?? traps[0]

  async function start(event: React.FormEvent) {
    event.preventDefault()
    if (starting) return
    if (!selected.length || selected.length > 3 || !actualTask) { setError('Select one to three agents and a task.'); return }
    if (draft.step < 3) { setDraft(previous => ({ ...previous, step: previous.step + 1 })); return }
    if (apiMode && !passcode.trim()) { setError('Enter the team passcode for a live batch.'); return }
    setError(''); setStarting(true)
    try {
      const result = await data.batch({ agents: selected, task_id: actualTask.id, trap: (actualTrap.id || null) as Trap | null, passcode })
      // oxlint-disable-next-line react/purity -- This timestamp is captured by the async submit handler, after batch creation.
      const next: RunSession = { batch: result.batch_id, agents: selected, task: actualTask.id, trap: actualTrap.id, startedAt: Date.now(), stage: 'running', cells: {}, activeCell: '' }
      saveSession(mode, next)
      if (!mounted.current) return
      setSession(next); setPasscode(savedPasscode())
      setParams({ batch: result.batch_id }, { replace: true })
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Unable to start the batch.') }
    finally { if (mounted.current) setStarting(false) }
  }

  if (batch) {
    if (!session || session.batch !== batch) return <LoadState />
    const cells = Object.values(session.cells)
    const completed = cells.filter(cell => cell.done).length
    const count = session.agents.length * 3
    const activeCell = session.cells[session.activeCell]
    const elapsed = Math.max(0, Math.floor((now - session.startedAt) / 1000))
    const task = tasks.find(task => task.id === session.task)
    const subject = task?.type === 'briefing' ? /^Brief me on (.+?) for a meeting/i.exec(task.prompt)?.[1] : null
    return <div className="run-live">
      <BenchmarkRail stage={4} />
      <div className="run-live-heading">
        <div className="run-progress-intro">
          <div className="run-progress-ring" role="img" aria-label={`${completed} of ${count} runs finished`} style={{ background: `conic-gradient(var(--primary) ${completed / (count || 1) * 360}deg, var(--muted) 0)` }}><div><strong className="mono">{completed}/{count}</strong><span>runs done</span></div></div>
          <div><h1>{staticMode ? `Replaying ${session.agents.length || 'your'} ${session.agents.length === 1 ? 'agent' : 'agents'} on ${subject ? subject : 'the same task'}.` : <>{session.agents.length || 'Your'} {session.agents.length === 1 ? 'agent is' : 'agents are'} {subject ? `researching ${subject}.` : 'researching the same task.'}</>}</h1>{staticMode && <p className="run-provenance">Replay of recorded benchmark runs. No live model calls or provider spending.</p>}<p role="status">Results open on their own when all {count || 'the'} runs finish.</p>{task && !subject && <p className="run-task-caption">{task.prompt}</p>}</div>
        </div>
        <div className="run-tickers"><div><span className="run-chip run-chip-llm"><Clock size={20} /></span><div><strong className="mono">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</strong><span>{staticMode ? 'replay time' : 'elapsed'}</span></div></div><div><span className="run-chip run-chip-llm"><Coins size={20} /></span><div><strong className="mono">{money(cells.reduce((sum, cell) => sum + runCost(cell), 0))}</strong><span>spent so far</span></div></div></div>
      </div>
      {error && <div className="run-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Reconnect</Button><Button asChild variant="outline"><Link to={resultsUrl(session)}>Inspect available results</Link></Button></div>}
      <div className="run-live-layout">
        <div className="run-lanes">
          {session.agents.map(id => {
            const runs = cells.filter(cell => cell.agent_id === id)
            const passed = runs.filter(cell => cell.done?.status === 'done' && cell.done.metrics.success).length
            const failed = runs.filter(cell => cell.done && (cell.done.status !== 'done' || !cell.done.metrics.success)).length
            const working = runs.filter(cell => !cell.done).length
            return <section className="run-lane" key={id}>
              <div className="run-lane-heading"><span className="run-agent-avatar"><Bot size={23} trigger="none" /><motion.span aria-hidden="true" className="run-avatar-ring" animate={reduce || !working ? undefined : { rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} /></span><div><h2>{agentLabel(id)}</h2><p>{[passed ? `${passed} passed` : '', failed ? `${failed} failed` : '', working ? `${working} working` : '', runs.length < 3 ? `${3 - runs.length} waiting` : ''].filter(Boolean).join(', ')}</p></div></div>
              {[1, 2, 3].map(repeat => {
                const cell = runs.find(cell => cell.repeat === repeat)
                const status = cellStatus(cell)
                const selected = cell?.run_id === session.activeCell
                const done = !!cell?.done
                return <button type="button" key={repeat} disabled={!cell} className={`run-track-row${selected ? ' run-track-selected' : ''}`} aria-pressed={selected} aria-label={`${agentLabel(id)}, repeat ${repeat}: ${status}`} onClick={() => cell && setSession(previous => previous ? { ...previous, activeCell: cell.run_id } : previous)}>
                  <span className="run-repeat">Repeat {repeat}</span>
                  <span className="run-step-track">{cell?.steps.map((step, index) => <StepChip step={step} active={!done && index === cell.steps.length - 1} key={step.i} />)}{!done && <span aria-hidden="true" className="run-chip run-chip-placeholder" />}</span>
                  <span className={`run-cell-status ${done ? status === 'Passed' ? 'run-passed' : 'run-failed' : cell ? 'run-working' : ''}`}>{done ? status === 'Passed' ? <Check size={16} /> : <ShieldAlert size={16} /> : cell ? <Cpu size={16} /> : <PauseCircle size={16} />}{status}</span>
                  {!!cell && !done && !reduce && <motion.span aria-hidden="true" className="run-track-scan" animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />}
                </button>
              })}
            </section>
          })}
          {!session.agents.length && <div className="run-lane"><p>Waiting for the first run to start.</p></div>}
          <div className="run-legend">{(['llm', 'search', 'read', 'switch', 'error'] as const).map(kind => { const Icon = stepIcons[kind]; return <span key={kind}><span className={`run-chip run-chip-${kind}`}><Icon size={14} /></span>{kind === 'llm' ? 'Model call' : kind === 'read' ? 'Page read' : kind === 'switch' ? 'Model switch' : kind === 'error' ? 'Error' : 'Search'}</span> })}</div>
        </div>
        <aside className="run-live-feed" aria-label={staticMode ? 'Recorded steps' : 'Live steps'}>
          <div><h2>{activeCell ? `Inside ${agentLabel(activeCell.agent_id)}, repeat ${activeCell.repeat}` : 'Inside the run'}</h2><p>Pick any row to watch it work.</p></div>
          <ol>{activeCell?.steps.map(step => <motion.li className="run-feed-step" key={`${activeCell.run_id}-${step.i}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0 } : spring}><StepChip step={step} /><div><strong>{step.kind === 'llm' && step.phase === 'plan' ? 'Planned its queries' : step.kind === 'llm' && step.phase === 'write' ? 'Drafted the brief' : step.kind === 'llm' && step.phase === 'check' ? 'Checked its claims' : stepNames[step.kind]}</strong><p>{step.detail}</p>{step.model && <span className="mono">{step.model}</span>}</div><time className="mono">{step.t.toFixed(1)}s</time></motion.li>)}</ol>
          {!activeCell?.steps.length && <p className="run-feed-empty">{staticMode ? 'Recorded steps appear here as the replay plays.' : 'Searches, page reads and model calls appear here as they happen.'}</p>}
          <div className="run-feed-cost"><span>This run so far</span><span className="mono">{money(activeCell ? runCost(activeCell) : 0)}</span></div>
          {activeCell?.done && <Button asChild variant="outline"><Link to={`?${new URLSearchParams({ batch, run: activeCell.run_id })}`}>Open receipt <ArrowRight size={15} /></Link></Button>}
        </aside>
      </div>
      <p className="run-provenance">{apiMode ? 'Every agent uses the same frozen document pool. Costs are recorded at list prices.' : staticMode ? 'Replay of recorded benchmark runs. No live model calls or provider spending.' : 'Demo simulation. No live research or provider spending occurs.'}</p>
    </div>
  }

  return <form className="run-setup" onSubmit={start}>
    <BenchmarkRail stage={draft.step} onStep={step => { if (!starting && (step === 1 || selected.length)) { setDraft(previous => ({ ...previous, step })); setError('') } }} />
    <AnimatePresence mode="wait" initial={false}>
      <motion.section className="run-pane" key={draft.step} initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -16 }} transition={reduce ? { duration: 0 } : spring}>
        {draft.step === 1 && <>
          <div className="run-pane-heading"><h1>Which agents should compete?</h1><p>Pick up to three. Two are already selected.</p></div>
          <div className="run-options" role="group" aria-label="Agents">{agents.map(agent => {
            const checked = selected.includes(agent.id)
            return <button type="button" className={`run-option${checked ? ' run-option-selected' : ''}`} key={agent.id} aria-pressed={checked} disabled={starting || (!checked && selected.length >= 3)} onClick={() => setDraft(previous => ({ ...previous, selected: checked ? previous.selected.filter(id => id !== agent.id) : [...selected, agent.id] }))}>
              <span className="run-option-checkbox" aria-hidden="true">{checked && <Check size={15} strokeWidth={3} />}</span><span><strong>{agentLabel(agent.id)}<small className="run-agent-kind">{agent.kind}</small></strong><span className="run-option-description">{agent.description}</span></span>
            </button>
          })}</div><p className="run-selection-count"><span className="mono">{selected.length}/3</span> selected</p>
        </>}
        {draft.step === 2 && <>
          <div className="run-pane-heading"><h1>What should they research?</h1><p>Every agent gets the same task and the same frozen pages.</p></div>
          <div className="run-options" role="radiogroup" aria-label="Task">{tasks.map(task => <label className={`run-option${actualTask?.id === task.id ? ' run-option-selected' : ''}`} key={task.id}><input type="radio" name="benchmark-task" value={task.id} checked={actualTask?.id === task.id} disabled={starting} onChange={() => setDraft(previous => ({ ...previous, task: task.id, trap: '' }))} /><span><strong>{task.prompt}</strong><span className="run-option-description">{task.type === 'unanswerable' ? 'Unanswerable, the right answer is not found' : task.type === 'briefing' ? 'Briefing' : 'Fact'}{task.id.endsWith('-trap') ? ', supports planted traps' : ''} <span className="mono">{task.id}</span></span></span></label>)}</div>
        </>}
        {draft.step === 3 && <>
          <div className="run-pane-heading"><h1>Make it harder?</h1><p>A trap shows how an agent behaves when something goes wrong.</p></div>
          <div className="run-traps" role="radiogroup" aria-label="Trap">{availableTraps.map(trap => <label className={`run-option run-trap-option${actualTrap.id === trap.id ? ' run-option-selected' : ''}`} key={trap.id}><input className="sr-only" type="radio" name="benchmark-trap" checked={actualTrap.id === trap.id} disabled={starting} onChange={() => setDraft(previous => ({ ...previous, trap: trap.id }))} /><strong>{trap.label}</strong><span className="run-option-description">{trap.help}</span></label>)}</div>
          {!staticMode && !actualTask?.id.endsWith('-trap') && <p className="run-trap-note">Choose a task marked “supports planted traps” to test a fake article or hidden instruction.</p>}
          <dl className="run-summary"><dt>Agents</dt><dd>{selected.map(agentLabel).join(', ')}</dd><dt>Task</dt><dd>{actualTask?.prompt ?? 'Choose a task'}</dd><dt>Trap</dt><dd>{actualTrap.label}</dd><dt>Runs</dt><dd><span className="mono">{selected.length * 3}</span> total, three repeats per agent{apiMode ? ', about 2 to 3 minutes' : staticMode ? ', replayed from recorded runs' : ', a few seconds in demo mode'}</dd></dl>
          {apiMode ? <label className="run-passcode">Team passcode<Input type="password" autoComplete="off" value={passcode} onChange={event => setPasscode(event.target.value)} disabled={starting} /><small>Live runs spend real model budget, so they need the passcode.</small></label> : <p className="run-provenance">{staticMode ? 'Replay of recorded benchmark runs. No live model calls or provider spending.' : 'This demo simulates progress locally. No searches, model calls or provider spending occur.'}</p>}
        </>}
      </motion.section>
    </AnimatePresence>
    {error && <p role="alert" className="run-error">{error}</p>}
    <div className="run-wizard-actions"><Button variant="outline" type="button" disabled={starting} className={draft.step === 1 ? 'run-back-hidden' : ''} onClick={() => { setDraft(previous => ({ ...previous, step: Math.max(1, previous.step - 1) })); setError('') }}><ArrowLeft size={17} />Back</Button>{draft.step < 3 ? <Button key="next" type="button" disabled={!selected.length || !actualTask} onClick={event => { event.preventDefault(); setDraft(previous => ({ ...previous, step: Math.min(3, previous.step + 1) })) }}>Next <ArrowRight size={18} /></Button> : <Button key="start" type="submit" disabled={starting || !selected.length || !actualTask}>{starting ? staticMode ? 'Starting replay…' : 'Starting benchmark…' : staticMode ? 'Start replay' : 'Start benchmark'}<Play size={17} /></Button>}</div>
  </form>
}
