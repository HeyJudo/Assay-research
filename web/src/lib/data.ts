import { connectBatchStream } from './batch-stream'
import { registerAgents, agentLabel } from './agent-names'
import { agents, leaderboard, runs, tasks } from '@/fixtures'
import type { Agent, BatchEvent, BatchRequest, LeaderboardRow, RunRecord, RunSummary, Task } from '@/types'

/** Explicit opt-in. API failures never silently turn into fixture results. */
export const apiMode = import.meta.env.VITE_DATA_MODE === 'api'
export const sampleData = !apiMode || import.meta.env.VITE_RESULTS_ARE_FIXTURES !== 'false'
registerAgents(agents)
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const savedRuns = new Map<string, RunRecord>()
const simulatedBatches = new Map<string, RunRecord[]>()

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api${path}`, { ...options, headers: { ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers } })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { const payload = await response.json(); message = typeof payload.detail === 'string' ? payload.detail : message } catch { /* retain HTTP status */ }
    throw new Error(message)
  }
  return response.json()
}

export const data = {
  agents: async () => { const list = apiMode ? await request<Agent[]>('/agents') : agents; registerAgents(list); return list },
  tasks: () => apiMode ? request<Task[]>('/tasks') : Promise.resolve(tasks),
  leaderboard: () => apiMode ? request<LeaderboardRow[]>('/leaderboard') : Promise.resolve(leaderboard),
  runs: async (batch?: string): Promise<RunSummary[]> => apiMode ? request(`/runs${batch ? `?batch_id=${encodeURIComponent(batch)}` : ''}`) : [...savedRuns.values(), ...runs].filter(r => !batch || r.batch_id === batch),
  run: async (id: string): Promise<RunRecord> => {
    if (apiMode) return request(`/runs/${encodeURIComponent(id)}`)
    const run = savedRuns.get(id) ?? runs.find(r => r.id === id)
    if (!run) throw new Error('Run not found. Simulated runs are kept in memory only; start a new demo after refreshing.')
    return run
  },
  batch: async (config: BatchRequest) => {
    if (apiMode) return request<{ batch_id: string }>('/batches', { method: 'POST', body: JSON.stringify(config) })
    const batch_id = `demo_${Date.now()}`
    const task = tasks.find(t => t.id === config.task_id)!
    const records = config.agents.flatMap((agent, index) => [1, 2, 3].map(repeat => {
      const template = structuredClone(runs[0])
      const passed = repeat !== 2
      const synthetic = `${agentLabel(agent)} · ${task.prompt}`
      const cheap = agent === 'briefing-cheap-first'
      const totalCost = .001 + index * .0009 + repeat * .0001
      const demoSteps = template.steps.slice(0, cheap ? 11 : 7).map((step, i) => ({
        ...step,
        detail: step.kind === 'search' ? `Simulated search: ${task.prompt}` : `Sample ${step.kind} event (${step.phase})`,
        model: step.model ? cheap && i < 7 ? 'sample-small-model' : 'sample-main-model' : null,
        cost_usd: 0,
      }))
      const modelSteps = demoSteps.filter(step => step.kind === 'llm')
      modelSteps.forEach(step => { step.cost_usd = totalCost / modelSteps.length })
      const modelCosts = demoSteps.reduce<Record<string, number>>((costs, step) => {
        if (step.model) costs[step.model] = (costs[step.model] ?? 0) + step.cost_usd
        return costs
      }, {})
      return {
        ...template, id: `${batch_id}_${index}_${repeat}`, batch_id, agent_id: agent, task_id: task.id,
        task_type: task.type, trap: config.trap, repeat, status: 'done' as const, started_at: new Date().toISOString(),
        duration_s: Math.max(...demoSteps.map(step => step.t)) + 2 + repeat,
        config: { ...template.config, models: cheap ? ['sample-small-model', 'sample-main-model'] : ['sample-main-model'], prompt_hash: 'demo', pool_version: 'simulation', trap_seed: config.trap ? 7 : null },
        output: { text: `# Simulated research output\n\n## Verified\nNo live research was performed. This run demonstrates the interface only.\n\n## Uncertain\n${synthetic}\n\n## Not found\nLive findings are not available in this simulation.\n\n## Open questions\nWhat would the real research agent find?`, abstained: task.type === 'unanswerable' },
        claims: [],
        steps: demoSteps,
        metrics: { ...template.metrics, success: passed, steps: demoSteps.length,
          tokens: demoSteps.reduce((sum, step) => sum + step.tokens, 0), tool_calls: demoSteps.filter(step => step.kind === 'search' || step.kind === 'read').length,
          cost_usd: totalCost, cost_by_model: modelCosts,
          switched: agent === 'briefing-cheap-first', trap_fell: !!config.trap && !passed,
          abstention: task.type === 'unanswerable' ? 'correct' as const : null, claims_supported_pct: null },
      } satisfies RunRecord
    }))
    records.forEach(r => savedRuns.set(r.id, r))
    simulatedBatches.set(batch_id, records)
    return { batch_id }
  },
  subscribe: (id: string, receive: (event: BatchEvent) => void, fail: (message: string) => void): (() => void) => {
    if (apiMode) {
      return connectBatchStream(`${base}/api/batches/${encodeURIComponent(id)}/stream`, receive, fail)
    }
    const records = simulatedBatches.get(id) ?? []
    const events: BatchEvent[] = records.map(r => ({ event: 'run_started', data: { run_id: r.id, batch_id: id, agent_id: r.agent_id, repeat: r.repeat, started_at: r.started_at } }))
    for (let i = 0; i < 3; i++) records.forEach(r => { const step = r.steps[i]; if (step) events.push({ event: 'step', data: { run_id: r.id, step } }) })
    records.forEach(r => events.push({ event: 'run_done', data: { run_id: r.id, status: 'done', duration_s: r.duration_s!, metrics: r.metrics } }))
    events.push({ event: 'batch_done', data: { batch_id: id } })
    let index = 0
    const timer = window.setInterval(() => { if (index < events.length) receive(events[index++]); if (index >= events.length) window.clearInterval(timer) }, 160)
    return () => window.clearInterval(timer)
  },
  brief: async (subject: string, meeting_time: string, version: string): Promise<{ run_id: string }> => {
    if (apiMode) return request('/brief', { method: 'POST', body: JSON.stringify({ subject, meeting_time, version }) })
    await new Promise(resolve => setTimeout(resolve, 800))
    const record = structuredClone(runs[0])
    record.id = `demo_brief_${Date.now()}`
    record.agent_id = version
    record.batch_id = 'demo_briefing'
    record.task_id = `sample-brief-${subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`
    record.started_at = new Date().toISOString()
    record.duration_s = .8
    record.config = { agent_version: 'demo', models: [], prompt_hash: 'demo', pool_version: 'no-live-research', trap_seed: null, fallback_used: false }
    record.output.text = `# Meeting brief: ${subject}\n\n## Verified\nThis is a sample briefing layout. No live facts about ${subject} have been researched.\n\n## Uncertain\nRecent product and partnership developments require verification.\n\n## Not found\nNo live sources were retrieved in demo mode.\n\n## Open questions\nWhich priorities should we discuss at the meeting on ${meeting_time.replace('T', ' ')}?`
    record.claims = []
    record.steps = []
    record.metrics = { success: false, steps: 0, tool_calls: 0, tokens: 0, cost_usd: 0, cost_by_model: {}, switched: false, trap_fell: false, abstention: null, claims_supported_pct: null }
    savedRuns.set(record.id, record)
    return { run_id: record.id }
  },
}
