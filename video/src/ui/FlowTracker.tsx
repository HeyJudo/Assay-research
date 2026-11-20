import { interpolate, useCurrentFrame } from 'remotion'
import { Check } from 'lucide-react'
import { C, F } from '../brand'
import { clamp, easeOut } from './kit'

const STEPS = ['Test', 'Inspect', 'Decide', 'Ship']

/** "Test → Inspect → Decide → Ship" stepper above the browser window. The current step fills in over the first 18 frames. */
export function FlowTracker({ step }: { step: 0 | 1 | 2 | 3 }) {
  const p = interpolate(useCurrentFrame(), [4, 22], [0, 1], { ...clamp, easing: easeOut })
  return (
    <div style={{ position: 'absolute', top: 22, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, fontFamily: F.mono, fontSize: 21, letterSpacing: 1.5 }}>
      {STEPS.map((label, i) => {
        const done = i < step, cur = i === step
        const fill = cur ? p : done ? 1 : 0
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {i > 0 && <div style={{ width: 46, height: 2, background: i <= step ? C.accent : C.line }} />}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 18px', borderRadius: 999,
              border: `1.5px solid ${fill > 0 ? C.accent : C.line}`,
              background: cur ? `rgba(180,83,9,${fill})` : done ? C.tint : C.card,
              color: cur && fill > 0.5 ? '#fff' : done ? C.accentDark : C.muted,
              transform: `scale(${cur ? 1 + 0.06 * fill : 1})`,
            }}>
              {done ? <Check size={18} strokeWidth={2.5} /> : <span>{i + 1}</span>}
              <span style={{ textTransform: 'uppercase' }}>{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
