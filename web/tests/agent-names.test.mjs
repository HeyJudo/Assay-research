import test from 'node:test'
import assert from 'node:assert/strict'
import { registerAgents, agentLabel } from '../src/lib/agent-names.ts'

test('approved version names omit the product prefix and retain custom names', () => {
  registerAgents([{ id: 'baseline', name: 'Briefing Agent: Baseline' }, { id: 'outside', name: 'GPT Researcher' }, { id: 'custom', name: 'Research lab: Analyst' }])
  assert.equal(agentLabel('baseline'), 'Baseline')
  assert.equal(agentLabel('outside'), 'GPT Researcher')
  assert.equal(agentLabel('custom'), 'Research lab: Analyst')
  assert.equal(agentLabel('unknown'), 'unknown')
})
