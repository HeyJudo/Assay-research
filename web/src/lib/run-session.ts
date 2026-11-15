import type { RunDoneEvent, RunRecord, RunStartedEvent, Step } from '../types'

export type RunCell = RunStartedEvent & { steps: Step[]; done?: RunDoneEvent }
export type SetupDraft = { selected: string[]; task: string; trap: string; step: number }
export type RunSession = {
  batch: string
  agents: string[]
  task: string
  trap: string
  startedAt: number
  stage: 'running' | 'done' | 'error'
  cells: Record<string, RunCell>
  activeCell: string
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): Store | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage } catch { return undefined }
}

export function readStored<T>(key: string, storage = browserStorage()): T | null {
  try { return JSON.parse(storage?.getItem(key) ?? 'null') as T | null } catch { return null }
}

export function writeStored(key: string, value: unknown, storage = browserStorage()) {
  try { storage?.setItem(key, JSON.stringify(value)) } catch { /* Keep the active session usable when storage is unavailable. */ }
}

export function loadDraft(mode: string, storage = browserStorage()): SetupDraft | null {
  const value = readStored<SetupDraft>(`assay:setup:${mode}`, storage)
  return value && Array.isArray(value.selected) && value.selected.every(id => typeof id === 'string') &&
    typeof value.task === 'string' && typeof value.trap === 'string' && [1, 2, 3].includes(value.step) ? value : null
}

export function saveDraft(mode: string, draft: SetupDraft, storage = browserStorage()) {
  const { task, trap, step } = draft
  writeStored(`assay:setup:${mode}`, { selected: [...new Set(draft.selected)].slice(0, 3), task, trap, step }, storage)
}

export function latestBatchId(mode: string, storage = browserStorage()): string {
  const value = readStored<string>(`assay:latest:${mode}`, storage)
  return typeof value === 'string' ? value : ''
}

export function loadSession(mode: string, batch: string, storage = browserStorage()): RunSession | null {
  const value = readStored<RunSession>(`assay:batch:${mode}:${batch}`, storage)
  return value && value.batch === batch && Array.isArray(value.agents) && value.agents.every(id => typeof id === 'string') &&
    typeof value.task === 'string' && typeof value.trap === 'string' && typeof value.startedAt === 'number' &&
    ['running', 'done', 'error'].includes(value.stage) && value.cells && typeof value.cells === 'object' &&
    Object.values(value.cells).every(cell => cell && typeof cell.run_id === 'string' && Array.isArray(cell.steps)) &&
    typeof value.activeCell === 'string' ? value : null
}

export function saveSession(mode: string, session: RunSession, storage = browserStorage()) {
  const { batch, agents, task, trap, startedAt, stage, cells, activeCell } = session
  writeStored(`assay:batch:${mode}:${batch}`, { batch, agents, task, trap, startedAt, stage, cells, activeCell }, storage)
  writeStored(`assay:latest:${mode}`, batch, storage)
}

export function resetDraft(mode: string, storage = browserStorage()) {
  try { storage?.removeItem(`assay:setup:${mode}`); storage?.removeItem(`assay:latest:${mode}`) } catch { /* Storage may be blocked. */ }
}

/** Snapshot recovery preserves streamed steps and every terminal outcome. */
export function recoverCells(records: RunRecord[], previous: Record<string, RunCell> = {}): Record<string, RunCell> {
  const cells = { ...previous }
  for (const record of records) {
    const steps = new Map((record.steps ?? []).map(step => [step.i, step]))
    for (const step of previous[record.id]?.steps ?? []) steps.set(step.i, step)
    cells[record.id] = {
      run_id: record.id, batch_id: record.batch_id, agent_id: record.agent_id,
      repeat: record.repeat, started_at: record.started_at,
      steps: [...steps.values()].sort((a, b) => a.i - b.i),
      ...(record.status === 'running' ? previous[record.id]?.done ? { done: previous[record.id].done } : {} : { done: {
        run_id: record.id, status: record.status, duration_s: record.duration_s ?? 0, metrics: record.metrics,
      } }),
    }
  }
  return cells
}
