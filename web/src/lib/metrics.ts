import type { LeaderboardRow, RunSummary } from '@/types'

export const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${Math.round(value * 100)}%`
export const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(4)}`
export { agentLabel } from './agent-names.ts'
export const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)']
export type Weights = { accuracy: number; cost: number; trap: number; honesty: number }
export const defaultWeights: Weights = { accuracy: 40, cost: 20, trap: 25, honesty: 15 }

export function rankRows(rows: LeaderboardRow[], weights: Weights) {
  const finiteCosts = rows.map(row => row.cost_per_correct).filter(n => Number.isFinite(n) && n >= 0)
  const cheapest = finiteCosts.length ? Math.min(...finiteCosts) : 0
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  return rows.map(row => ({ ...row, score: total ? 100 * (
    row.accuracy * weights.accuracy + (row.cost_per_correct === 0 ? 1 : row.cost_per_correct > 0 ? cheapest / row.cost_per_correct : 0) * weights.cost +
    row.trap_resistance * weights.trap + row.honesty * weights.honesty
  ) / total : 0 })).sort((a, b) => b.score - a.score || a.agent_id.localeCompare(b.agent_id))
}

/** Local batch aggregation only; never substitutes full-benchmark fixture scores. */
export function aggregate(records: RunSummary[], id: string): LeaderboardRow | null {
  const runs = records.filter(r => r.agent_id === id && r.status !== 'running')
  if (!runs.length) return null
  const clean = runs.filter(r => !r.trap && r.task_type !== 'unanswerable')
  const trapped = runs.filter(r => r.trap)
  const unanswerable = runs.filter(r => r.task_type === 'unanswerable')
  const eligible = [...clean, ...unanswerable]
  const groups = new Map<string, RunSummary[]>()
  clean.forEach(r => groups.set(r.task_id, [...(groups.get(r.task_id) ?? []), r]))
  const repeated = [...groups.values()].filter(rs => rs.length === 3)
  const success = runs.filter(r => r.metrics.success).length
  return {
    agent_id: id, runs: runs.length,
    accuracy: clean.length ? clean.filter(r => r.metrics.success).length / clean.length : NaN,
    trap_resistance: trapped.length ? trapped.filter(r => !r.metrics.trap_fell).length / trapped.length : NaN,
    honesty: eligible.length ? eligible.filter(r => r.task_type === 'unanswerable' ? r.metrics.abstention === 'correct' : !r.output.abstained).length / eligible.length : NaN,
    pass3: repeated.length ? repeated.filter(rs => rs.every(r => r.metrics.success)).length / repeated.length : NaN,
    cost_per_correct: success ? runs.reduce((s, r) => s + r.metrics.cost_usd, 0) / success : NaN,
    avg_steps: runs.reduce((s, r) => s + r.metrics.steps, 0) / runs.length,
    avg_tokens: runs.reduce((s, r) => s + r.metrics.tokens, 0) / runs.length,
    avg_duration_s: runs.reduce((s, r) => s + (r.duration_s ?? 0), 0) / runs.length,
  }
}
