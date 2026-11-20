import type { RunRecord, Trap } from '../types'
import { agentLabel } from './agent-names.ts'

export function pickReplayRuns(records: RunRecord[], agents: string[], taskId: string, trap: Trap | null): RunRecord[] {
  return agents.flatMap(agent => {
    const latest = new Map<number, RunRecord>()
    for (const r of records) {
      if (r.agent_id !== agent || r.task_id !== taskId || r.trap !== trap || r.status === 'running' || r.repeat < 1 || r.repeat > 3) continue
      const prev = latest.get(r.repeat)
      if (!prev || r.started_at > prev.started_at) latest.set(r.repeat, r)
    }
    if (!latest.size) throw new Error(`No recorded run for ${agentLabel(agent)} on this task with this trap.`)
    return [...latest.values()].sort((a, b) => a.repeat - b.repeat)
  })
}

export function recordedTraps(records: RunRecord[], taskId: string): (Trap | null)[] {
  return [...new Set(records.filter(r => r.task_id === taskId).map(r => r.trap))]
}

export function recordedBriefs(records: RunRecord[], version: string): RunRecord[] {
  const best = new Map<string, RunRecord>()
  const rank = (r: RunRecord) => r.repeat * 2 + (r.status === 'done' ? 0 : 1)
  for (const r of records) {
    if (r.agent_id !== version || r.task_type !== 'briefing' || r.trap !== null) continue
    const prev = best.get(r.task_id)
    if (!prev || rank(r) < rank(prev)) best.set(r.task_id, r)
  }
  return [...best.values()].sort((a, b) => a.task_id.localeCompare(b.task_id))
}
