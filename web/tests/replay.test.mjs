import test from 'node:test'
import assert from 'node:assert/strict'
import { pickReplayRuns, recordedTraps, recordedBriefs } from '../src/lib/replay.ts'

let n = 0
const rec = o => ({ id: `r${n++}`, task_id: 't1', task_type: 'fact', trap: null, repeat: 1, status: 'done', started_at: '2026-11-01T00:00:00Z', ...o })

test('picks repeats 1-3 per agent in agent order', () => {
  const records = ['b', 'a'].flatMap(a => [3, 1, 2].map(repeat => rec({ agent_id: a, repeat })))
  const out = pickReplayRuns(records, ['a', 'b'], 't1', null)
  assert.deepEqual(out.map(r => [r.agent_id, r.repeat]), [['a', 1], ['a', 2], ['a', 3], ['b', 1], ['b', 2], ['b', 3]])
})

test('keeps the latest started_at per repeat and ignores running', () => {
  const records = [
    rec({ agent_id: 'a', repeat: 2, status: 'error', started_at: '2026-11-01T00:00:00Z' }),
    rec({ agent_id: 'a', repeat: 2, status: 'done', started_at: '2026-11-02T00:00:00Z', id: 'later' }),
    rec({ agent_id: 'a', repeat: 2, status: 'running', started_at: '2026-11-03T00:00:00Z' }),
  ]
  const out = pickReplayRuns(records, ['a'], 't1', null)
  assert.deepEqual(out.map(r => r.id), ['later'])
})

test('throws when an agent has no run for the trap', () => {
  const records = [rec({ agent_id: 'a', trap: 'fake_article' })]
  assert.throws(() => pickReplayRuns(records, ['a'], 't1', null), e => e.message.includes('on this task with this trap.'))
})

test('recordedTraps lists distinct traps for the task', () => {
  const records = [rec({}), rec({}), rec({ trap: 'fake_article' }), rec({ task_id: 't2', trap: 'search_outage' })]
  assert.deepEqual(new Set(recordedTraps(records, 't1')), new Set([null, 'fake_article']))
  assert.deepEqual(recordedTraps([rec({})], 't1'), [null])
})

test('recordedBriefs excludes traps, keeps lowest repeat, prefers done', () => {
  const b = o => rec({ agent_id: 'v', task_type: 'briefing', ...o })
  const records = [
    b({ task_id: 'b2', trap: 'fake_article' }),
    b({ task_id: 'b2', repeat: 2, id: 'b2r2' }),
    b({ task_id: 'b2', repeat: 1, id: 'b2r1' }),
    b({ task_id: 'b1', repeat: 1, status: 'error' }),
    b({ task_id: 'b1', repeat: 1, id: 'b1done' }),
    b({ task_id: 'b3', agent_id: 'other' }),
  ]
  assert.deepEqual(recordedBriefs(records, 'v').map(r => r.id), ['b1done', 'b2r1'])
})

test('recordedBriefs prefers a done run at a later repeat over an error at repeat 1', () => {
  const b = o => rec({ agent_id: 'v', task_type: 'briefing', task_id: 'b1', ...o })
  const records = [b({ repeat: 1, status: 'error' }), b({ repeat: 2, id: 'done2' })]
  assert.deepEqual(recordedBriefs(records, 'v').map(r => r.id), ['done2'])
})
