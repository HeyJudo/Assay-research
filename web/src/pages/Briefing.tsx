import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, BookOpen, CircleCheck, FileQuestion, LoaderCircle, ReceiptText, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BriefText, LoadState, safeUrl } from '@/components/shared'
import { apiMode, data, sampleData, staticMode } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, defaultWeights, money, percent, rankRows } from '@/lib/metrics'
import { savedPasscode } from '@/lib/passcode'
import { splitBriefing } from '@/lib/briefing-output'
import type { RunRecord } from '@/types'
import './briefing.css'

const sectionDescriptions: Record<string, string> = {
  verified: 'Backed by a quoted source',
  uncertain: 'One source, not confirmed',
  'not found': 'Looked for it, found nothing',
}

export default function Briefing() {
  const reduced = useReducedMotion()
  const [params] = useSearchParams()
  const query = useData(() => Promise.all([data.agents(), data.leaderboard(), data.tasks()]))
  const [subject, setSubject] = useState('')
  const [meeting, setMeeting] = useState(() => {
    const next = new Date()
    next.setDate(next.getDate() + 1)
    next.setHours(9, 0, 0, 0)
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}T09:00`
  })
  const [version, setVersion] = useState('')
  const [passcode, setPasscode] = useState(savedPasscode)
  const [submittedSubject, setSubmittedSubject] = useState('')
  const [submittedMeeting, setSubmittedMeeting] = useState('')
  const [run, setRun] = useState<RunRecord | null>(null)
  const [pendingRun, setPendingRun] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [briefTask, setBriefTask] = useState('')
  const controller = useRef(0)
  useEffect(() => () => { controller.current++ }, [])
  const best = query.value ? rankRows(query.value[1].filter(row => row.agent_id.startsWith('briefing-')), defaultWeights)[0] : undefined
  const selected = version || best?.agent_id || 'briefing-baseline'
  const recorded = useData(() => staticMode ? data.recordedBriefs(selected) : Promise.resolve([] as RunRecord[]), selected)
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [agents, rows, tasks] = query.value
  const recordedList = recorded.value ?? []
  const chosenBrief = recordedList.find(record => record.task_id === briefTask) ?? recordedList[0]
  const promptOf = (taskId: string) => tasks.find(task => task.id === taskId)?.prompt ?? taskId
  const selectedRow = rows.find(row => row.agent_id === selected)
  const output = splitBriefing(run?.output.text ?? '')
  const sources = [...new Set([...(run?.output.text.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g) ?? [])].map(match => safeUrl(match[1])).concat((run?.claims ?? []).map(claim => safeUrl(claim.source_url))).filter((url): url is string => !!url))]
  const receiptParams = new URLSearchParams(params)
  if (run || pendingRun) receiptParams.set('run', run?.id ?? pendingRun)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (staticMode) {
      if (!chosenBrief) return
      controller.current++
      setBusy(false); setPendingRun(''); setSubmittedMeeting(''); setRun(chosenBrief)
      setSubmittedSubject(/^Brief me on (.+?) for a meeting/i.exec(promptOf(chosenBrief.task_id))?.[1] ?? promptOf(chosenBrief.task_id))
      return
    }
    if (!subject.trim() || !meeting) { setError('Enter a company or person and a meeting date/time.'); return }
    if (!Number.isFinite(new Date(meeting).getTime())) { setError('Enter a valid meeting time.'); return }
    if (apiMode && !passcode.trim()) { setError('Enter the team passcode for a live briefing.'); return }
    setBusy(true); setRun(null); setPendingRun(''); setSubmittedSubject(subject.trim()); setSubmittedMeeting(meeting)
    const session = ++controller.current
    try {
      const result = await data.brief(subject.trim(), new Date(meeting).toISOString(), selected, passcode)
      if (session !== controller.current) return
      setPendingRun(result.run_id)
      for (let attempt = 0; attempt < 120; attempt++) {
        if (session !== controller.current) return
        let record: RunRecord
        try { record = await data.run(result.run_id) } catch (pollError) {
          if (attempt < 119) { await new Promise(resolve => setTimeout(resolve, 1000)); continue }
          throw pollError
        }
        if (session !== controller.current) return
        setRun(record)
        if (record.status !== 'running') { setBusy(false); return }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      throw new Error('The briefing is taking longer than expected. Open its receipt to inspect the recorded progress.')
    } catch (e) { if (session === controller.current) { setError(e instanceof Error ? e.message : 'Unable to create a briefing'); setBusy(false) } }
  }
  return <div className="briefing-page">
    <form className="briefing-form" onSubmit={submit}>
      <div className="briefing-intro"><h1>Who are you meeting?</h1><p>Get a brief that separates what is verified from what is not. {apiMode ? 'This one searches the live web.' : staticMode ? 'These briefs were recorded during the benchmark.' : 'Demo mode shows the layout without live research.'}</p></div>
      {staticMode ? <div className="briefing-version"><label htmlFor="brief-recorded">Recorded brief</label>{chosenBrief ? <Select value={chosenBrief.task_id} onValueChange={setBriefTask}><SelectTrigger id="brief-recorded" aria-label="Recorded brief"><SelectValue /></SelectTrigger><SelectContent>{recordedList.map(record => <SelectItem key={record.task_id} value={record.task_id}>{promptOf(record.task_id)}</SelectItem>)}</SelectContent></Select> : <p>{recorded.value ? 'No recorded brief for this version.' : 'Loading recorded briefs.'}</p>}</div> : <><label htmlFor="brief-who">Company or person<Input id="brief-who" placeholder="e.g. Tavily" value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} disabled={busy} required /></label>
      <label htmlFor="brief-when">Meeting time<Input id="brief-when" type="datetime-local" value={meeting} onChange={e => setMeeting(e.target.value)} disabled={busy} required /><small>Your time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</small></label></>}
      <div className="briefing-version"><label htmlFor="brief-version">Agent version</label><Select value={selected} onValueChange={setVersion} disabled={busy}><SelectTrigger id="brief-version" aria-label="Agent version"><SelectValue /></SelectTrigger><SelectContent>{agents.filter(agent => agent.kind === 'ours').map(agent => <SelectItem key={agent.id} value={agent.id}>{agentLabel(agent.id)}{agent.id === best?.agent_id ? ' (top pick)' : ''}</SelectItem>)}</SelectContent></Select><p>{selectedRow ? <>{agentLabel(selected)} has <span className="mono">{percent(selectedRow.accuracy)}</span> accuracy and <span className="mono">{percent(selectedRow.trap_resistance)}</span> trap resistance in the {sampleData ? 'sample' : 'full'} benchmark. </> : 'No benchmark score is available for this version. '}<Link to="/leaderboard">See why</Link></p></div>
      {apiMode && <label className="run-passcode">Team passcode<Input type="password" autoComplete="off" value={passcode} onChange={e => setPasscode(e.target.value)} disabled={busy} /><small>Live briefings spend real model budget, so they need the passcode.</small></label>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {staticMode && !chosenBrief ? null : <Button type="submit" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : null}{busy ? 'Writing the brief…' : staticMode ? 'Show the recorded brief' : 'Write the brief'}{!busy && <ArrowRight size={18} />}</Button>}
      <p className="briefing-mode-note">{apiMode ? 'Researches the 30 days before your meeting with Tavily.' : staticMode ? 'Recorded output. No live searches or model calls.' : 'Sample output only. No live searches, model calls or provider spending.'}</p>
    </form>
    <article className="briefing-paper" aria-label="Meeting briefing" aria-busy={busy}>
      <div className="briefing-paper-header"><div><h2>{output.title ?? (submittedSubject || 'Your meeting brief')}</h2><p className="mono">{submittedMeeting ? `meeting ${submittedMeeting.replace('T', ' · ')}` : 'Verified facts, uncertainty and open questions'}{run?.duration_s != null && ` · written in ${run.duration_s.toFixed(1)} s`}{run && ` · ${money(run.metrics.cost_usd)}`}</p></div>{(run || pendingRun) && <Button variant="outline" asChild><Link to={`?${receiptParams}`}><ReceiptText size={18} />Open the receipt</Link></Button>}</div>
      {run && run.status !== 'running' && run.status !== 'done' && <p className="error-message" role="alert">{run.status === 'budget_exceeded' ? 'The agent reached its budget limit.' : 'The agent ended with an error.'} Review the receipt for details.</p>}
      {run && output.sections.length ? output.sections.map((section, index) => {
        const key = section.heading.toLowerCase()
        return <motion.section className={`briefing-output-section briefing-output-${key.replaceAll(' ', '-')}`} key={`${section.heading}-${index}`} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: .5, delay: reduced ? 0 : index * .12 }}>{section.heading && <h3>{sectionDescriptions[key] ? <><span className="briefing-section-badge">{section.heading}</span><span>{sectionDescriptions[key]}</span></> : section.heading === 'Open questions' ? 'Questions to ask in the meeting' : section.heading}</h3>}<BriefText text={section.text} /></motion.section>
      }) : <div className="briefing-placeholder" role="status">{busy ? <><Search size={32} /><h3>Researching {submittedSubject}.</h3><p>Actual search and model steps appear as the agent records them.</p></> : <><BookOpen size={32} /><h3>{run ? 'The agent returned no briefing text.' : 'Your brief will appear here.'}</h3><p>Choose who you are meeting, then write a brief.</p></>}<div className="briefing-section-preview">{[{ name: 'Verified', icon: CircleCheck }, { name: 'Uncertain', icon: FileQuestion }, { name: 'Not found', icon: Search }, { name: 'Open questions', icon: BookOpen }].map(({ name, icon: Icon }) => <span key={name}><Icon size={16} />{name}</span>)}</div></div>}
      {busy && run?.steps.length ? <section className="briefing-live-steps"><h3>Live research</h3><ol>{run.steps.map(step => <motion.li key={step.i} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0 }}><span className="mono">{step.t.toFixed(1)}s</span><span><strong>{step.kind}</strong> {step.detail}</span></motion.li>)}</ol></section> : null}
      {sources.length > 0 && <div className="briefing-sources"><h3>Sources</h3>{sources.map((url, index) => <a className="mono" href={url} key={url} target="_blank" rel="noreferrer">[{index + 1}] {url}</a>)}</div>}
      {run && <p className="briefing-record-note">{agentLabel(run.agent_id)} · {apiMode ? 'Live research record' : staticMode ? 'Recorded benchmark brief' : 'Sample output. No live facts were researched.'}</p>}
    </article>
  </div>
}
