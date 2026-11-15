import React from 'react'
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, F, FPS } from '../brand'
import { Bg, Sfx, clamp, ease, easeOut, useIn } from './kit'

/** Clips are 1440x810 CSS px recorded at 2x. Window shows them at this width. */
const VW = 1440, VH = 810, WIN_W = 1520, K = WIN_W / VW, WIN_H = VH * K, BAR = 44

/** Play clip seconds [from, to] across scene seconds [at, at + dur]. */
export type Segment = { from: number; to: number; at: number; dur: number }
/** Camera focus (CSS px of the 1440x810 page) and zoom, eased in over `ms` starting at scene second `at`. */
export type Cam = { at: number; x: number; y: number; z: number; ms?: number }
/** Fact chip shown at the bottom-left of the window. */
export type Fact = { at: number; until: number; text: React.ReactNode; tone?: 'ok' | 'bad' | 'brand'; logo?: string }

function camAt(keys: Cam[], t: number) {
  let cur = { x: keys[0].x, y: keys[0].y, z: keys[0].z }
  for (const k of keys) {
    if (t < k.at) break
    const p = interpolate(t, [k.at, k.at + (k.ms ?? 900) / 1000], [0, 1], { ...clamp, easing: ease })
    cur = { x: cur.x + (k.x - cur.x) * p, y: cur.y + (k.y - cur.y) * p, z: cur.z + (k.z - cur.z) * p }
  }
  return cur
}

export function Screen({ clip, segments, cams, facts = [], label, url, cut, children }: {
  clip: string; segments: Segment[]; cams: Cam[]; facts?: Fact[]; label: React.ReactNode; url: string
  /** Scene second where a labeled time cut card flashes. */
  cut?: { at: number; text: string }
  children?: React.ReactNode
}) {
  const frame = useCurrentFrame(), { durationInFrames } = useVideoConfig()
  const t = frame / FPS
  const enter = useIn(0, { damping: 20, mass: 0.9 })
  const leave = interpolate(frame, [durationInFrames - 10, durationInFrames], [0, 1], clamp)
  const cam = camAt(cams, t)
  const s = K * cam.z
  const tx = Math.min(0, Math.max(WIN_W - VW * s, WIN_W / 2 - cam.x * s))
  const ty = Math.min(0, Math.max(WIN_H - VH * s, WIN_H / 2 - cam.y * s))
  const seg = segments.find(g => t >= g.at && t < g.at + g.dur)
  const rate = seg ? (seg.to - seg.from) / seg.dur : 1

  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 52 }}>
        <div style={{
          width: WIN_W, borderRadius: 18, overflow: 'hidden', background: C.card, border: `1.5px solid ${C.line}`,
          boxShadow: '0 40px 80px rgba(74,59,51,.18), 0 6px 16px rgba(74,59,51,.08)',
          transform: `perspective(2400px) translateY(${(1 - enter) * 160 + leave * 30}px) rotateX(${(1 - enter) * 14}deg) scale(${0.94 + enter * 0.06})`,
          opacity: Math.min(1, enter * 1.4) * (1 - leave),
        }}>
          <div style={{ height: BAR, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', background: C.secondary, borderBottom: `1.5px solid ${C.line}` }}>
            {['#e0b4a4', '#e8cf9b', '#b9cfae'].map(c => <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
            <div style={{ marginLeft: 18, flex: 1, maxWidth: 620, height: 28, borderRadius: 8, background: C.card, fontFamily: F.mono, fontSize: 16, color: C.muted, display: 'flex', alignItems: 'center', padding: '0 14px' }}>{url}</div>
          </div>
          <div style={{ width: WIN_W, height: WIN_H, position: 'relative', overflow: 'hidden', background: C.bg }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
              {segments.map((g, i) => (
                <Sequence key={i} from={Math.round(g.at * FPS)} durationInFrames={Math.max(1, Math.round(g.dur * FPS))} layout="none">
                  <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} muted trimBefore={Math.round(g.from * FPS)} playbackRate={(g.to - g.from) / g.dur}
                    style={{ width: VW, height: VH, position: 'absolute', inset: 0 }} />
                </Sequence>
              ))}
            </div>
            {children}
            {rate > 1.6 && <SpeedBadge rate={rate} />}
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: (1920 - WIN_W) / 2 + 26, top: 2, opacity: enter }}>
          <span style={{ fontFamily: F.mono, fontSize: 19, letterSpacing: 2.5, color: '#fff', background: C.text, borderRadius: 999, padding: '9px 18px', boxShadow: '0 8px 20px rgba(0,0,0,.18)' }}>{label}</span>
        </div>
        {facts.map((f, i) => <FactChip key={i} {...f} />)}
      </AbsoluteFill>

      {cut && <CutCard {...cut} />}
      <Sfx at={2} name="whoosh" volume={0.3} />
    </Bg>
  )
}

function SpeedBadge({ rate }: { rate: number }) {
  return (
    <div style={{ position: 'absolute', right: 24, top: 22, fontFamily: F.mono, fontSize: 20, color: C.accentDark, background: C.accentSoft, borderRadius: 999, padding: '8px 16px', letterSpacing: 1 }}>
      ▶▶ {Math.round(rate)}× sped up
    </div>
  )
}

function FactChip({ at, until, text, tone = 'brand', logo }: Fact) {
  const frame = useCurrentFrame()
  const a = Math.round(at * FPS), b = Math.max(Math.round(until * FPS), a + 24)
  const p = interpolate(frame, [a, a + 12, b - 8, b], [0, 1, 1, 0], { ...clamp, easing: easeOut })
  if (p === 0) return null
  const color = tone === 'bad' ? C.danger : tone === 'ok' ? C.ok : C.accentDark
  const bg = tone === 'bad' ? C.dangerBg : tone === 'ok' ? C.okBg : C.tint
  return (
    <>
      <div style={{ position: 'absolute', left: (1920 - WIN_W) / 2 + 40, bottom: 150, opacity: p, transform: `translateY(${(1 - p) * 24}px) scale(${0.96 + p * 0.04})`,
        display: 'flex', alignItems: 'center', gap: 16, background: '#fff', border: `2px solid ${color}55`, borderLeft: `8px solid ${color}`, borderRadius: 16,
        padding: '18px 26px', boxShadow: '0 20px 40px rgba(74,59,51,.18)', fontFamily: F.body, fontSize: 34, fontWeight: 600, color: C.text }}>
        {logo && <Img src={staticFile(logo)} style={{ height: 34 }} />}
        <span style={{ background: bg, color, borderRadius: 10, padding: '2px 0' }}>{text}</span>
      </div>
      <Sfx at={a} name="pop" volume={0.35} />
    </>
  )
}

function CutCard({ at, text }: { at: number; text: string }) {
  const frame = useCurrentFrame()
  const a = Math.round(at * FPS)
  const p = interpolate(frame, [a, a + 6, a + 26, a + 34], [0, 1, 1, 0], clamp)
  if (p === 0) return null
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: `rgba(74,59,51,${0.82 * p})` }}>
      <div style={{ fontFamily: F.mono, fontSize: 56, letterSpacing: 4, color: '#fff', opacity: p, transform: `scale(${0.9 + p * 0.1})` }}>⏱ {text}</div>
      <Sfx at={a} name="whoosh" volume={0.4} />
    </AbsoluteFill>
  )
}
