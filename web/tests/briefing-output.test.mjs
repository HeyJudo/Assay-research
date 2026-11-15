import test from 'node:test'
import assert from 'node:assert/strict'
import { splitBriefing } from '../src/lib/briefing-output.ts'

test('briefing keeps source citations and unrecognized sections', () => {
  const result = splitBriefing('# Brief: Tavily\n\nContext before sections.\n\n## Verified\n- A claim. [1](https://source.test/news)\n\n## Limitations\nThe source could be stale.\n')
  assert.equal(result.title, 'Brief: Tavily')
  assert.deepEqual(result.sections, [
    { heading: '', text: 'Context before sections.' },
    { heading: 'Verified', text: '- A claim. [1](https://source.test/news)' },
    { heading: 'Limitations', text: 'The source could be stale.' },
  ])
})

test('plain or empty output remains inspectable', () => {
  assert.deepEqual(splitBriefing('Search failed. No report could be written.'), { title: null, sections: [{ heading: '', text: 'Search failed. No report could be written.' }] })
  assert.deepEqual(splitBriefing(''), { title: null, sections: [] })
})
