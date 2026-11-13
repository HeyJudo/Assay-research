import test from 'node:test'
import assert from 'node:assert/strict'
import { connectBatchStream } from '../src/lib/batch-stream.ts'

class FakeSource {
  static CLOSED = 2
  static instance
  readyState = 0
  closed = false
  handlers = {}
  constructor() { FakeSource.instance = this }
  addEventListener(name, callback) { this.handlers[name] = callback }
  close() { this.closed = true }
}
test('temporary disconnect leaves automatic reconnection intact', () => {
  const errors = []
  const events = []
  connectBatchStream('/stream', e => events.push(e), e => errors.push(e), FakeSource)
  const source = FakeSource.instance
  source.onerror()
  assert.equal(source.closed, false)
  assert.equal(errors.length, 0)
  source.handlers.step({ data: JSON.stringify({ run_id: 'one', step: { i: 2 } }) })
  assert.equal(events[0].data.step.i, 2)
  source.readyState = 2
  source.onerror()
  assert.equal(errors.length, 1)
})
test('completion and malformed events close the connection', () => {
  const errors = []
  connectBatchStream('/stream', () => {}, e => errors.push(e), FakeSource)
  FakeSource.instance.handlers.batch_done({ data: '{"batch_id":"b"}' })
  assert.equal(FakeSource.instance.closed, true)
  connectBatchStream('/stream', () => {}, e => errors.push(e), FakeSource)
  FakeSource.instance.handlers.step({ data: 'invalid' })
  assert.equal(errors.length, 1)
  assert.equal(FakeSource.instance.closed, true)
})
