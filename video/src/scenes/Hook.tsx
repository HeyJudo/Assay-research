import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { C, F } from '../brand'
import { Logo } from '../ui/Logo'
import { Bg, Dashed, Paper, Sfx, Stamp, clamp, cue, easeOut, useIn, useRamp } from '../ui/kit'

// Abstract brief lines (bars, not invented facts). Index 1 and 3 are the trapped ones.
const LINES = [0.92, 0.78, 0.86, 0.64, 0.8]
const TRAPPED = [1, 3]

export function Hook() {
  const frame = useCurrentFrame()
  const typeStart = 10, perLine = 13
  const planted = cue('hook', 'planted'), would = cue('hook', 'would'), thisIs = cue('hook', 'this'), assay = cue('hook', 'assay')
  const paperIn = useIn(0, { damping: 20, mass: 0.8 })
  const out = useRamp(thisIs - 4, thisIs + 14)
  const push = interpolate(frame, [would - 10, thisIs], [1, 1.1], { ...clamp, easing: easeOut })
  const blur = interpolate(frame, [would, thisIs], [0, 3], clamp)
  const question = useIn(would)
  const tag = useIn(assay + 26)

  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${(1 - paperIn) * 500 - out * 1100 - 60}px) scale(${push * 1.18}) rotate(${-1.5 + out * -6}deg)`, filter: `blur(${blur}px)` }}>
          <Paper width={760}>
            <div style={{ fontSize: 20, letterSpacing: 3, color: C.muted }}>MEETING BRIEF</div>
            <div style={{ fontFamily: F.head, fontSize: 44, fontWeight: 700, marginTop: 8 }}>Maxim AI</div>
            <div style={{ fontSize: 20, color: C.muted, marginTop: 4 }}>meeting · 2026-11-13</div>
            <Dashed />
            {LINES.map((w, i) => {
              const grow = interpolate(frame, [typeStart + i * perLine, typeStart + i * perLine + 16], [0, 1], { ...clamp, easing: easeOut })
              const bad = TRAPPED.includes(i) && frame >= planted + (i === 3 ? 5 : 0)
              const flip = interpolate(frame, [planted, planted + 8], [0, 1], clamp)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, height: 52 }}>
                  <div style={{ width: 30, fontSize: 28, fontWeight: 500, color: bad ? C.danger : C.ok, opacity: grow }}>{bad ? '✕' : '✓'}</div>
                  <div style={{ flex: 1, position: 'relative', height: 16 }}>
                    <div style={{ position: 'absolute', inset: 0, width: `${w * 100 * grow}%`, borderRadius: 8, background: bad ? C.dangerBg : C.secondary, transition: 'none' }} />
                    {bad && <div style={{ position: 'absolute', top: 7, height: 3, background: C.danger, width: `${w * 100 * flip}%` }} />}
                  </div>
                </div>
              )
            })}
            <Dashed />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22 }}><span>SOURCES</span><span>5 cited</span></div>
          </Paper>
          <Stamp at={planted + 6} text="TRAPPED" style={{ right: -30, top: 40 }} />
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 120 }}>
        <div style={{ fontFamily: F.head, fontSize: 72, fontWeight: 700, color: C.text, opacity: question * (1 - out), transform: `translateY(${(1 - question) * 30}px)` }}>
          Would you <span style={{ color: C.accent }}>know?</span>
        </div>
      </AbsoluteFill>

      {frame >= thisIs && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40 }}>
          <Logo from={thisIs + 2} size={1.15} />
          <div style={{ fontFamily: F.body, fontSize: 40, color: C.muted, opacity: tag, transform: `translateY(${(1 - tag) * 20}px)` }}>
            Know what your research agent does when the web <span style={{ color: C.accent, fontWeight: 600 }}>lies.</span>
          </div>
        </AbsoluteFill>
      )}

      <Sfx at={typeStart} name="print" volume={0.35} />
      <Sfx at={planted - 2} name="error" volume={0.35} />
      <Sfx at={planted + 6} name="stamp" volume={0.6} />
      <Sfx at={would - 40} name="riser" volume={0.3} />
      <Sfx at={thisIs - 4} name="whoosh" volume={0.45} />
      <Sfx at={assay + 8} name="chime" volume={0.35} />
    </Bg>
  )
}
