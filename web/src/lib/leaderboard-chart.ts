import type { LeaderboardRow } from '@/types'

type ChartMetrics = Pick<LeaderboardRow, 'accuracy' | 'accuracy_low' | 'accuracy_high' | 'cost_per_correct'>
export function chartPoint(row: ChartMetrics): { cost: number; accuracy: number; spread?: [number, number] } | null {
  const { accuracy, accuracy_low: low, accuracy_high: high, cost_per_correct: cost } = row
  if (accuracy == null || cost == null || !Number.isFinite(accuracy) || !Number.isFinite(cost) || cost < 0) return null
  const spread: [number, number] | undefined = low != null && high != null && Number.isFinite(low) && Number.isFinite(high) && low <= accuracy && high >= accuracy
    ? [(accuracy - low) * 100, (high - accuracy) * 100] : undefined
  return { cost, accuracy: accuracy * 100, spread }
}
