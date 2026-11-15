import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDraft, saveDraft, loadSession, saveSession, latestBatchId, resetDraft, recoverCells } from '../src/lib/run-session.ts'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values }
}

test('setup persistence strips passcodes and limits agent choices', () => {
  const storage = memoryStorage()
  saveDraft('demo', { selected: ['a', 'a', 'b', 'c', 'd'], task: 'task', trap: '', step: 2, passcode: 'secret' }, storage)
  assert.deepEqual(loadDraft('demo', storage), { selected: ['a', 'b', 'c'], task: 'task', trap: '', step: 2 })
  assert.equal([...storage.values.values()].some(value => value.includes('secret')), false)
})

test('a batch refresh restores its stage and a new benchmark preserves old receipts', () => {
  const storage = memoryStorage()
  const session = { batch: 'batch-1', agents: ['a'], task: 'task', trap: '', startedAt: 10, stage: 'running', cells: {}, activeCell: '' }
  saveSession('demo', session, storage)
  assert.equal(latestBatchId('demo', storage), 'batch-1')
  assert.deepEqual(loadSession('demo', 'batch-1', storage), session)
  assert.equal(latestBatchId('api', storage), '')
  resetDraft('demo', storage)
  assert.equal(latestBatchId('demo', storage), '')
  assert.deepEqual(loadSession('demo', 'batch-1', storage), session)
})

test('corrupt saved state falls back safely', () => {
  const storage = memoryStorage()
  for (const value of ['not-json', 'null', '{"selected":null}', '{"selected":[1]}']) {
    storage.setItem('assay:setup:demo', value)
    assert.equal(loadDraft('demo', storage), null)
  }
})

test('recovery includes failures and merges streamed steps without duplication', () => {
  const step = { i: 1, t: 1, kind: 'search', detail: 'query' }
  const records = [{ id: 'one', batch_id: 'b', agent_id: 'a', repeat: 1, started_at: '2026-11-15', status: 'error', duration_s: 2, metrics: { success: false }, steps: [step] }]
  const cells = recoverCells(records, { one: { run_id: 'one', steps: [step, { ...step, i: 2 }] } })
  assert.equal(cells.one.done.status, 'error')
  assert.equal(cells.one.done.metrics.success, false)
  assert.deepEqual(cells.one.steps.map(s => s.i), [1, 2])
  const staleSnapshot = recoverCells([{ ...records[0], status: 'running', steps: [] }], cells)
  assert.equal(staleSnapshot.one.done.status, 'error')
  assert.deepEqual(staleSnapshot.one.steps.map(s => s.i), [1, 2])
})
