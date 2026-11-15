import { Link } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, BriefcaseBusiness, Check, Coins, Play, SlidersHorizontal, TriangleAlert, Trophy, X } from 'lucide-react'
import { CircleCheck, List, Repeat, Sliders, Snowflake, TriangleAlert as TrapStation } from 'kubai-icons-react'
import { Button } from '@/components/ui/button'
import { LoadState } from '@/components/shared'
import { apiMode, data, sampleData } from '@/lib/data'
import { useData } from '@/lib/use-data'
import { agentLabel, defaultWeights, money, percent, rankRows } from '@/lib/metrics'
import './home.css'

const stations = [
  { icon: Snowflake, title: 'Freeze the web', text: 'Every agent searches the same saved pages.' },
  { icon: TrapStation, title: 'Plant a trap', text: 'A fake article, a hidden instruction, or an outage.' },
  { icon: Repeat, title: 'Run it three times', text: 'One lucky pass does not count.' },
  { icon: List, title: 'Record every step', text: 'Searches, pages, model calls and cost.' },
  { icon: CircleCheck, title: 'Check every claim', text: 'Briefing claims are matched to source quotes.' },
  { icon: Sliders, title: 'Rank your way', text: 'Weigh accuracy, cost, traps and honesty.' },
]

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
  const reveal = reduced ? {} : { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .15 }, transition: { type: 'spring' as const, bounce: 0, duration: .65 } }
  const printLine = (index: number) => reduced ? {} : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring' as const, bounce: 0, duration: .5, delay: index * .13 } }
  return <div className="home-page">
    <section className="home-hero">
      <motion.div className="home-pitch" {...reveal}>
        <h1>Know what your research agent does when the web <span>lies</span>.</h1>
        <p>Assay runs research agents on a frozen web, plants traps, and keeps a receipt for every claim.</p>
        <div className="home-actions"><Button asChild><Link to="/run">{apiMode ? 'Run a live benchmark' : 'Run a demo benchmark'}<ArrowRight size={17} /></Link></Button><Button asChild variant="outline"><Link to="/briefing"><BriefcaseBusiness size={17} />Try the Briefing Agent</Link></Button></div>
      </motion.div>
      <div className="home-receipt-wrap">
        {receipt ? <motion.div className="home-paper" animate={reduced ? { rotate: 0 } : { rotate: [1.2, .4, 1.2], y: [0, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
          <Link to={`?run=${encodeURIComponent(receipt.id)}`} className="home-receipt" aria-label={`Open ${agentLabel(receipt.agent_id)} run receipt`}>
            <motion.span className={`home-stamp ${receipt.metrics.success && !receipt.metrics.trap_fell ? 'home-stamp-pass' : ''}`} initial={reduced ? false : { opacity: 0, scale: 1.7, rotate: -10 }} animate={{ opacity: 1, scale: 1, rotate: -10 }} transition={{ type: 'spring', bounce: 0, delay: reduced ? 0 : 1.3 }}>{receiptStamp}</motion.span>
            <motion.div className="home-receipt-id mono" {...printLine(0)}>RUN RECEIPT · {receipt.id}</motion.div>
            <motion.h2 {...printLine(1)}>{agentLabel(receipt.agent_id)}</motion.h2>
            <motion.p className="home-receipt-task mono" {...printLine(2)}>“{receiptTask?.prompt ?? receipt.task_id}”</motion.p>
            <div className="home-paper-rule" />
            {receipt.claims.length ? receipt.claims.slice(0, 2).map((claim, i) => <motion.div className="home-receipt-claim" key={`${claim.text}-${i}`} {...printLine(i + 3)}><span className={claim.verdict === 'supported' ? 'home-claim-pass' : 'home-claim-fail'}>{claim.verdict === 'supported' ? <Check size={17} /> : <X size={17} />}</span><div><p>{claim.text}</p><small className="mono">{claim.source_quote ? `> “${claim.source_quote}”` : `> ${claim.verdict.replaceAll('_', ' ')}`}</small></div></motion.div>) : <motion.p className="home-no-claims" {...printLine(3)}>No claims were graded for this run.</motion.p>}
            <motion.div className="home-receipt-total mono" {...printLine(5)}><span>TOTAL</span><span>{money(receipt.metrics.cost_usd)}</span></motion.div>
            <motion.div className="home-receipt-meta mono" {...printLine(6)}><span>{receipt.metrics.steps} steps</span><span>{receipt.duration_s == null ? 'Duration unavailable' : `${receipt.duration_s.toFixed(1)} s`}</span></motion.div>
          </Link>
          <div className="home-paper-teeth" aria-hidden="true" />
        </motion.div> : <p className="home-no-claims">Run a benchmark to print your first receipt.</p>}
      </div>
    </section>
    <motion.section className="home-section home-method" id="methodology" {...reveal}>
      <h2>How a run works</h2>
      <div className="home-stations-wrap"><div className="home-flow" aria-hidden="true"><motion.div animate={reduced ? { x: 0 } : { x: [0, 20] }} transition={{ duration: .8, repeat: Infinity, ease: 'linear' }} /></div><ol className="home-stations">{stations.map(({ icon: Icon, title, text }) => <li key={title}><motion.span className="home-station-icon" whileHover={reduced ? undefined : { scale: 1.1 }} transition={{ type: 'spring', bounce: 0 }}><Icon size={32} color="var(--primary)" variant="soft" trigger="none" /></motion.span><h3>{title}</h3><p>{text}</p></li>)}</ol></div>
    </motion.section>
    <section className="home-section">
      <motion.div className="home-section-heading" {...reveal}><h2>What the benchmark found</h2><span>{sampleData ? 'Illustrative sample findings' : 'Measured benchmark findings'}</span></motion.div>
      {top ? <div className="home-findings">
        <motion.div {...reveal} whileHover={reduced ? undefined : { y: -4 }}><Link className="home-finding home-finding-winner" to={`/results?scope=full&a=${encodeURIComponent(top.agent_id)}`}><span className="home-finding-icon"><Trophy size={28} /></span><h3>{agentLabel(top.agent_id)} is the best fit with default priorities. {agents.find(agent => agent.id === top.agent_id)?.description}</h3><div className="home-winning-metrics">{[{ value: top.accuracy, label: 'accuracy' }, { value: top.trap_resistance, label: 'trap resistance' }, { value: top.honesty, label: 'honesty' }].map(metric => <span key={metric.label}><strong className="mono">{percent(metric.value)}</strong>{metric.label}</span>)}</div></Link></motion.div>
        <div className="home-finding-stack">
          <motion.div {...reveal} whileHover={reduced ? undefined : { y: -4 }}><Link className="home-finding" to={`/results?scope=full&a=${encodeURIComponent(cheap?.agent_id ?? top.agent_id)}&b=${encodeURIComponent(baseline?.agent_id ?? top.agent_id)}`}><div className="home-finding-line"><span className="home-finding-icon"><Coins size={23} /></span><h3>{costComparison == null ? 'Compare cost per correct answer across the agents.' : Math.round(Math.abs(costComparison)) === 0 ? `${agentLabel(cheap!.agent_id)} and ${agentLabel(baseline!.agent_id)} cost the same per correct answer.` : `${agentLabel(cheap!.agent_id)} costs ${Math.round(Math.abs(costComparison))}% ${costComparison > 0 ? 'more' : 'less'} per correct answer than ${agentLabel(baseline!.agent_id)}.`}</h3></div><div className="home-finding-bottom"><span><span className="mono">{money(cheap?.cost_per_correct)}</span> against <span className="mono">{money(baseline?.cost_per_correct)}</span></span><strong>Compare<ArrowRight size={16} /></strong></div></Link></motion.div>
          <motion.div {...reveal} whileHover={reduced ? undefined : { y: -4 }}><Link className="home-finding" to={`/results?scope=full&a=${encodeURIComponent(trapResult?.agent_id ?? top.agent_id)}`}><div className="home-finding-line"><span className="home-finding-icon home-finding-danger"><TriangleAlert size={23} /></span><h3>{trapResult ? `${agentLabel(trapResult.agent_id)} resisted ${percent(trapResult.trap_resistance)} of the planted traps.` : 'Trap results appear when controlled failures have been measured.'}</h3></div><div className="home-finding-bottom"><span>{trapResult ? <><span className="mono">{percent(trapResult.trap_resistance)}</span> trap resistance, {trapResult.runs} total runs</> : 'No measured trap resistance yet.'}</span><strong>Compare<ArrowRight size={16} /></strong></div></Link></motion.div>
        </div>
      </div> : <p>No benchmark results yet. Start a benchmark to inspect the evidence.</p>}
    </section>
    <motion.section className="home-section" {...reveal}>
      <div className="home-section-heading"><h2>Leaderboard</h2><Link to="/leaderboard"><SlidersHorizontal size={17} />Rank by your priorities</Link></div>
      <div className="home-board-wrap"><table className="home-board"><thead><tr><th>Agent</th><th>Accuracy</th><th>Cost / correct</th><th>Trap resistance</th></tr></thead><tbody>{ranked.slice(0, 5).map((row, index) => <tr key={row.agent_id}><th scope="row"><Link to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}><span className={`home-rank mono ${index === 0 ? 'home-rank-first' : ''}`}>{index + 1}</span>{agentLabel(row.agent_id)}{agents.find(agent => agent.id === row.agent_id)?.kind === 'outside' && <span className="home-outside">outside</span>}</Link></th><td><div className="home-accuracy"><span className="home-bar-track"><motion.b initial={reduced ? false : { scaleX: 0 }} whileInView={{ scaleX: Math.max(0, Math.min(1, row.accuracy ?? 0)) }} viewport={{ once: true }} transition={{ type: 'spring', bounce: 0, duration: .7 }} style={{ background: index === 0 ? 'var(--primary)' : undefined }} /></span><Link className="mono" to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}>{percent(row.accuracy)}</Link></div></td><td className="mono"><Link to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}>{money(row.cost_per_correct)}</Link></td><td className="mono"><Link to={`/results?scope=full&a=${encodeURIComponent(row.agent_id)}`}>{percent(row.trap_resistance)}</Link></td></tr>)}</tbody></table></div>
      <p className="home-cost-note">Cost is list-price equivalent. Free-tier billing may be $0. Failed runs without usage have $0 recorded cost.</p>
    </motion.section>
    <motion.section className="home-cta" {...reveal}><div><h2>See it for yourself.</h2><p>Pick two agents, add a trap, and watch them work. {apiMode ? 'It takes about three minutes.' : 'The demo runs locally in a few seconds.'}</p></div><Button asChild variant="outline"><Link to="/run"><Play size={17} />Start a benchmark</Link></Button></motion.section>
  </div>
}
