import React from 'react'
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { C, F, FPS } from '../brand'
import { Bg, Sfx, clamp, ease, easeOut, useIn } from './kit'
import { FlowTracker } from './FlowTracker'

/** Clips are 1440x810 CSS px recorded at 2x. Window shows them at this width. */
const VW = 1440, VH = 810, WIN_W = 1440, K = WIN_W / VW, WIN_H = VH * K, BAR = 44
/** Max camera zoom: beyond this the UI text gets soft and context is lost. */
const MAX_Z = 1.6

/** Play clip seconds [from, to] across scene seconds [at, at + dur]. */
export type Segment = { from: number; to: number; at: number; dur: number }
/** Camera focus (CSS px of the 1440x810 page) and zoom, eased in over `ms` starting at scene second `at`. */
export type Cam = { at: number; x: number; y: number; z: number; ms?: number }
/** Accent outline around a UI area (CSS px of the 1440x810 page), visible over scene seconds [at, until]. */
export type Ring = { at: number; until: number; x: number; y: number; w: number; h: number; tone?: 'brand' | 'bad' }

function camAt(keys: Cam[], t: number) {
  let cur = { x: keys[0].x, y: keys[0].y, z: keys[0].z }
  for (const k of keys) {
    if (t < k.at) break
    const p = interpolate(t, [k.at, k.at + (k.ms ?? 900) / 1000], [0, 1], { ...clamp, easing: ease })
    cur = { x: cur.x + (k.x - cur.x) * p, y: cur.y + (k.y - cur.y) * p, z: cur.z + (k.z - cur.z) * p }
  }
  return { ...cur, z: Math.min(cur.z, MAX_Z) }
}

export function Screen({ clip, segments, cams, rings = [], covers = [], step, enter: animateIn = false, url, cut, children }: {
  clip: string; segments: Segment[]; cams: Cam[]; rings?: Ring[]; url: string
  /** Page areas (clip CSS px) to blur out, e.g. half-visible backdrop text behind a drawer. */
  covers?: { x: number; y: number; w: number; h: number }[]
  /** Flow tracker step: 0 Test, 1 Inspect, 2 Decide, 3 Ship. */
  step: 0 | 1 | 2 | 3
  /** Fly the window in (first screen scene only; later ones crossfade). */
  enter?: boolean
  /** Scene second where a labeled time cut card flashes. */
  cut?: { at: number; text: string }
  children?: React.ReactNode
}) {
  const frame = useCurrentFrame()
  const t = frame / FPS
  const spring = useIn(0, { damping: 20, mass: 0.9 })
  const enter = animateIn ? spring : 1
  const cam = camAt(cams, t)
  const s = K * cam.z
  const tx = Math.min(0, Math.max(WIN_W - VW * s, WIN_W / 2 - cam.x * s))
  const ty = Math.min(0, Math.max(WIN_H - VH * s, WIN_H / 2 - cam.y * s))
  const seg = segments.find(g => t >= g.at && t < g.at + g.dur)
  const rate = seg ? (seg.to - seg.from) / seg.dur : 1

  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 92 }}>
        <div style={{
          width: WIN_W, borderRadius: 18, overflow: 'hidden', background: C.card, border: `1.5px solid ${C.line}`,
          boxShadow: '0 40px 80px rgba(74,59,51,.18), 0 6px 16px rgba(74,59,51,.08)',
          transform: `perspective(2400px) translateY(${(1 - enter) * 160}px) rotateX(${(1 - enter) * 14}deg) scale(${0.94 + enter * 0.06})`,
          opacity: Math.min(1, enter * 1.4),
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
              {covers.map((c, i) => <div key={'c' + i} style={{ position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, backdropFilter: 'blur(7px)', background: 'rgba(74,59,51,.18)' }} />)}
              {rings.map((r, i) => <RingBox key={i} {...r} />)}
            </div>
            {children}
            {seg && rate > 1.6 && seg.dur >= 1.5 && <SpeedBadge rate={rate} />}
          </div>
        </div>
      </AbsoluteFill>

      <FlowTracker step={step} />
      {cut && <CutCard {...cut} />}
      {animateIn && <Sfx at={2} name="whoosh" volume={0.3} />}
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

function RingBox({ at, until, x, y, w, h, tone = 'brand' }: Ring) {
  const frame = useCurrentFrame()
  const a = Math.round(at * FPS), b = Math.max(Math.round(until * FPS), a + 30)
  const p = interpolate(frame, [a, a + 14, b - 10, b], [0, 1, 1, 0], { ...clamp, easing: easeOut })
  if (p === 0) return null
  const color = tone === 'bad' ? C.danger : C.accent
  const pad = 8 + (1 - p) * 14
  return (
    <div style={{ position: 'absolute', left: x - pad, top: y - pad, width: w + pad * 2, height: h + pad * 2, borderRadius: 14, border: `3px solid ${color}`, opacity: p,
      boxShadow: `0 0 0 6px ${color}22, 0 10px 30px ${color}33`, pointerEvents: 'none' }} />
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
