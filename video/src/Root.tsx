import React from 'react'
import { AbsoluteFill, Audio, Composition, Sequence, interpolate, staticFile } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { FPS, SCENES, TEAM, type SceneId } from './brand'
import durations from './durations.json'
import { Hook } from './scenes/Hook'
import { Problem } from './scenes/Problem'
import { HowItWorks } from './scenes/HowItWorks'
import { Outro } from './scenes/Outro'
import { BriefingScene, ReceiptScene, ResultsScene, RunScene } from './scenes/screens'
import { Captions } from './ui/Captions'
import { LEAD, words } from './ui/kit'

declare const process: { env: Record<string, string | undefined> }
const D = durations as Record<SceneId, { audioSeconds: number; frames: number }>
const SCENE: Record<SceneId, React.FC> = {
  hook: Hook, problem: Problem, how: HowItWorks, run: RunScene, receipt: ReceiptScene, results: ResultsScene, briefing: BriefingScene, outro: Outro,
}

/** Frames each scene overlaps the next (crossfade). */
export const TRANSITION = 12
const starts: Record<string, number> = {}
SCENES.reduce((at, s) => { starts[s.id] = at; return at + D[s.id].frames - TRANSITION }, 0)
export const TOTAL = SCENES.reduce((n, s) => n + D[s.id].frames, 0) - TRANSITION * (SCENES.length - 1)

// Global frame ranges where narration is speaking, for music ducking.
const speech = SCENES.map(s => {
  const ws = words(s.id)
  return [starts[s.id] + (LEAD + ws[0][1]) * FPS, starts[s.id] + (LEAD + ws[ws.length - 1][2]) * FPS] as const
})
function musicVolume(f: number) {
  const near = speech.some(([a, b]) => f > a - 8 && f < b + 10)
  const duck = speech.reduce((v, [a, b]) => Math.max(v, interpolate(f, [a - 10, a, b, b + 14], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })), 0)
  const fadeIn = interpolate(f, [0, 20], [0, 1], { extrapolateRight: 'clamp' })
  const fadeOut = interpolate(f, [TOTAL - 60, TOTAL], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (near ? 0.34 - 0.22 * duck : 0.34) * fadeIn * fadeOut
}

function Demo() {
  if (process.env.REMOTION_FINAL === '1' && !TEAM.length) throw new Error('Final render blocked: fill "team" in src/script-data.json')
  return (
    <AbsoluteFill>
      <TransitionSeries>
        {SCENES.flatMap((s, i) => {
          const Scene = SCENE[s.id]
          const seq = (
            <TransitionSeries.Sequence key={s.id} durationInFrames={D[s.id].frames} name={s.id}>
              <Scene />
              <Sequence from={Math.round(LEAD * FPS)} layout="none"><Audio src={staticFile(`audio/${s.id}.mp3`)} /></Sequence>
              <Captions scene={s.id} />
            </TransitionSeries.Sequence>
          )
          return i === 0 ? [seq] : [<TransitionSeries.Transition key={s.id + '-t'} presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />, seq]
        })}
      </TransitionSeries>
      <Audio src={staticFile('music.mp3')} volume={musicVolume} />
    </AbsoluteFill>
  )
}

export function Root() {
  return <Composition id="AssayDemo" component={Demo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
}
