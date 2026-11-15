import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Box, ChevronRight, FileText, ListChecks, PenLine, Route, Search, SearchCheck, Shuffle } from 'lucide-react'
import { agentLabel, money, percent } from '@/lib/metrics'
import type { Agent, LeaderboardRow } from '@/types'

type Node = { icon: typeof Search; label: string; note?: string; changed?: boolean }
// PRD §4.1: each version changes one thing vs Baseline. Copy only, numbers come from the leaderboard rows.
const versions: Record<string, { change: string; question: string; nodes: Node[] }> = {
  'briefing-baseline': { change: 'Reference', question: 'The reference point the other versions are measured against.', nodes: [
    { icon: Search, label: 'Search', note: 'main model' }, { icon: FileText, label: 'Read pages' }, { icon: PenLine, label: 'Write the brief' }] },
  'briefing-cheap-first': { change: 'Model switch', question: 'Does starting cheap save money without losing accuracy or trap resistance?', nodes: [
    { icon: Search, label: 'Search', note: 'small model', changed: true }, { icon: FileText, label: 'Read pages' }, { icon: PenLine, label: 'Write the brief' },
    { icon: Shuffle, label: 'Switch to main model', note: 'when a fixed rule fires, once', changed: true }] },
  'briefing-evidence-gated': { change: 'Claim check', question: 'Does checking each claim against its source make the brief more honest?', nodes: [
    { icon: Search, label: 'Search', note: 'main model' }, { icon: FileText, label: 'Read pages' }, { icon: PenLine, label: 'Write the brief' },
    { icon: ListChecks, label: 'Check each claim', note: 'against its cited passage', changed: true },
    { icon: SearchCheck, label: 'Search again or demote', note: 'to Not found or Uncertain', changed: true }] },
  'gpt-researcher': { change: 'Unchanged', question: 'How does a popular open-source agent do on the same frozen web?', nodes: [
    { icon: Box, label: 'Its own planner, search and writer', note: 'run unchanged through a wrapper' }] },
}

export function HomeAgents({ agents, rows }: { agents: Agent[]; rows: LeaderboardRow[] }) {
  const reduced = useReducedMotion()
  const list = agents.filter(agent => versions[agent.id])
  const [active, setActive] = useState(list[0]?.id ?? '')
  const agent = list.find(item => item.id === active)
  if (!agent) return null
  const version = versions[agent.id]
  const row = rows.find(item => item.agent_id === agent.id)
  function move(event: KeyboardEvent, index: number) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = list[(index + step + list.length) % list.length]
    setActive(next.id)
    document.getElementById(`home-agent-tab-${next.id}`)?.focus()
  }
  return <div className="home-agents">
    <div className="home-agent-tabs" role="tablist" aria-label="Agents" aria-orientation="vertical">{list.map((item, index) => {
      const selected = item.id === active
      return <button key={item.id} id={`home-agent-tab-${item.id}`} type="button" role="tab" aria-selected={selected} aria-controls="home-agent-panel" tabIndex={selected ? 0 : -1} className={`home-agent-tab${selected ? ' active' : ''}`} onClick={() => setActive(item.id)} onKeyDown={event => move(event, index)}>
        {selected && <motion.span layoutId="home-agent-pill" className="home-agent-pill" transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0, duration: .4 }} />}
        <span className="home-agent-tab-name">{agentLabel(item.id)}{item.kind === 'outside' && <small>outside</small>}</span>
        <span className="home-agent-tab-change">{versions[item.id].change}</span>
      </button>
    })}</div>
    <div id="home-agent-panel" role="tabpanel" aria-labelledby={`home-agent-tab-${agent.id}`} className="home-agent-panel">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={agent.id} initial={{ opacity: 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -8 }} transition={{ type: 'spring', bounce: 0, duration: reduced ? 0 : .35 }}>
          <h3>{agentLabel(agent.id)}</h3>
          <p className="home-agent-description">{agent.description}</p>
          <ol className="home-agent-pipeline" aria-label={`How ${agentLabel(agent.id)} works`}>{version.nodes.map(({ icon: Icon, label, note, changed }, index) => <motion.li key={label} className={changed ? 'changed' : ''} initial={reduced ? false : { opacity: 0, scale: .85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', bounce: 0, duration: .4, delay: reduced ? 0 : .06 * index }}>
            {index > 0 && <ChevronRight className="home-agent-arrow" size={16} aria-hidden="true" />}
            <span className="home-agent-node"><Icon size={18} aria-hidden="true" /><span><strong>{label}</strong>{note && <small>{note}</small>}</span></span>
          </motion.li>)}</ol>
          <p className="home-agent-question">{version.question}</p>
          <div className="home-agent-foot">
            {row ? <dl className="home-agent-stats"><div><dt>Accuracy</dt><dd className="mono">{percent(row.accuracy)}</dd></div><div><dt>Cost / correct</dt><dd className="mono">{money(row.cost_per_correct)}</dd></div><div><dt>Trap resistance</dt><dd className="mono">{percent(row.trap_resistance)}</dd></div></dl> : <span className="home-agent-question">No benchmark results yet.</span>}
            <Link to={`/results?scope=full&a=${encodeURIComponent(agent.id)}`} className="home-agent-link">Compare<ArrowRight size={16} /></Link>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  </div>
}

const sponsors = [
  { name: 'Tavily', role: 'Search', icon: Search, text: 'Built each task’s frozen pages once, with search and extract. The Briefing Agent uses it live.' },
  { name: 'Bifrost', role: 'AI gateway', icon: Route, text: 'Every agent model call and the claim judge go through it, on a budget-capped key per run. Step costs come from its logs.' },
]

export function BuiltOn() {
  const reduced = useReducedMotion()
  return <ul className="home-built" aria-label="Built on">{sponsors.map(({ name, role, icon: Icon, text }, index) => <motion.li key={name} initial={reduced ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .4 }} transition={{ type: 'spring', bounce: 0, duration: .6, delay: reduced ? 0 : index * .08 }}>
    <span className="home-built-icon"><Icon size={20} aria-hidden="true" /></span>
    <div><p className="home-built-name">{name}<small>{role}</small></p><p>{text}</p></div>
  </motion.li>)}</ul>
}
