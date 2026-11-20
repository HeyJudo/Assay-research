import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { C, F } from '../brand'
import { Logo } from '../ui/Logo'
import { Bg, Dashed, Paper, Sfx, Stamp, clamp, cue, easeOut, ease, useIn, useRamp } from '../ui/kit'

// Abstract brief lines (bars, not invented facts). Index 1 and 3 turn out to be trapped.
const LINES = [0.92, 0.78, 0.86, 0.64, 0.8]
const TRAPPED = [1, 3]
const VERSIONS = [
  { tag: 'v1 · Baseline', x: 0, rot: -1 },
  { tag: 'v2 · Cheap-first', x: -620, rot: -4 },
  { tag: 'v3 · Evidence-gated', x: 620, rot: 4 },
]

function Brief({ i, typeStart, wrong, better }: { i: number; typeStart: number; wrong: number; better: number }) {
  const frame = useCurrentFrame()
  const q = useIn(better + i * 4, { damping: 11, mass: 0.5, stiffness: 200 })
  return (
    <div style={{ position: 'relative' }}>
      <Paper width={560}>
        <div style={{ display: 'inline-block', fontSize: 19, letterSpacing: 2, color: C.accentDark, background: C.tint, borderRadius: 999, padding: '4px 14px' }}>{VERSIONS[i].tag.toUpperCase()}</div>
        <div style={{ fontFamily: F.head, fontSize: 36, fontWeight: 700, marginTop: 14 }}>Meeting brief</div>
        <Dashed />
        {LINES.map((w, k) => {
          const grow = interpolate(frame, [typeStart + k * 8, typeStart + k * 8 + 14], [0, 1], { ...clamp, easing: easeOut })
          const bad = TRAPPED.includes(k) && frame >= wrong + i * 5 + (k === 3 ? 3 : 0)
          const flip = interpolate(frame, [wrong + i * 5, wrong + i * 5 + 8], [0, 1], clamp)
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 44 }}>
              <div style={{ width: 26, fontSize: 24, fontWeight: 500, color: bad ? C.danger : C.ok, opacity: grow }}>{bad ? '✕' : '✓'}</div>
              <div style={{ flex: 1, position: 'relative', height: 14 }}>
                <div style={{ position: 'absolute', inset: 0, width: `${w * 100 * grow}%`, borderRadius: 7, background: bad ? C.dangerBg : C.secondary }} />
                {bad && <div style={{ position: 'absolute', top: 6, height: 3, background: C.danger, width: `${w * 100 * flip}%` }} />}
              </div>
            </div>
          )
        })}
      </Paper>
      <div style={{ position: 'absolute', right: -22, top: -26, width: 64, height: 64, borderRadius: 32, background: C.accent, color: '#fff', display: 'grid', placeItems: 'center',
        fontFamily: F.head, fontWeight: 700, fontSize: 40, transform: `scale(${q})`, opacity: q > 0.01 ? 1 : 0, boxShadow: '0 10px 24px rgba(180,83,9,.35)' }}>?</div>
      <Stamp at={wrong + i * 5 + 6} text="TRAPPED" style={{ right: 20, bottom: 30, fontSize: 30 }} />
    </div>
  )
}

export function Hook() {
  const then = cue('hook', 'then'), better = cue('hook', 'are'), every = cue('hook', 'every'), wrong = cue('hook', 'wrong'), thisIs = cue('hook', 'this'), assay = cue('hook', 'assay')
  const frame = useCurrentFrame()
  const fan = useRamp(then, then + 22, ease)
  const out = useRamp(thisIs - 6, thisIs + 12)
  const tag = useIn(assay + 20)

  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        {VERSIONS.map((v, i) => {
          const enter = i === 0 ? useIn(0, { damping: 20, mass: 0.8 }) : fan
          const x = i === 0 ? 0 : v.x * fan
          const y = i === 0 ? (1 - enter) * 600 : (1 - fan) * 80
          return (
            <div key={i} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: i === 0 ? 2 : 1, opacity: i === 0 ? 1 : fan * (1 - out),
              transform: `translate(${x}px, ${y - out * 1100 - 20}px) rotate(${v.rot * (i === 0 ? 1 : fan) - out * 6}deg) scale(${i === 0 ? 1.12 - 0.12 * fan : 1})` }}>
              <Brief i={i} typeStart={i === 0 ? 8 : then + 6} wrong={wrong} better={better} />
            </div>
          )
        })}
      </AbsoluteFill>

      {frame >= thisIs && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40 }}>
          <Logo from={thisIs + 2} size={1.15} />
          <div style={{ fontFamily: F.body, fontSize: 40, color: C.muted, opacity: tag, transform: `translateY(${(1 - tag) * 20}px)` }}>
            Know which research agent to trust, and <span style={{ color: C.accent, fontWeight: 600 }}>why.</span>
          </div>
        </AbsoluteFill>
      )}

      <Sfx at={8} name="print" volume={0.35} />
      <Sfx at={then} name="whoosh" volume={0.35} />
      <Sfx at={then + 6} name="print" volume={0.25} />
      <Sfx at={better} name="pop" volume={0.4} />
      <Sfx at={every} name="chime" volume={0.2} />
      <Sfx at={wrong - 2} name="error" volume={0.35} />
      <Sfx at={wrong + 6} name="stamp" volume={0.5} />
      <Sfx at={thisIs - 6} name="whoosh" volume={0.45} />
      <Sfx at={assay + 8} name="chime" volume={0.35} />
    </Bg>
  )
}
