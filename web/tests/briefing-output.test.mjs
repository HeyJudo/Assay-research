import test from 'node:test'
import assert from 'node:assert/strict'
import { splitBriefing, parseBrief, collectSources, citationUrls, sourceLabel } from '../src/lib/briefing-output.ts'

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

test('bullets with * and - become one list', () => {
  const blocks = parseBrief('Intro\n* **Bold:** first\n- second\n\nAfter')
  assert.equal(blocks.length, 3)
  assert.equal(blocks[1].kind, 'ul')
  assert.equal(blocks[1].items.length, 2)
  assert.deepEqual(blocks[1].items[0][0], { text: 'Bold:', bold: true })
  assert.deepEqual(blocks[1].items[1], [{ text: 'second' }])
})

test('citations are numbered by the shared sources order', () => {
  const text = '* A ([One](https://a.test/x); [Two](https://www.b.test/y)).\n* B [Again](https://a.test/x)'
  const sources = collectSources(text, ['https://c.test/z', 'https://a.test/x'])
  assert.deepEqual(sources, ['https://a.test/x', 'https://www.b.test/y', 'https://c.test/z'])
  const cites = parseBrief(text, sources)[0].items.flat().filter(i => 'cite' in i)
  assert.deepEqual(cites.map(c => c.cite), [1, 2, 1])
  assert.equal(cites[1].domain, 'b.test')
  assert.equal(parseBrief(text, sources)[0].items[0].some(i => i.text?.includes('(') || i.text?.includes(';')), false)
})

test('markdown links and bare bracketed URLs both cite; unsafe URLs stay text', () => {
  assert.deepEqual(citationUrls('x [t](https://a.test/1) y [https://b.test/2] z [bad](javascript:alert(1))'), ['https://a.test/1', 'https://b.test/2'])
  const inlines = parseBrief('see [https://b.test/2]')[0].inlines
  assert.deepEqual(inlines[1], { cite: 1, url: 'https://b.test/2', domain: 'b.test' })
})

test('source labels show domain and a shortened path', () => {
  assert.deepEqual(sourceLabel('https://www.a.test/'), { domain: 'a.test', path: '' })
  const label = sourceLabel('https://a.test/' + 'p'.repeat(60))
  assert.equal(label.path.length, 37)
  assert.ok(label.path.endsWith('…'))
})
