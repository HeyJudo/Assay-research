import type { LeaderboardRow } from '../types'

export const hasNumber = (value: number | null | undefined): value is number => value != null && Number.isFinite(value)

export function metricComparison(a: number | null | undefined, b: number | null | undefined, kind: 'percent' | 'cost') {
  if (!hasNumber(a) || !hasNumber(b)) return 'Not comparable'
  if (Math.abs(a - b) < .000001) return 'Tie'
  if (kind === 'cost') return `${Math.round((1 - Math.min(a, b) / Math.max(a, b)) * 100)}% cheaper`
  return `${Math.round(Math.abs(a - b) * 100)} points higher`
}

type Verdict = { title: string; description: string; value: number | null; label: string }

/** Observed repeat ranges describe spread, not statistical significance. */
export function resultVerdict(a: LeaderboardRow | null | undefined, b: LeaderboardRow | null | undefined, aName: string, bName: string): Verdict {
  if (!a && !b) return { title: 'No completed results in this scope.', description: 'Choose another scope or wait for the runs to finish.', value: null, label: 'awaiting results' }
  if (!a || !b) {
    const row = a ?? b!
    return { title: `${a ? aName : bName}, measured across repeats.`, description: 'This view has results for one agent. Open the receipts to inspect every outcome.', value: hasNumber(row.accuracy) ? row.accuracy * 100 : null, label: 'clean-task accuracy' }
  }
  const comparableAccuracy = hasNumber(a.accuracy) && hasNumber(b.accuracy)
  const sameAccuracy = comparableAccuracy && Math.abs(a.accuracy! - b.accuracy!) < .000001
  const ranges = [a.accuracy_low, a.accuracy_high, b.accuracy_low, b.accuracy_high]
  const overlap = comparableAccuracy && ranges.every(hasNumber) && Math.max(a.accuracy_low!, b.accuracy_low!) <= Math.min(a.accuracy_high!, b.accuracy_high!)
  const comparableCost = hasNumber(a.cost_per_correct) && hasNumber(b.cost_per_correct)
  const differentCost = comparableCost && Math.abs(a.cost_per_correct! - b.cost_per_correct!) > .000001
  if ((sameAccuracy || overlap) && differentCost) {
    const lowerA = a.cost_per_correct! < b.cost_per_correct!
    return { title: `${lowerA ? aName : bName} wins on cost.`, description: sameAccuracy ? 'Equal accuracy in this scope, at a lower price per correct answer.' : 'The observed accuracy ranges overlap, with a lower price per correct answer. Overlap does not establish equal accuracy.', value: (1 - Math.min(a.cost_per_correct!, b.cost_per_correct!) / Math.max(a.cost_per_correct!, b.cost_per_correct!)) * 100, label: 'cheaper per correct answer' }
  }
  if (comparableAccuracy && !sameAccuracy) {
    return { title: `${a.accuracy! > b.accuracy! ? aName : bName} leads on accuracy.`, description: overlap ? 'Its average is higher, but the observed ranges overlap. Check cost, reliability and individual receipts before choosing.' : ranges.every(hasNumber) ? 'The observed accuracy ranges do not overlap. Cost and honesty may favor a different agent.' : 'Its average is higher in this scope. A complete observed accuracy range is not available for both agents.', value: Math.abs(a.accuracy! - b.accuracy!) * 100, label: 'percentage points higher' }
  }
  if (sameAccuracy) return { title: 'Equal accuracy in this scope.', description: 'Compare the other metrics and open the receipts to see how each agent reached its answer.', value: a.accuracy! * 100, label: 'clean-task accuracy' }
  for (const [metric, label] of [['trap_resistance', 'trap resistance'], ['honesty', 'honesty']] as const) {
    const av = a[metric], bv = b[metric]
    if (hasNumber(av) && hasNumber(bv) && av !== bv) return { title: `${av > bv ? aName : bName} leads on ${label}.`, description: 'This scope has no comparable clean-task accuracy result. This verdict uses the available metric only.', value: Math.abs(av - bv) * 100, label: 'percentage points higher' }
  }
  if (differentCost) {
    const lowerA = a.cost_per_correct! < b.cost_per_correct!
    return { title: `${lowerA ? aName : bName} wins on cost.`, description: 'This scope has no comparable clean-task accuracy result. This verdict uses price per correct answer only.', value: (1 - Math.min(a.cost_per_correct!, b.cost_per_correct!) / Math.max(a.cost_per_correct!, b.cost_per_correct!)) * 100, label: 'cheaper per correct answer' }
  }
  return { title: 'No comparable accuracy result.', description: 'This scope lacks clean, answerable outcomes for both agents. Missing metrics are unavailable, never zero.', value: null, label: 'inspect the receipts' }
}
