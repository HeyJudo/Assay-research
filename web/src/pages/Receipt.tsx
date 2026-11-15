import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { AlertCircle, ArrowLeftRight, Check, ChevronDown, Cpu, Download, ExternalLink, FileText, ReceiptText, Search, X } from 'lucide-react'
import { Sheet, SheetClose, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { BriefText, LoadState, safeUrl } from '@/components/shared'
import { data } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, money, percent } from '@/lib/metrics'
import type { RunRecord } from '@/types'
import './receipt.css'

const spring = { type: 'spring' as const, stiffness: 230, damping: 34 }
const stepKinds = [
  { kind: 'llm', label: 'Model call', icon: Cpu },
  { kind: 'search', label: 'Search', icon: Search },
  { kind: 'read', label: 'Page read', icon: FileText },
  { kind: 'switch', label: 'Model switch', icon: ArrowLeftRight },
  { kind: 'error', label: 'Error', icon: AlertCircle },
] as const

function exportRun(run: RunRecord) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = `${run.id}.json`; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ReceiptPaper({ id }: { id: string }) {
  const reduced = useReducedMotion()
  const query = useData(() => Promise.all([data.agents(), data.run(id), data.tasks()]), id)
  const [updated, setUpdated] = useState<{ id: string; record: RunRecord } | null>(null)
  const [refreshError, setRefreshError] = useState('')
  const currentRun = updated?.id === id ? updated.record : query.value?.[1]
  useEffect(() => {
    if (currentRun?.status !== 'running') return
    let active = true
    let timer: ReturnType<typeof window.setTimeout>
    async function poll() {
      try {
        const record = await data.run(id)
        if (!active) return
        setUpdated({ id, record }); setRefreshError('')
        if (record.status === 'running') timer = window.setTimeout(poll, 1000)
      } catch (reason) {
        if (!active) return
        setRefreshError(reason instanceof Error ? reason.message : 'Unable to update this receipt.')
        timer = window.setTimeout(poll, 3000)
      }
    }
    timer = window.setTimeout(poll, 1000)
    return () => { active = false; window.clearTimeout(timer) }
  }, [id, currentRun?.status])
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [, initialRun, tasks] = query.value
  const run = currentRun ?? initialRun
  const passed = run.status === 'done' && run.metrics.success
  const outcome = run.status === 'running' ? 'Running' : run.status === 'error' ? 'Error' : run.status === 'budget_exceeded' ? 'Budget exceeded' : passed ? 'Passed' : 'Failed'
  const supported = run.claims.filter(claim => claim.verdict === 'supported').length
  const task = tasks.find(task => task.id === run.task_id)
  const phaseCosts = run.steps.reduce<Record<string, number>>((groups, step) => { groups[step.phase] = (groups[step.phase] ?? 0) + step.cost_usd; return groups }, {})
  const line = { hidden: { opacity: 0, y: -8 }, shown: { opacity: 1, y: 0, transition: { ...spring, staggerChildren: .045 } } }
  const print = reduced ? {} : { initial: 'hidden', animate: 'shown', variants: { hidden: {}, shown: { transition: { staggerChildren: .055, delayChildren: .12 } } } }
  const row = reduced ? {} : { variants: line }
  return <>
    {refreshError && <p className="error-message" role="status">{refreshError} Retrying receipt updates.</p>}
    <div className="receipt-printer" aria-hidden="true"><motion.span initial={false} animate={reduced ? {} : { opacity: [1, .3, 1] }} transition={{ duration: 1, repeat: 2 }} /></div>
    <div className="receipt-paper-window">
      <motion.article className="receipt-paper" {...print} aria-label={`${agentLabel(run.agent_id)} run receipt`}>
        <div className="receipt-paper-body">
          <motion.div className={`receipt-stamp ${passed ? 'passed' : run.status === 'running' ? 'working' : 'failed'}`} aria-hidden="true" initial={reduced ? false : { opacity: 0, scale: 1.7, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: -12 }} transition={{ ...spring, delay: reduced ? 0 : .65 }}>{outcome.toUpperCase()}</motion.div>
          <motion.header className="receipt-paper-heading" {...row}><ReceiptText size={28} aria-hidden="true" /><div>ASSAY</div><p>{run.id}</p><time dateTime={run.started_at}>{Number.isNaN(Date.parse(run.started_at)) ? run.started_at : new Date(run.started_at).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</time></motion.header>
          <motion.section className="receipt-print-section" {...row}>
            <motion.div className="receipt-line" {...row}><span className="receipt-label">AGENT</span><i /><strong>{agentLabel(run.agent_id)} v{run.config.agent_version}</strong></motion.div>
            <motion.div className="receipt-line" {...row}><span className="receipt-label">REPEAT</span><i /><span>{run.repeat} of 3</span></motion.div>
            <motion.div className="receipt-line" {...row}><span className="receipt-label">RESULT</span><i /><strong className={passed ? 'receipt-good' : 'receipt-bad'}>{outcome}</strong></motion.div>
            <p className="receipt-task">{task?.prompt ?? run.task_id}</p>
            {run.metrics.trap_fell && <p className="receipt-bad">Fell for the planted trap.</p>}
            {run.config.fallback_used && <p className="receipt-bad">Fallback model used. Flagged for review.</p>}
          </motion.section>
          <motion.section className="receipt-print-section" {...row}><h3 className="receipt-label">WHAT IT DID · {run.steps.length} STEPS</h3>{stepKinds.map(({ kind, label, icon: Icon }) => {
            const steps = run.steps.filter(step => step.kind === kind)
            if (!steps.length) return null
            return <div key={kind}><motion.div className="receipt-line" {...row}><Icon size={14} /><span>{steps.length} × {label}</span><i /><span>{kind === 'switch' ? `at ${steps[0].t.toFixed(1)}s` : money(steps.reduce((sum, step) => sum + step.cost_usd, 0))}</span></motion.div>{kind === 'switch' && steps.map(step => <p className="receipt-switch-note" key={step.i}>{step.detail}</p>)}</div>
          })}{!run.steps.length && <p className="receipt-muted">No steps recorded.</p>}
            {!!run.steps.length && <details className="receipt-details"><summary><ChevronDown size={14} />Show all {run.steps.length} steps</summary><ol className="receipt-steps">{run.steps.map(step => <li key={step.i}><div><time>{step.t.toFixed(1)}s</time><strong>{stepKinds.find(kind => kind.kind === step.kind)?.label ?? step.kind}</strong><span>{step.detail}</span></div><p>{step.phase}{step.model ? ` · ${step.model}` : ''} · {step.tokens.toLocaleString()} tokens · {money(step.cost_usd)}</p></li>)}</ol></details>}
          </motion.section>
          <motion.section className="receipt-print-section" {...row}><h3 className="receipt-label">PAID TO</h3>{Object.entries(run.metrics.cost_by_model).length ? Object.entries(run.metrics.cost_by_model).map(([model, cost]) => <div className="receipt-line" key={model}><span>{model}</span><i /><span>{money(cost)}</span></div>) : <p className="receipt-muted">No model-level charges recorded.</p>}
            <details className="receipt-details"><summary><ChevronDown size={14} />Cost by phase</summary>{Object.entries(phaseCosts).map(([phase, cost]) => <div className="receipt-line" key={phase}><span>{phase}</span><i /><span>{money(cost)}</span></div>)}<p className="receipt-muted">Derived from steps. May differ from the recorded total when accounting is incomplete.</p></details>
            <div className="receipt-total"><motion.div className="receipt-line" {...row}><strong>TOTAL</strong><i /><strong>{money(run.metrics.cost_usd)}</strong></motion.div><motion.div className="receipt-line receipt-muted" {...row}><span>{run.duration_s == null ? 'Time unavailable' : `${run.duration_s.toFixed(1)} s`}</span><i /><span>{run.metrics.tokens.toLocaleString()} tokens</span></motion.div></div>
          </motion.section>
          <motion.section className="receipt-print-section" {...row}><h3 className="receipt-label">CLAIMS CHECKED · {supported} OF {run.claims.length} SUPPORTED</h3><div className="receipt-claims">{run.claims.map((claim, index) => <motion.article key={index} className={`receipt-claim verdict-${claim.verdict}`} {...row}>{claim.verdict === 'supported' ? <Check size={16} /> : <AlertCircle size={16} />}<div><span className="receipt-verdict">{claim.verdict.replaceAll('_', ' ')}</span><h4>{claim.text}</h4>{claim.source_quote ? <blockquote>&gt; “{claim.source_quote}”</blockquote> : <p className="receipt-muted">No source quote recorded. This claim is not verified by a passage.</p>}{safeUrl(claim.source_url) ? <a href={safeUrl(claim.source_url)!} target="_blank" rel="noreferrer">{claim.source_url}<ExternalLink size={12} /></a> : <p className="receipt-muted">{claim.source_url ? `Recorded source: ${claim.source_url}` : 'No source link recorded.'}</p>}</div></motion.article>)}</div>{!run.claims.length && <p className="receipt-muted">No claim verdicts recorded. Demo runs do not invent citation evidence.</p>}<p className="receipt-muted receipt-claim-share">Supported share: {percent(run.metrics.claims_supported_pct)}</p></motion.section>
          <motion.section className="receipt-print-section" {...row}><details className="receipt-details"><summary><ChevronDown size={14} />Agent output</summary><BriefText text={run.output.text || 'No output recorded.'} /></details><p className="receipt-muted">Abstained: {run.output.abstained ? 'yes' : 'no'} · Abstention grade: {run.metrics.abstention?.replaceAll('_', ' ') ?? 'not applicable'}</p></motion.section>
          <motion.footer className="receipt-print-section receipt-config" {...row}><p>prompt {run.config.prompt_hash} · pool {run.config.pool_version}</p><p>{run.trap?.replaceAll('_', ' ') ?? 'no trap'} · seed {run.config.trap_seed ?? 'none'} · {run.config.fallback_used ? 'fallback used' : 'no fallback'}</p><p>Models: {run.config.models.length ? run.config.models.join(' → ') : 'none recorded'}</p><p>{run.metrics.steps} steps · {run.metrics.tool_calls} tool calls</p><div className="receipt-barcode" aria-hidden="true" /><p className="receipt-barcode-id">{run.id}</p></motion.footer>
        </div>
      </motion.article><div className="receipt-zig" aria-hidden="true" />
    </div>
    <Button className="receipt-export" variant="outline" onClick={() => exportRun(run)}><Download size={16} />Export JSON</Button>
  </>
}

export default function Receipt() {
  const [params, setParams] = useSearchParams()
  const id = params.get('run')
  const reduced = useReducedMotion()
  const opener = useRef<HTMLElement | null>(null)
  function close() { setParams(previous => { const next = new URLSearchParams(previous); next.delete('run'); return next }) }
  function captureOpener() { if (!(document.activeElement as HTMLElement | null)?.closest('[role=dialog]')) opener.current = document.activeElement as HTMLElement | null }
  function restoreFocus() { if (opener.current?.isConnected) opener.current.focus() }
  return <Sheet open={!!id} onOpenChange={open => { if (!open) close() }}>
    <Dialog.Portal forceMount><AnimatePresence>{id && <FragmentWithReceipt key={id} id={id} reduced={!!reduced} close={close} captureOpener={captureOpener} restoreFocus={restoreFocus} />}</AnimatePresence></Dialog.Portal>
  </Sheet>
}

function FragmentWithReceipt({ id, reduced, close, captureOpener, restoreFocus }: { id: string; reduced: boolean; close: () => void; captureOpener: () => void; restoreFocus: () => void }) {
  return <>
    <Dialog.Overlay forceMount asChild><motion.div className="receipt-scrim" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} transition={{ duration: reduced ? 0 : .2 }} onClick={close} /></Dialog.Overlay>
    <Dialog.Content forceMount asChild onOpenAutoFocus={captureOpener} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus() }}><motion.aside className="receipt-sheet" initial={reduced ? false : { x: '100%' }} animate={{ x: 0 }} exit={{ x: reduced ? 0 : '100%', opacity: reduced ? 0 : 1, pointerEvents: 'none' }} transition={reduced ? { duration: 0 } : spring}>
      <div className="receipt-sheet-header"><SheetTitle>Run receipt</SheetTitle><SheetClose asChild><Button variant="ghost" size="icon" aria-label="Close receipt"><X size={20} /></Button></SheetClose></div><SheetDescription className="sr-only">Every recorded step, cost, claim verdict and source for this research run.</SheetDescription><ReceiptPaper id={id} />
    </motion.aside></Dialog.Content>
  </>
}
