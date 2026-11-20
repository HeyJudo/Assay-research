import test from 'node:test'
import assert from 'node:assert/strict'
import { savedPasscode } from '../src/lib/passcode.ts'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('saves code from the URL and returns it later without the param', () => {
  const store = memoryStorage()
  assert.equal(savedPasscode('?code=a%20b%26c', store), 'a b&c')
  assert.equal(savedPasscode('', store), 'a b&c')
})
test('no code and nothing saved gives empty string', () => {
  assert.equal(savedPasscode('', memoryStorage()), '')
})
test('a throwing store still returns the URL code', () => {
  const bad = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(savedPasscode('?code=x', bad), 'x')
})
test('no arguments is safe when location and sessionStorage are unavailable', () => {
  assert.equal(savedPasscode(), '')
})
