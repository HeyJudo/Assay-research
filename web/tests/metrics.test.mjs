import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, rankRows, percent, money } from '../src/lib/metrics.ts'

const row = (agent_id, accuracy, cost_per_correct) => ({ agent_id, accuracy, cost_per_correct, trap_resistance: .5, honesty: .5, pass3: .5, avg_steps: 5, avg_tokens: 10, avg_duration_s: 1, runs: 3 })
test('priorities re-rank real tradeoffs and zero priorities tie', () => {
  const rows = [row('accurate', .95, .1), row('cheap', .5, .01)]
  assert.equal(rankRows(rows, { accuracy: 100, cost: 0, trap: 0, honesty: 0 })[0].agent_id, 'accurate')
  assert.equal(rankRows(rows, { accuracy: 0, cost: 100, trap: 0, honesty: 0 })[0].agent_id, 'cheap')
  assert.ok(rankRows(rows, { accuracy: 0, cost: 0, trap: 0, honesty: 0 }).every(r => r.score === 0))
})
const run = (repeat, success, extras = {}) => ({ agent_id: 'a', task_id: 'task', task_type: 'briefing', trap: null, status: 'done', repeat, duration_s: 10, output: { abstained: false }, metrics: { success, cost_usd: .01, steps: 2, tokens: 20, trap_fell: false, abstention: null }, ...extras })
test('three-repeat reliability requires every repeat to pass', () => {
  const result = aggregate([run(1, true), run(2, true), run(3, false)], 'a')
  assert.equal(result.pass3, 0)
  assert.equal(result.accuracy, 2 / 3)
  assert.equal(result.cost_per_correct, .03 / 2)
  assert.ok(Number.isNaN(result.trap_resistance))
})
test('no successes and absent task classes are unavailable, not free or perfect', () => {
  const result = aggregate([run(1, false, { trap: 'fake_article' })], 'a')
  assert.ok(Number.isNaN(result.cost_per_correct))
  assert.ok(Number.isNaN(result.accuracy))
  assert.ok(Number.isNaN(result.honesty))
  assert.equal(money(result.cost_per_correct), '—')
  assert.equal(percent(result.accuracy), '—')
  assert.equal(aggregate([], 'a'), null)
})
