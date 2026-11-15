// Asserts every number the video states matches the API (PRD §9: measured numbers only).
import fs from 'node:fs'
const { facts: F } = JSON.parse(fs.readFileSync(new URL('../src/script-data.json', import.meta.url)))
const API = process.env.API ?? 'http://localhost:8000'
const get = async p => { const r = await fetch(API + '/api' + p); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json() }
const pct = x => Math.round(x * 100), usd = x => x.toFixed(4)
const bad = []
const eq = (label, got, want) => { if (got !== want) bad.push(`${label}: API ${got}, script ${want}`) }

const rows = Object.fromEntries((await get('/leaderboard')).map(r => [r.agent_id, r]))
const b = rows['briefing-baseline'], c = rows['briefing-cheap-first'], e = rows['briefing-evidence-gated'], g = rows['gpt-researcher']
eq('baseline accuracy', pct(b.accuracy), pct(F.baseline.accuracy))
eq('baseline cost/correct', usd(b.cost_per_correct), usd(F.baseline.costPerCorrect))
eq('cheap-first cost/correct', usd(c.cost_per_correct), usd(F.cheapFirst.costPerCorrect))
eq('cheap-first % more', Math.round((c.cost_per_correct / b.cost_per_correct - 1) * 100), 16)
eq('evidence-gated accuracy', pct(e.accuracy), pct(F.evidenceGated.accuracy))
if (!(e.accuracy < b.accuracy)) bad.push('evidence-gated is not lower than baseline')
eq('gpt-researcher accuracy', pct(g.accuracy), pct(F.gptResearcher.accuracy))
eq('gpt-researcher trap resistance', pct(g.trap_resistance), pct(F.gptResearcher.trapResistance))

const run = await get('/runs/' + F.receiptRunId)
eq('receipt agent', run.agent_id, 'briefing-cheap-first')
eq('receipt batch', run.batch_id, F.batchId)
eq('receipt cost', usd(run.metrics.cost_usd), usd(F.receiptCostUsd))
const sw = run.steps.find(s => s.kind === 'model_switch' || /switch/i.test(s.kind))
eq('receipt switch time', sw ? sw.t.toFixed(1) : 'none', F.receiptSwitchSeconds.toFixed(1))
eq('receipt trapped', run.metrics.trap_fell, true)

if (bad.length) { console.error('facts MISMATCH\n' + bad.join('\n')); process.exit(1) }
console.log('facts ok')
