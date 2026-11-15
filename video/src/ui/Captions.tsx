import { interpolate, useCurrentFrame } from 'remotion'
import { C, F, FPS, type SceneId } from '../brand'
import { LEAD, clamp, words } from './kit'

/** Split narration into short caption chunks: break at sentence/clause punctuation or every 6 words. */
function chunks(scene: SceneId) {
  const out: { text: string; start: number; end: number }[] = []
  let cur: [string, number, number][] = []
  const flush = () => { if (cur.length) out.push({ text: cur.map(c => c[0]).join(' '), start: cur[0][1], end: cur[cur.length - 1][2] }); cur = [] }
  for (const word of words(scene)) {
    cur.push(word)
    if (/[.?!:]$/.test(word[0]) || (/,$/.test(word[0]) && cur.length >= 3) || cur.length >= 6) flush()
  }
  flush()
  return out
}

export function Captions({ scene }: { scene: SceneId }) {
  const frame = useCurrentFrame()
  const t = frame / FPS - LEAD
  const list = chunks(scene)
  const i = list.findIndex((c, k) => t >= c.start - 0.05 && t < (list[k + 1]?.start ?? c.end + 0.6))
  if (i < 0) return null
  const c = list[i]
  const p = interpolate(t, [c.start - 0.05, c.start + 0.12], [0, 1], clamp)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ fontFamily: F.body, fontSize: 34, fontWeight: 500, color: '#fff', background: 'rgba(58,46,40,.86)', borderRadius: 12, padding: '10px 22px', maxWidth: 1400, textAlign: 'center',
        opacity: p, transform: `translateY(${(1 - p) * 6}px)` }}>
        {c.text}
      </div>
    </div>
  )
}
