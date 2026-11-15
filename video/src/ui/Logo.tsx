import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, F } from '../brand'

/** Receipt mark from artifacts/logo-options/verified-wordmark, redrawn as SVG so it can animate. */
export function Mark({ size = 120, draw = 1, color = C.accent }: { size?: number; draw?: number; color?: string }) {
  const len = 420
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 100 112" fill="none">
      <path d="M12 96 V18 a10 10 0 0 1 10 -10 h56 a10 10 0 0 1 10 10 V96 q-6.333 10 -12.667 0 t-12.667 0 t-12.667 0 t-12.667 0 t-12.667 0 t-12.667 0"
        stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
      {[34, 52, 70].map((y, i) => (
        <line key={y} x1={30} x2={30 + 40 * interpolate(draw, [0.45 + i * 0.15, 0.7 + i * 0.15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
          y1={y} y2={y} stroke={color} strokeWidth={7} strokeLinecap="round" />
      ))}
    </svg>
  )
}

/** Mark plus wordmark. `from` is the frame the reveal starts. */
export function Logo({ from = 0, size = 1 }: { from?: number; size?: number }) {
  const frame = useCurrentFrame() - from
  const { fps } = useVideoConfig()
  const draw = interpolate(frame, [0, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 * size }}>
      <Mark size={110 * size} draw={draw} />
      <div style={{ display: 'flex', fontFamily: F.head, fontWeight: 500, fontSize: 150 * size, color: C.text, letterSpacing: -2, lineHeight: 1 }}>
        {'Assay'.split('').map((ch, i) => {
          const s = spring({ frame: frame - 10 - i * 3, fps, config: { damping: 14, mass: 0.6 } })
          return <span key={i} style={{ display: 'inline-block', color: i === 4 ? C.accent : C.text, opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>{ch}</span>
        })}
      </div>
    </div>
  )
}
