import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Bot, CircleCheck, ListChecks, Plug, Repeat, Snowflake, TriangleAlert, type LucideIcon } from 'lucide-react'
import { C, F } from '../brand'
import { Bg, Dashed, Paper, Sfx, clamp, cue, easeOut, useIn } from '../ui/kit'

type Step = { icon: LucideIcon; title: string; sub: string; at: number; logo?: { src: string; at: number; label: string } }

export function HowItWorks() {
  const frame = useCurrentFrame()
  const steps: Step[] = [
    { icon: Snowflake, title: 'Freeze the web', sub: 'Every agent searches the same saved pages.', at: cue('how', 'freezes'),
      logo: { src: 'brand/tavily.png', at: cue('how', 'tavily'), label: 'pages built with' } },
    { icon: TriangleAlert, title: 'Plant a trap', sub: 'A fake article, a hidden instruction, or an outage.', at: cue('how', 'plants') },
    { icon: Repeat, title: 'Run it three times', sub: 'One lucky pass does not count.', at: cue('how', 'each') },
    { icon: ListChecks, title: 'Record every step', sub: 'Searches, pages, model calls and cost.', at: cue('how', 'every', 2),
      logo: { src: 'brand/bifrost.png', at: cue('how', 'bifrost'), label: 'every call through' } },
    { icon: CircleCheck, title: 'Check every claim', sub: 'Claims matched to source quotes.', at: cue('how', 'then') },
    { icon: Plug, title: 'Any agent joins', sub: 'Env vars only. No code changes.', at: cue('how', 'any') },
  ]
  const active = steps.reduce((a, s, i) => (frame >= s.at ? i : a), 0)
  const head = useIn(0)

  return (
    <Bg>
      {/* Left: the active step, big */}
      <AbsoluteFill style={{ padding: '0 0 0 150px', justifyContent: 'center' }}>
        <div style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: 3, color: C.accent, opacity: head }}>HOW A RUN WORKS</div>
        <div style={{ position: 'relative', height: 420, width: 760, marginTop: 30 }}>
          <AgentChips from={cue('how', 'every')} until={steps[0].at} />
          {steps.map((s, i) => {
            const enter = interpolate(frame, [s.at, s.at + 14], [0, 1], { ...clamp, easing: easeOut })
            const next = steps[i + 1]?.at ?? 1e7
            const leave = interpolate(frame, [next - 4, next + 8], [0, 1], { ...clamp, easing: easeOut })
            if (enter === 0 || leave === 1) return null
            const Icon = s.icon
            return (
              <div key={i} style={{ position: 'absolute', inset: 0, opacity: enter * (1 - leave), transform: `translateY(${(1 - enter) * 50 - leave * 50}px)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
                  <div style={{ width: 120, height: 120, borderRadius: 60, border: `4px solid ${C.accent}`, display: 'grid', placeItems: 'center', background: C.tint }}>
                    <Icon size={60} color={C.accent} strokeWidth={1.8} />
                  </div>
                  <div style={{ fontFamily: F.mono, fontSize: 90, color: C.accentSoft, fontWeight: 500 }}>0{i + 1}</div>
                </div>
                <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 96, marginTop: 30, letterSpacing: -1 }}>{s.title}</div>
                <div style={{ fontSize: 38, color: C.muted, marginTop: 14, width: 700, lineHeight: 1.3 }}>{s.sub}</div>
              </div>
            )
          })}
        </div>
      </AbsoluteFill>

      {/* Right: the receipt prints one row per step */}
      <AbsoluteFill style={{ alignItems: 'flex-end', justifyContent: 'center', paddingRight: 140 }}>
        <Paper width={720} style={{ transform: `translateY(${(1 - head) * 600}px) rotate(1.2deg)` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, letterSpacing: 3, color: C.muted }}><span>ASSAY · TEST PLAN</span><span>6 STEPS</span></div>
          <Dashed />
          {steps.map((s, i) => {
            const p = interpolate(frame, [s.at, s.at + 10], [0, 1], { ...clamp, easing: easeOut })
            const on = i === active
            const Icon = s.icon
            const logoIn = s.logo ? interpolate(frame, [s.logo.at, s.logo.at + 12], [0, 1], { ...clamp, easing: easeOut }) : 0
            return (
              <div key={i} style={{ height: 100, display: 'flex', alignItems: 'center', gap: 20, opacity: p, transform: `translateY(${(1 - p) * -16}px)`, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: '6px -20px', borderRadius: 14, background: C.tint, opacity: on ? 1 : 0 }} />
                <div style={{ position: 'relative', width: 56, height: 56, borderRadius: 28, border: `2.5px solid ${on ? C.accent : C.input}`, display: 'grid', placeItems: 'center' }}>
                  <Icon size={28} color={on ? C.accent : C.muted} strokeWidth={2} />
                </div>
                <div style={{ position: 'relative', flex: 1 }}>
                  <div style={{ fontFamily: F.body, fontSize: 30, fontWeight: 600, color: C.text }}>{s.title}</div>
                  {s.logo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, opacity: logoIn, transform: `translateX(${(1 - logoIn) * 30}px)` }}>
                      <span style={{ fontSize: 18, color: C.muted }}>{s.logo.label}</span>
                      <Img src={staticFile(s.logo.src)} style={{ height: 26 }} />
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative', fontSize: 22, color: on ? C.accent : C.muted }}>{frame >= (steps[i + 1]?.at ?? 1e7) ? '✓' : on ? '●' : ''}</div>
              </div>
            )
          })}
        </Paper>
      </AbsoluteFill>

      {steps.map((s, i) => <Sfx key={i} at={s.at} name="print" volume={0.22} />)}
      {steps.filter(s => s.logo).map((s, i) => <Sfx key={'l' + i} at={s.logo!.at} name="pop" volume={0.45} />)}
    </Bg>
  )
}

const AGENTS = ['Baseline', 'Cheap-first', 'Evidence-gated', 'GPT Researcher']

/** "Every agent" beat: the four benchmarked agents line up, then clear for step 1. */
function AgentChips({ from, until }: { from: number; until: number }) {
  const frame = useCurrentFrame()
  const leave = interpolate(frame, [until - 6, until + 6], [0, 1], { ...clamp, easing: easeOut })
  if (frame < from - 2 || leave === 1) return null
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 22, opacity: 1 - leave, transform: `translateY(${-leave * 50}px)` }}>
      <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 72, letterSpacing: -1, lineHeight: 1.05 }}>Same test.<br />Every agent.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, width: 720 }}>
        {AGENTS.map((a, i) => {
          const p = interpolate(frame, [from + i * 4, from + i * 4 + 12], [0, 1], { ...clamp, easing: easeOut })
          return (
            <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 30, padding: '10px 22px', borderRadius: 999, background: C.card, border: `2px solid ${i === 3 ? C.input : C.accentSoft}`,
              opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
              <Bot size={28} color={i === 3 ? C.muted : C.accent} />{a}
            </div>
          )
        })}
      </div>
    </div>
  )
}
