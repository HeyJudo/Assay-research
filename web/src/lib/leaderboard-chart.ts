import type { LeaderboardRow } from '@/types'

type ChartMetrics = Pick<LeaderboardRow, 'accuracy' | 'accuracy_low' | 'accuracy_high' | 'cost_per_correct'>
export function chartPoint(row: ChartMetrics): { cost: number; accuracy: number; spread?: [number, number] } | null {
  const { accuracy, accuracy_low: low, accuracy_high: high, cost_per_correct: cost } = row
  if (accuracy == null || cost == null || !Number.isFinite(accuracy) || !Number.isFinite(cost) || cost < 0) return null
  const spread: [number, number] | undefined = low != null && high != null && Number.isFinite(low) && Number.isFinite(high) && low <= accuracy && high >= accuracy
    ? [(accuracy - low) * 100, (high - accuracy) * 100] : undefined
  return { cost, accuracy: accuracy * 100, spread }
}

/** X axis: log scale spreads costs that differ by 5x. Falls back to linear when a cost is 0 (log undefined). */
export function costAxis(costs: number[]): { scale: 'log' | 'linear'; domain: [number, number]; ticks?: number[] } {
  const max = Math.max(...costs, 0)
  if (!costs.length || costs.some(c => c <= 0)) return { scale: 'linear', domain: [0, max * 1.1 || 1] }
  const domain: [number, number] = [Math.min(...costs) * .8, max * 1.25]
  const ticks = [.001, .002, .005, .01, .02, .05, .1, .2, .5, 1].filter(t => t >= domain[0] && t <= domain[1])
  return { scale: 'log', domain, ticks: ticks.length >= 2 ? ticks : undefined }
}

/** Y axis top: 10% above the highest observed value so points use the plot height. */
export const accuracyTop = (values: number[]) => Math.min(100, Math.ceil((Math.max(...values, 0) + 10) / 10) * 10)
