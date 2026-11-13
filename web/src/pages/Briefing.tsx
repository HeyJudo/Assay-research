import { Input } from '@/components/ui/input'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, BookOpen, FileCheck2, LoaderCircle, Search, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BriefText, Heading, LoadState } from '@/components/shared'
import { apiMode, data, sampleData } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, defaultWeights, percent, rankRows } from '@/lib/metrics'
import type { RunRecord } from '@/types'

export default function Briefing() {
  const query = useData(() => Promise.all([data.agents(), data.leaderboard()]))
  const [subject, setSubject] = useState('')
  const [meeting, setMeeting] = useState(() => {
    const next = new Date()
    next.setDate(next.getDate() + 1)
    next.setHours(9, 0, 0, 0)
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}T09:00`
  })
  const [version, setVersion] = useState('')
  const [submittedSubject, setSubmittedSubject] = useState('')
  const [run, setRun] = useState<RunRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef(0)
  useEffect(() => () => { controller.current++ }, [])
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [agents, rows] = query.value
  const best = rankRows(rows.filter(row => row.agent_id.startsWith('briefing-')), defaultWeights)[0]
  const selected = version || best?.agent_id || 'briefing-baseline'
  const selectedRow = rows.find(row => row.agent_id === selected)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!subject.trim() || !meeting) { setError('Enter a company or person and a meeting date/time.'); return }
    if (!Number.isFinite(new Date(meeting).getTime())) { setError('Enter a valid meeting time.'); return }
    setBusy(true); setRun(null); setSubmittedSubject(subject.trim())
    const session = ++controller.current
    try {
      const result = await data.brief(subject.trim(), new Date(meeting).toISOString(), selected)
      for (let attempt = 0; attempt < 120; attempt++) {
        if (session !== controller.current) return
        let record: RunRecord
        try { record = await data.run(result.run_id) } catch (pollError) {
          if (attempt < 119) { await new Promise(resolve => setTimeout(resolve, 1000)); continue }
          throw pollError
        }
        if (session !== controller.current) return
        if (record.status !== 'running') { setRun(record); setBusy(false); return }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      throw new Error('The briefing is taking longer than expected. Check the server before trying again.')
    } catch (e) { if (session === controller.current) { setError(e instanceof Error ? e.message : 'Unable to create a briefing'); setBusy(false) } }
  }
  return <><Heading eyebrow="THE AGENT WE PUT TO THE TEST" title="Prepare a meeting briefing" description="A focused, one-page briefing. Recent developments, clear sources, and the questions worth asking." />
    <div className="briefing-layout"><div className="stack"><Card><CardHeader><h2>Prepare a briefing</h2><BookOpen size={19} /></CardHeader><CardContent><form onSubmit={submit} className="stack"><label>Company or person<Input placeholder="e.g. Tavily or a company founder" value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} disabled={busy} required /></label><label>Meeting date & time<Input type="datetime-local" value={meeting} onChange={e => setMeeting(e.target.value)} disabled={busy} required /><small className="field-hint">Your local time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Sent to the API with a UTC offset.</small></label><label>Agent version<select value={selected} onChange={e => setVersion(e.target.value)} disabled={busy}>{agents.filter(a => a.kind === 'ours').map(a => <option key={a.id} value={a.id}>{agentLabel(a.id)}{a.id === best?.agent_id ? ' · Top sample fit' : ''}</option>)}</select></label><div className="brief-window"><Search size={17} /><span>Research window<strong>30 days before your meeting</strong></span></div>{error && <p className="error-message" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}{busy ? 'Preparing your briefing…' : apiMode ? 'Research with Tavily' : 'Generate sample briefing'}</Button><p className="fine-print">{apiMode ? 'Uses the configured API. The briefing endpoint is owned by the backend teammate.' : 'Demo mode produces a sample layout only. No live Tavily search is performed.'}</p></form></CardContent></Card><Card className="soft-card"><CardContent><ShieldCheck size={22} /><h3>Selected agent benchmark</h3><p>{selectedRow ? `${agentLabel(selected)} has ${percent(selectedRow.accuracy)} ${sampleData ? 'sample ' : ''}benchmark accuracy. This is not a score for your new briefing.` : 'Inspect benchmark performance before choosing a version.'}</p><Link to="/leaderboard" className="text-link">Explore agent evidence <ArrowRight size={14} /></Link></CardContent></Card></div>
    <Card className="brief-paper"><CardHeader><div><span className="eyebrow">MEETING INTELLIGENCE</span><h2>{run ? submittedSubject : 'Briefing output'}</h2></div><Badge variant="outline">{apiMode ? 'Live request' : 'Sample output'}</Badge></CardHeader><CardContent>{run ? <><BriefText text={run.output.text} />{(run.status === 'error' || run.status === 'budget_exceeded') && <p className="error-message">{run.status === 'budget_exceeded' ? 'The agent reached its budget limit.' : 'The agent ended with an error.'} Review the receipt for details.</p>}<div className="brief-footer"><span>{agentLabel(run.agent_id)}</span><Button variant="outline" asChild><Link to={`/runs/${run.id}`}><FileCheck2 size={15} />Inspect receipt</Link></Button></div></> : <div className="brief-placeholder">{busy ? <LoaderCircle className="spin" size={42} /> : <BookOpen size={42} />}<h3>{busy ? 'Gathering your briefing…' : 'No briefing generated yet'}</h3><p>Your briefing separates what is supported, what is uncertain, and what the agent could not find.</p><div className="section-preview">{['Verified', 'Uncertain', 'Not found', 'Open questions'].map((section, i) => <div key={section}><span className={`preview-dot preview-${i}`} /><strong>{section}</strong><div className="skeleton-line" /></div>)}</div></div>}</CardContent></Card></div>
  </>
}
