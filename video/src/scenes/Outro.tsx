import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, F, REPO, TEAM, TEAM_NAME } from '../brand'
import { Logo } from '../ui/Logo'
import { Bg, Dashed, Paper, Sfx, clamp, cue, easeOut, useIn, useRamp } from '../ui/kit'

export function Outro() {
  const frame = useCurrentFrame(), { durationInFrames } = useVideoConfig()
  const dont = cue('outro', "don't"), check = cue('outro', 'check')
  const paperIn = useIn(0, { damping: 20 })
  const swap = check + 34
  const out = useRamp(swap, swap + 16)
  const lockup = useIn(swap + 24), team = useIn(swap + 34), repo = useIn(swap + 44)
  const fade = interpolate(frame, [durationInFrames - 12, durationInFrames], [0, 1], clamp)
  const line = (at: number) => interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: easeOut })

  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${(1 - paperIn) * 700 + out * 900}px) rotate(${-1 + out * 8}deg)` }}>
          <Paper width={900}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, letterSpacing: 3, color: C.muted }}><span>ASSAY</span><span>RECEIPT</span></div>
            <Dashed />
            <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 76, lineHeight: 1.1, opacity: line(dont), transform: `translateY(${(1 - line(dont)) * 20}px)` }}>Don't trust the answer.</div>
            <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 76, lineHeight: 1.1, color: C.accent, marginTop: 10, opacity: line(check), transform: `translateY(${(1 - line(check)) * 20}px)` }}>Check the receipt.</div>
            <Dashed />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}><span>TOTAL</span><span>every step, every cent</span></div>
          </Paper>
        </div>
      </AbsoluteFill>

      {frame >= swap + 10 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 48 }}>
          <Logo from={swap + 10} size={1} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 34, opacity: lockup, transform: `translateY(${(1 - lockup) * 20}px)` }}>
            <span style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: 2, color: C.muted }}>BUILT WITH</span>
            <Img src={staticFile('brand/tavily.png')} style={{ height: 44 }} />
            <span style={{ width: 2, height: 40, background: C.line }} />
            <Img src={staticFile('brand/bifrost.png')} style={{ height: 44 }} />
          </div>
          <div style={{ textAlign: 'center', opacity: team, transform: `translateY(${(1 - team) * 20}px)` }}>
            <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 40, color: C.text }}>Team {TEAM_NAME}</div>
            <div style={{ fontFamily: F.body, fontSize: 30, color: C.muted, marginTop: 8 }}>{TEAM.join('  ·  ')}</div>
          </div>
          <div style={{ textAlign: 'center', opacity: repo, transform: `translateY(${(1 - repo) * 20}px)` }}>
            <div style={{ fontFamily: F.mono, fontSize: 30, color: C.accent }}>{REPO}</div>
            <div style={{ fontFamily: F.mono, fontSize: 20, color: C.muted, marginTop: 14, letterSpacing: 1.5 }}>GLOBAL AI HACKATHON 2026 · BIFROST PS02 + TAVILY PS05</div>
          </div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: C.bg, opacity: fade }} />

      <Sfx at={0} name="print" volume={0.3} />
      <Sfx at={check + 4} name="stamp" volume={0.35} />
      <Sfx at={swap} name="whoosh" volume={0.4} />
      <Sfx at={swap + 22} name="chime" volume={0.35} />
    </Bg>
  )
}
