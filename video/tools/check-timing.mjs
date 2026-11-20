// Asserts no scene holds after its narration (except the outro's planned hold) and the cut fits 1:58–2:35.
import fs from 'node:fs'
const read = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)))
const { scenes } = read('../src/script-data.json'), D = read('../src/durations.json')
const TRANSITION = 12, bad = []
for (const s of scenes) {
  const d = D[s.id]
  if (!d) { bad.push(`${s.id}: no duration, run npm run voice`); continue }
  const slack = d.frames / 30 - 0.4 - d.audioSeconds - (s.holdSeconds ?? 0)
  if (slack > 0.7) bad.push(`${s.id}: ${slack.toFixed(2)}s silent hold`)
}
const total = (scenes.reduce((n, s) => n + (D[s.id]?.frames ?? 0), 0) - TRANSITION * (scenes.length - 1)) / 30
if (total < 118 || total > 155) bad.push(`total ${total.toFixed(1)}s outside 118–155s`)
if (bad.length) { console.error('timing BAD\n' + bad.join('\n')); process.exit(1) }
console.log(`timing ok, total ${total.toFixed(1)}s`)
