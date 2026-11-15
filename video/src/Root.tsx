import React from 'react'
import { AbsoluteFill, Composition, Series } from 'remotion'
import { C, F, FPS, SCENES, type SceneId } from './brand'
import durations from './durations.json'
import { Hook } from './scenes/Hook'
import { Problem } from './scenes/Problem'
import { HowItWorks } from './scenes/HowItWorks'
import { Outro } from './scenes/Outro'

const D = durations as Record<SceneId, { audioSeconds: number; frames: number }>

function Todo({ id }: { id: string }) {
  return <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center', fontFamily: F.head, fontSize: 80, color: C.muted }}>{id}</AbsoluteFill>
}

const SCENE: Partial<Record<SceneId, React.FC>> = { hook: Hook, problem: Problem, how: HowItWorks, outro: Outro }

function Demo() {
  return (
    <Series>
      {SCENES.map(s => {
        const Scene = SCENE[s.id]
        return <Series.Sequence key={s.id} durationInFrames={D[s.id].frames} name={s.id}>{Scene ? <Scene /> : <Todo id={s.id} />}</Series.Sequence>
      })}
    </Series>
  )
}

export const TOTAL = SCENES.reduce((n, s) => n + D[s.id].frames, 0)

export function Root() {
  return <Composition id="AssayDemo" component={Demo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
}
