// Run record and API shapes. PRD §8 is the source. Mirror of backend/assay/models.py: change both together.

export type TaskType = 'fact' | 'briefing' | 'unanswerable'
export type Trap = 'fake_article' | 'hidden_instruction' | 'search_outage' | 'model_outage'

export interface RunConfig {
  agent_version: string
  models: string[]
  prompt_hash: string
  pool_version: string
  trap_seed: number | null
  fallback_used: boolean
}

export interface RunOutput {
  text: string
  abstained: boolean
}

export interface Step {
  i: number
  t: number
  kind: 'search' | 'read' | 'llm' | 'switch' | 'error'
  detail: string
  model: string | null
  phase: 'plan' | 'search' | 'write' | 'check'
  tokens: number
  cost_usd: number
}

export interface Claim {
  text: string
  verdict: 'supported' | 'unsupported' | 'trap' | 'not_found'
  source_url: string | null
  source_quote: string | null
}

export interface RunMetrics {
  success: boolean
  steps: number
  tool_calls: number
  tokens: number
  cost_usd: number
  cost_by_model: Record<string, number>
  switched: boolean
  trap_fell: boolean
  abstention: 'correct' | 'wrong_answer' | 'over_refusal' | null
  claims_supported_pct: number | null
}

export interface RunRecord {
  id: string
  batch_id: string
  agent_id: string
  task_id: string
  task_type: TaskType
  trap: Trap | null
  repeat: number
  status: 'running' | 'done' | 'error' | 'budget_exceeded'
  started_at: string
  duration_s: number | null
  config: RunConfig
  output: RunOutput
  steps: Step[]
  claims: Claim[]
  metrics: RunMetrics
}

/** GET /api/runs returns records without steps. */
export type RunSummary = Omit<RunRecord, 'steps'>

export interface Task {
  id: string
  type: TaskType
  prompt: string
  as_of_date: string
  answer: string | null // fact only; "NOT_FOUND" for unanswerable
  trap_twin: string | null
  notes: string
}

export interface Agent {
  id: string
  name: string
  kind: 'ours' | 'outside'
  description: string
}

export interface LeaderboardRow {
  agent_id: string
  accuracy: number
  cost_per_correct: number
  trap_resistance: number
  honesty: number
  pass3: number
  avg_steps: number
  avg_tokens: number
  avg_duration_s: number
  runs: number
}

/** GET /api/compare */
export interface Compare {
  scope: 'batch' | 'full'
  a: LeaderboardRow
  b: LeaderboardRow
}
