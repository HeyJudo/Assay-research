import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { C, F } from '../brand'
import { Bg, Sfx, clamp, cue, useIn, useRamp } from '../ui/kit'

function Card({ at, title, children, dim }: { at: number; title: string; children: React.ReactNode; dim: number }) {
  const s = useIn(at, { damping: 16, mass: 0.7 })
  return (
    <div style={{
      width: 500, height: 440, background: C.card, border: `2px solid ${C.line}`, borderRadius: 24, padding: 40,
      boxShadow: '0 30px 60px rgba(74,59,51,.10)', display: 'flex', flexDirection: 'column', gap: 26,
      opacity: s * (1 - dim * 0.75), transform: `translateY(${(1 - s) * 80 + dim * 30}px) scale(${1 - dim * 0.08})`, filter: `blur(${dim * 4}px)`,
    }}>
      <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: 2.5, color: C.muted }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ at, label, ok }: { at: number; label: string; ok: boolean }) {
  const s = useIn(at, { damping: 14 })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: s, transform: `translateX(${(1 - s) * -30}px)`, fontSize: 30 }}>
      <span style={{ fontFamily: F.mono, color: C.muted, width: 110 }}>{label}</span>
      <span style={{ flex: 1, height: 14, borderRadius: 7, background: ok ? C.okBg : C.dangerBg }} />
      <span style={{ fontWeight: 700, color: ok ? C.ok : C.danger, width: 30 }}>{ok ? '✓' : '✕'}</span>
    </div>
  )
}

export function Problem() {
  const frame = useCurrentFrame()
  const wrong = cue('problem', 'wrong'), run = cue('problem', 'run'), diff = cue('problem', 'different'), nobody = cue('problem', 'nobody'), so = cue('problem', 'so')
  const flip = interpolate(frame, [wrong, wrong + 6], [0, 1], clamp)
  const dim = useRamp(so - 6, so + 10)
  const q = useIn(so + 4)
  const scramble = frame < nobody + 50 ? String(Math.floor((Math.sin(frame * 1.7) * 0.5 + 0.5) * 9999)).padStart(4, '0') : '????'

  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 44 }}>
        <Card at={2} title="SOUNDS SURE" dim={dim}>
          <div style={{ fontSize: 30, lineHeight: 1.4 }}>“The company was founded by two researchers and is profitable.”</div>
          <div style={{ marginTop: 'auto', alignSelf: 'flex-start', fontFamily: F.mono, fontSize: 26, fontWeight: 500, padding: '10px 22px', borderRadius: 999,
            color: flip > 0.5 ? C.danger : C.ok, background: flip > 0.5 ? C.dangerBg : C.okBg, transform: `rotateX(${Math.sin(flip * Math.PI) * 90}deg)` }}>
            {flip > 0.5 ? '✕ unsupported' : '✓ verified'}
          </div>
        </Card>
        <Card at={run} title="SAME TASK, TWICE" dim={dim}>
          <Row at={run + 8} label="run 1" ok />
          <Row at={diff} label="run 2" ok={false} />
          <Row at={diff + 10} label="run 3" ok />
          <div style={{ marginTop: 'auto', fontSize: 26, color: C.muted }}>Which answer is the agent?</div>
        </Card>
        <Card at={nobody} title="COST PER CORRECT ANSWER" dim={dim}>
          <div style={{ fontFamily: F.mono, fontSize: 96, fontWeight: 500, color: C.text, marginTop: 30 }}>$0.{scramble}</div>
          <div style={{ marginTop: 'auto', fontSize: 26, color: C.muted }}>Nobody tells you.</div>
        </Card>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 104, letterSpacing: -1, opacity: q, transform: `scale(${0.9 + q * 0.1})`, textAlign: 'center', lineHeight: 1.05 }}>
          Which agent do<br />you <span style={{ color: C.accent }}>trust?</span>
        </div>
      </AbsoluteFill>
      <Sfx at={2} name="pop" volume={0.35} />
      <Sfx at={wrong} name="error" volume={0.4} />
      <Sfx at={run} name="pop" volume={0.35} />
      <Sfx at={diff} name="error" volume={0.3} />
      <Sfx at={nobody} name="pop" volume={0.35} />
      <Sfx at={so} name="whoosh" volume={0.4} />
    </Bg>
  )
}
