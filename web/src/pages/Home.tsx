import { Link } from 'react-router'
import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowRight, BriefcaseBusiness, Check, Coins, SlidersHorizontal, TriangleAlert, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadState } from '@/components/shared'
import { HomeAgents } from '@/components/home-agents'
import { HomeMethod } from '@/components/home-method'
import { HomeDemo } from '@/components/home-demo'
import { apiMode, data, sampleData, staticMode } from '@/lib/data'
import { useData } from '@/lib/use-data'
import type { RunSummary, Task } from '@/types'
import { agentLabel, defaultWeights, money, percent, rankRows } from '@/lib/metrics'
import './home.css'

type HeroProps = { receipt: RunSummary | undefined; receiptTask: Task | undefined; stamp: string; reduced: boolean; hero: (index: number) => object; printLine: (index: number) => object }

// As the hero scrolls away the receipt drifts up and tilts while the pitch eases back, so the hero hands off to the next section with some depth.
function Hero({ receipt, receiptTask, stamp, reduced, hero, printLine }: HeroProps) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const receiptY = useTransform(scrollYProgress, [0, 1], [0, -80])
  const receiptRotate = useTransform(scrollYProgress, [0, 1], [0, -3])
  const receiptScale = useTransform(scrollYProgress, [0, 1], [1, .96])
  const pitchY = useTransform(scrollYProgress, [0, 1], [0, -40])
  const pitchOpacity = useTransform(scrollYProgress, [0, 1], [1, .4])
  return <section className="home-hero" ref={ref}>
    <motion.div className="home-pitch" style={reduced ? undefined : { y: pitchY, opacity: pitchOpacity }}>
      <motion.h1 {...hero(0)}>Know what your research agent does when the web <span>lies</span>.</motion.h1>
      <motion.p {...hero(1)}>Assay runs research agents on a frozen web, plants traps, and keeps a receipt for every claim.</motion.p>
      <motion.div className="home-actions" {...hero(2)}><Button asChild><Link to="/run">{apiMode ? 'Run a live benchmark' : staticMode ? 'Replay a benchmark run' : 'Run a demo benchmark'}<ArrowRight size={17} /></Link></Button><Button asChild variant="outline"><Link to="/briefing"><BriefcaseBusiness size={17} />Try the Briefing Agent</Link></Button></motion.div>
    </motion.div>
    <motion.div className="home-receipt-wrap" style={reduced ? undefined : { y: receiptY, rotate: receiptRotate, scale: receiptScale }}><motion.div className="home-receipt-enter" {...hero(3)}>
      {receipt ? <div className="home-paper">
        <Link to={`?run=${encodeURIComponent(receipt.id)}`} className="home-receipt" aria-label={`Open ${agentLabel(receipt.agent_id)} run receipt`}>
          <motion.span className={`home-stamp ${receipt.metrics.success && !receipt.metrics.trap_fell ? 'home-stamp-pass' : ''}`} initial={reduced ? false : { opacity: 0, scale: 1.7, rotate: -10 }} animate={{ opacity: 1, scale: 1, rotate: -10 }} transition={{ type: 'spring', bounce: 0, delay: reduced ? 0 : 1.3 }}>{stamp}</motion.span>
          <motion.div className="home-receipt-id mono" {...printLine(0)}>RUN RECEIPT · {receipt.id}</motion.div>
          <motion.h2 {...printLine(1)}>{agentLabel(receipt.agent_id)}</motion.h2>
          <motion.p className="home-receipt-task mono" {...printLine(2)}>“{receiptTask?.prompt ?? receipt.task_id}”</motion.p>
          <div className="home-paper-rule" />
          {receipt.claims.length ? receipt.claims.slice(0, 2).map((claim, i) => <motion.div className="home-receipt-claim" key={`${claim.text}-${i}`} {...printLine(i + 3)}><span className={claim.verdict === 'supported' ? 'home-claim-pass' : 'home-claim-fail'}>{claim.verdict === 'supported' ? <Check size={17} /> : <X size={17} />}</span><div><p>{claim.text}</p><small className="mono">{claim.source_quote ? `> “${claim.source_quote}”` : `> ${claim.verdict.replaceAll('_', ' ')}`}</small></div></motion.div>) : <motion.p className="home-no-claims" {...printLine(3)}>No claims were graded for this run.</motion.p>}
          <motion.div className="home-receipt-total mono" {...printLine(5)}><span>TOTAL</span><span>{money(receipt.metrics.cost_usd)}</span></motion.div>
          <motion.div className="home-receipt-meta mono" {...printLine(6)}><span>{receipt.metrics.steps} steps</span><span>{receipt.duration_s == null ? 'Duration unavailable' : `${receipt.duration_s.toFixed(1)} s`}</span></motion.div>
        </Link>
        <div className="home-paper-teeth" aria-hidden="true" />
      </div> : <p className="home-no-claims">Run a benchmark to print your first receipt.</p>}
    </motion.div></motion.div>
  </section>
}

