import test from 'node:test'
import assert from 'node:assert/strict'
import { resultVerdict, metricComparison } from '../src/lib/result-verdict.ts'

const row = (overrides = {}) => ({ agent_id: 'a', accuracy: .7, accuracy_low: .6, accuracy_high: .8, cost_per_correct: .01, trap_resistance: .5, honesty: .6, pass3: .3, avg_steps: 5, avg_tokens: 100, avg_duration_s: 10, runs: 3, ...overrides })

test('overlapping observed accuracy ranges permit a cost verdict in either picker order', () => {
  const cheaper = row({ agent_id: 'b', accuracy: .72, cost_per_correct: .006 })
  assert.equal(resultVerdict(row(), cheaper, 'Baseline', 'Cheap-first').title, 'Cheap-first wins on cost.')
  assert.equal(resultVerdict(cheaper, row(), 'Cheap-first', 'Baseline').value, 40)
})

test('cheaper agent does not win the banner when its accuracy range is lower', () => {
  const cheaper = row({ accuracy: .4, accuracy_low: .3, accuracy_high: .5, cost_per_correct: .001 })
  const verdict = resultVerdict(row(), cheaper, 'Accurate', 'Cheap')
  assert.equal(verdict.title, 'Accurate leads on accuracy.')
  assert.ok(verdict.description.includes('do not overlap'))
})

test('unavailable metrics never become zero or a manufactured win', () => {
  const missing = row({ accuracy: NaN, accuracy_low: null, accuracy_high: null, cost_per_correct: null, trap_resistance: NaN, honesty: null })
  assert.equal(resultVerdict(missing, missing, 'A', 'B').value, null)
  assert.equal(metricComparison(NaN, .5, 'percent'), 'Not comparable')
  assert.equal(metricComparison(null, 0, 'cost'), 'Not comparable')
})

test('zero recorded price is handled without dividing by zero', () => {
  assert.equal(resultVerdict(row({ cost_per_correct: 0 }), row(), 'Free', 'Paid').value, 100)
  assert.equal(metricComparison(0, 0, 'cost'), 'Tie')
})

test('one-agent results do not invent a comparison', () => {
  const verdict = resultVerdict(row({ accuracy: .75 }), null, 'Solo', '')
  assert.equal(verdict.title, 'Solo, measured across repeats.')
  assert.equal(verdict.value, 75)
  assert.ok(verdict.description.includes('one agent'))
})

test('trap-only batch falls back to a cost verdict when trap resistance ties', () => {
  const trapOnly = overrides => row({ accuracy: NaN, accuracy_low: null, accuracy_high: null, trap_resistance: .67, honesty: NaN, ...overrides })
  const verdict = resultVerdict(trapOnly({ cost_per_correct: .0018 }), trapOnly({ cost_per_correct: .0032 }), 'Baseline', 'Cheap-first')
  assert.equal(verdict.title, 'Baseline wins on cost.')
  assert.equal(Math.round(verdict.value), 44)
})
