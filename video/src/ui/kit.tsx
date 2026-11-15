import React from 'react'
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, F, FPS, type SceneId } from '../brand'
import timing from '../timing.json'

/** Narration starts this many seconds into each scene. */
export const LEAD = 0.4
const T = timing as Record<SceneId, [string, number, number][]>

/** Frame (within the scene) where the nth spoken occurrence of `word` (exact, punctuation stripped) begins. */
export function cue(scene: SceneId, word: string, nth = 0, offset = 0) {
  const hits = T[scene].filter(([w]) => w.toLowerCase().replace(/[^a-z0-9'-]/g, '') === word.toLowerCase())
  const hit = hits[nth]
  if (!hit) throw new Error(`cue: "${word}" #${nth} not spoken in ${scene}`)
  return Math.round((LEAD + hit[1] + offset) * FPS)
}
export const words = (scene: SceneId) => T[scene]

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
export const ease = Easing.bezier(0.65, 0, 0.35, 1)
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1)

/** 0→1 spring starting at `from`. */
export function useIn(from: number, config: { damping?: number; mass?: number; stiffness?: number } = { damping: 18, mass: 0.7 }) {
  const frame = useCurrentFrame(), { fps } = useVideoConfig()
  return spring({ frame: frame - from, fps, config })
}
/** Linear 0→1 between two frames, eased. */
export function useRamp(a: number, b: number, e = ease) {
  return interpolate(useCurrentFrame(), [a, b], [0, 1], { ...clamp, easing: e })
}

export function Sfx({ at, name, volume = 0.5 }: { at: number; name: string; volume?: number }) {
  return <Sequence from={Math.max(0, Math.round(at))} durationInFrames={90} layout="none"><Audio src={staticFile(`sfx/${name}.mp3`)} volume={volume} /></Sequence>
}

/** Cream canvas with a faint dot grid and a slow warm glow. */
export function Bg({ children, glow = true }: { children?: React.ReactNode; glow?: boolean }) {
  const frame = useCurrentFrame()
  const gx = 50 + Math.sin(frame / 90) * 12, gy = 40 + Math.cos(frame / 110) * 10
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: F.body, color: C.text }}>
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${C.line} 1.4px, transparent 1.4px)`, backgroundSize: '34px 34px', opacity: 0.55 }} />
      {glow && <AbsoluteFill style={{ background: `radial-gradient(900px 600px at ${gx}% ${gy}%, ${C.tint} 0%, transparent 70%)`, opacity: 0.9 }} />}
      {children}
    </AbsoluteFill>
  )
}

/** Receipt paper with a zig-zag tear at the bottom. */
export function Paper({ width, children, style }: { width: number; children: React.ReactNode; style?: React.CSSProperties }) {
  const teeth = Math.round(width / 22)
  return (
    <div style={{ width, position: 'relative', filter: 'drop-shadow(0 30px 40px rgba(74,59,51,.16)) drop-shadow(0 4px 8px rgba(74,59,51,.08))', ...style }}>
      <div style={{ background: C.card, padding: '44px 48px 36px', fontFamily: F.mono, color: C.text }}>{children}</div>
      <svg width={width} height={14} viewBox={`0 0 ${teeth * 2} 2`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <path d={`M0 0 ${Array.from({ length: teeth }, (_, i) => `L${i * 2 + 1} 2 L${i * 2 + 2} 0`).join(' ')} Z`} fill={C.card} />
      </svg>
    </div>
  )
}

export function Dashed({ color = C.line }: { color?: string }) {
  return <div style={{ borderTop: `2px dashed ${color}`, margin: '18px 0' }} />
}

/** Rubber-stamp label that slams in at `at`. */
export function Stamp({ at, text, color = C.danger, style }: { at: number; text: string; color?: string; style?: React.CSSProperties }) {
  const frame = useCurrentFrame()
  const s = useIn(at, { damping: 9, mass: 0.5, stiffness: 220 })
  const shake = frame >= at && frame < at + 8 ? Math.sin((frame - at) * 3) * (8 - (frame - at)) * 0.6 : 0
  if (frame < at) return null
  return (
    <div style={{
      position: 'absolute', fontFamily: F.mono, fontWeight: 500, letterSpacing: 4, fontSize: 40, color, border: `5px solid ${color}`, borderRadius: 10,
      padding: '6px 22px', transform: `rotate(${-9 + shake}deg) scale(${interpolate(s, [0, 1], [2.2, 1])})`, opacity: Math.min(1, s * 1.6), background: 'rgba(255,255,255,.75)', ...style,
    }}>{text}</div>
  )
}

/** Label chip used by callouts and titles. */
export function Chip({ children, color = C.accent, bg = C.tint, style }: { children: React.ReactNode; color?: string; bg?: string; style?: React.CSSProperties }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: F.mono, fontSize: 22, letterSpacing: 1.5, textTransform: 'uppercase', color, background: bg, border: `1.5px solid ${color}33`, borderRadius: 999, padding: '8px 18px', ...style }}>{children}</span>
}