export default function Home() {
  const reduced = useReducedMotion()
  const query = useData(() => Promise.all([data.leaderboard(), data.runs(), data.agents(), data.tasks()]))
  if (!query.value) return <LoadState error={query.error} retry={query.retry} />
  const [rows, runs, agents, tasks] = query.value
  const ranked = rankRows(rows, defaultWeights)
  const top = ranked[0]
  const baseline = rows.find(row => row.agent_id === 'briefing-baseline')
  const cheap = rows.find(row => row.agent_id === 'briefing-cheap-first')
  const costComparison = baseline?.cost_per_correct != null && cheap?.cost_per_correct != null && Number.isFinite(baseline.cost_per_correct) && Number.isFinite(cheap.cost_per_correct) && baseline.cost_per_correct > 0
    ? (cheap.cost_per_correct / baseline.cost_per_correct - 1) * 100 : null
  const trapResult = rows.filter(row => agents.find(agent => agent.id === row.agent_id)?.kind === 'outside' && row.trap_resistance != null && Number.isFinite(row.trap_resistance)).sort((a, b) => a.trap_resistance! - b.trap_resistance!)[0]
  const receipt = runs.find(run => run.metrics.trap_fell && run.claims.length) ?? runs.find(run => run.claims.length) ?? runs[0]
  const receiptTask = tasks.find(task => task.id === receipt?.task_id)
  const receiptStamp = receipt?.status === 'running' ? 'RUNNING' : receipt?.metrics.trap_fell ? 'TRAPPED' : receipt?.metrics.success ? 'PASSED' : 'FAILED'
  // Sections fade up as they enter the view, so the page reads top to bottom. The margin and amount keep fast scrolls and anchor jumps from landing on blank space.
  const reveal = reduced ? {} : { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .15, margin: '0px 0px -10% 0px' }, transition: { type: 'spring' as const, bounce: 0, duration: .45 } }
  // Findings cards rise in 80ms apart, so the winner reads first and the two comparisons follow.
  const card = (index: number) => reduced ? {} : { initial: { opacity: 0, y: 32, scale: .97 }, whileInView: { opacity: 1, y: 0, scale: 1 }, viewport: { once: true, amount: .15, margin: '0px 0px -10% 0px' }, transition: { type: 'spring' as const, bounce: 0, duration: .45, delay: index * .08 } }
  // Leaderboard rows follow the same top-to-bottom order, 50ms apart.
  const rowIn = (index: number) => reduced ? {} : { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .15, margin: '0px 0px -10% 0px' }, transition: { type: 'spring' as const, bounce: 0, duration: .4, delay: index * .05 } }
  // Hero items enter in reading order, 50ms apart.
  const hero = (index: number) => reduced ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring' as const, bounce: 0, duration: .45, delay: index * .05 } }
  const printLine = (index: number) => reduced ? {} : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring' as const, bounce: 0, duration: .5, delay: index * .13 } }
  return <div className="home-page">
    <Hero receipt={receipt} receiptTask={receiptTask} stamp={receiptStamp} reduced={!!reduced} hero={hero} printLine={printLine} />
    <HomeDemo />
    <HomeMethod />
    <motion.section className="home-section" aria-labelledby="home-agents-title" {...reveal}>
      <div className="home-section-heading"><h2 id="home-agents-title">The four agents on the board</h2><span>Three versions of our Briefing Agent, each changing one thing, plus one outside agent</span></div>
      <HomeAgents agents={agents} rows={rows} />
    </motion.section>
    <section className="home-section">
      <motion.div className="home-section-heading" {...reveal}><h2>What the benchmark found</h2><span>{sampleData ? 'Illustrative sample findings' : 'Measured benchmark findings'}</span></motion.div>
      {top ? <div className="home-findings">
        <motion.div {...card(0)} whileHover={reduced ? undefined : { y: -4 }}><Link className="home-finding home-finding-winner" to={`/results?scope=full&a=${encodeURIComponent(top.agent_id)}`}><span className="home-finding-icon"><Trophy size={28} /></span><div><h3>{agentLabel(top.agent_id)} is the best fit.</h3><p className="home-winner-note">Ranked first with default priorities. {agents.find(agent => agent.id === top.agent_id)?.description}</p></div><div className="home-winning-metrics">{[{ value: top.accuracy, label: 'accuracy' }, { value: top.trap_resistance, label: 'trap resistance' }, { value: top.honesty, label: 'honesty' }].map(metric => <span key={metric.label}><strong className="mono">{percent(metric.value)}</strong>{metric.label}</span>)}</div></Link></motion.div>
        <div className="home-finding-stack">
          <motion.div {...card(1)} whileHover={reduced ? undefined : { y: -4 }}><Link className="home-finding" to={`/results?scope=full&a=${encodeURIComponent(cheap?.agent_id ?? top.agent_id)}&b=${encodeURIComponent(baseline?.agent_id ?? top.agent_id)}`}><div className="home-finding-line"><span className="home-finding-icon"><Coins size={23} /></span><h3>{costComparison == null ? 'Compare cost per correct answer across the agents.' : Math.round(Math.abs(costComparison)) === 0 ? `${agentLabel(cheap!.agent_id)} and ${agentLabel(baseline!.agent_id)} cost the same per correct answer.` : `${agentLabel(cheap!.agent_id)} costs ${Math.round(Math.abs(costComparison))}% ${costComparison > 0 ? 'more' : 'less'} per correct answer than ${agentLabel(baseline!.agent_id)}.`}</h3></div><div className="home-finding-bottom"><span><span className="mono">{money(cheap?.cost_per_correct)}</span> against <span className="mono">{money(baseline?.cost_per_correct)}</span></span><strong>Compare<ArrowRight size={16} /></strong></div></Link></motion.div>
          <motion.div {...card(2)} whileHover={reduced ? undefined : { y: -4 }}><Link className="home-finding" to={`/results?scope=full&a=${encodeURIComponent(trapResult?.agent_id ?? top.agent_id)}`}><div className="home-finding-line"><span className="home-finding-icon home-finding-danger"><TriangleAlert size={23} /></span><h3>{trapResult ? `${agentLabel(trapResult.agent_id)} resisted ${percent(trapResult.trap_resistance)} of the planted traps.` : 'Trap results appear when controlled failures have been measured.'}</h3></div><div className="home-finding-bottom"><span>{trapResult ? <><span className="mono">{percent(trapResult.trap_resistance)}</span> trap resistance, {trapResult.runs} total runs</> : 'No measured trap resistance yet.'}</span><strong>Compare<ArrowRight size={16} /></strong></div></Link></motion.div>
        </div>
      </div> : <p>No benchmark results yet. Start a benchmark to inspect the evidence.</p>}
    </section>
    <section className="home-section">
      <motion.div className="home-section-heading" {...reveal}><h2>Leaderboard</h2><Link to="/leaderboard"><SlidersHorizontal size={17} />Rank by your priorities</Link></motion.div>
      <div className="home-board-wrap"><table className="home-board"><thead><tr><th>Agent</th><th>Accuracy</th><th>Cost / correct</th><th>Trap resistance</th></tr></thead><tbody>{ranked.slice(0, 5).map((row, index) => <motion.tr key={row.agent_id} {...rowIn(index)}><th scope="row"><Link to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}><span className={`home-rank mono ${index === 0 ? 'home-rank-first' : ''}`}>{index + 1}</span>{agentLabel(row.agent_id)}{agents.find(agent => agent.id === row.agent_id)?.kind === 'outside' && <span className="home-outside">outside</span>}</Link></th><td data-label="Accuracy"><div className="home-accuracy"><span className="home-bar-track"><motion.b initial={reduced ? false : { scaleX: 0 }} whileInView={{ scaleX: Math.max(0, Math.min(1, row.accuracy ?? 0)) }} viewport={{ once: true }} transition={{ type: 'spring', bounce: 0, duration: .7 }} style={{ background: index === 0 ? 'var(--primary)' : undefined }} /></span><Link className="mono" to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}>{percent(row.accuracy)}</Link></div></td><td className="mono" data-label="Cost / correct"><Link to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}>{money(row.cost_per_correct)}</Link></td><td className="mono" data-label="Trap resistance"><Link to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}>{percent(row.trap_resistance)}</Link></td></motion.tr>)}</tbody></table></div>
      <p className="home-cost-note">Cost is list-price equivalent. Free-tier billing may be $0. Failed runs without usage have $0 recorded cost.</p>
    </section>
    <motion.section className="home-cta" {...reveal}><div><h2>Rank the agents your way</h2><p>Set how much accuracy, cost, trap resistance and honesty matter to you, and watch the order change.</p></div><Button asChild variant="outline"><Link to="/leaderboard">Open the leaderboard<ArrowRight size={17} /></Link></Button></motion.section>
  </div>
}
