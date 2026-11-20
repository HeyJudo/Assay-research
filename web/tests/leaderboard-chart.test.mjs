import test from 'node:test'
import assert from 'node:assert/strict'
import { chartPoint } from '../src/lib/leaderboard-chart.ts'

const row = { agent_id: 'a', accuracy: .74, accuracy_low: .69, accuracy_high: .81, cost_per_correct: .0038 }
test('chart spread uses observed repeat bounds rather than invented variance', () => {
  const point = chartPoint(row)
  assert.equal(point.accuracy, 74)
  assert.equal(point.cost, .0038)
  assert.ok(Math.abs(point.spread[0] - 5) < 1e-10)
  assert.ok(Math.abs(point.spread[1] - 7) < 1e-10)
})
test('unknown pairs stay unavailable while valid zero values remain plotted', () => {
  assert.equal(chartPoint({ ...row, accuracy: null }), null)
  assert.equal(chartPoint({ ...row, cost_per_correct: NaN }), null)
  assert.equal(chartPoint({ ...row, cost_per_correct: -1 }), null)
  assert.equal(chartPoint({ ...row, cost_per_correct: 0, accuracy: 0, accuracy_low: 0, accuracy_high: 0 }).cost, 0)
})
test('missing or inconsistent bounds do not manufacture spread bars', () => {
  assert.equal(chartPoint({ ...row, accuracy_low: null }).spread, undefined)
  assert.equal(chartPoint({ ...row, accuracy_low: .8 }).spread, undefined)
})
import { costAxis, accuracyTop } from '../src/lib/leaderboard-chart.ts'
test('cost axis is log for positive costs and linear when a cost is zero', () => {
  const log = costAxis([.005, .006, .025])
  assert.equal(log.scale, 'log')
  assert.ok(log.domain[0] < .005 && log.domain[1] > .025)
  assert.deepEqual(log.ticks, [.005, .01, .02])
  assert.equal(costAxis([0, .01]).scale, 'linear')
  assert.equal(costAxis([]).scale, 'linear')
})
test('accuracy axis top leaves headroom and caps at 100', () => {
  assert.equal(accuracyTop([17, 50]), 60)
  assert.equal(accuracyTop([95]), 100)
})
