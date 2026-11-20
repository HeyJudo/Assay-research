import { FPS, type SceneId } from '../brand'
import marks from '../../public/clips/marks.json'
import durations from '../durations.json'
import { Screen } from '../ui/Screen'
import { cue } from '../ui/kit'

// Scene seconds where a spoken word starts. Coordinates below are CSS px of the 1440x810 page, measured from clip frames.
const w = (s: SceneId, word: string, nth = 0) => cue(s, word, nth) / FPS
const len = (s: SceneId) => (durations as Record<SceneId, { frames: number }>)[s].frames / FPS
const M = marks as Record<'run' | 'receipt' | 'results' | 'briefing', Record<string, number>>

export function RunScene() {
  const m = M.run, S = 'run' as const
  // Agent list is on screen until ~7.3 s of the clip (Next clicked), not until m.task.
  const agentsEnd = 7.3
  const task = w(S, 'meeting-brief') - 0.1, trap = w(S, 'trap') - 0.1, start = w(S, 'each') - 0.2, live = start + 0.8
  const cut = w(S, 'few') - 0.2, after = cut + 0.3
  return (
    <Screen clip="run" url="localhost · Assay / Run" step={0} enter
      segments={[
        { from: 2, to: agentsEnd, at: 0, dur: task },
        { from: agentsEnd, to: m.trap - 0.2, at: task, dur: trap - task },
        { from: m.trap - 0.2, to: m.start + 0.4, at: trap, dur: start - trap },
        { from: m.start + 0.4, to: m.running + 0.5, at: start, dur: live - start },
        { from: m.running + 0.5, to: m.live, at: live, dur: after - live },
        { from: m.results - 0.2, to: m.results - 0.2 + len(S) - after, at: after, dur: len(S) - after },
      ]}
      cams={[
        { at: 0, x: 712, y: 330, z: 1.45 },
        { at: task, x: 700, y: 330, z: 1.3 },
        { at: start, x: 720, y: 405, z: 1, ms: 700 },
        { at: w(S, 'every') - 0.5, x: 1070, y: 560, z: 1.6 },
        { at: after, x: 720, y: 560, z: 1.1, ms: 10 },
      ]}
      rings={[
        { at: w(S, 'pick'), until: task - 0.1, x: 378, y: 128, w: 667, h: 316 },
        { at: w(S, 'hidden'), until: start - 0.1, x: 826, y: 68, w: 218, h: 112, tone: 'bad' },
        { at: w(S, 'every') - 0.1, until: cut - 0.1, x: 860, y: 320, w: 425, h: 380 },
        { at: w(S, 'all'), until: len(S) - 0.4, x: 262, y: 492, w: 422, h: 172, tone: 'bad' },
      ]}
      cut={{ at: cut - 0.3, text: '≈ 3 MIN LATER · SAVED BATCH' }}
    />
  )
}

export function ReceiptScene() {
  const m = M.receipt, S = 'receipt' as const
  const claims = w(S, "here's") - 0.25
  return (
    <Screen clip="receipt" url="localhost · Assay / Receipt · run_155e8837eedf" step={1}
      covers={[{ x: 0, y: 44, w: 916, h: 766 }]}
      segments={[
        { from: 1.2, to: m.switch + 0.6, at: 0, dur: claims },
        { from: m.trapClaim + 0.3, to: m.trapClaim + 0.3 + len(S) - claims, at: claims, dur: len(S) - claims },
      ]}
      cams={[
        { at: 0, x: 720, y: 405, z: 1 },
        { at: w(S, 'receipt') - 0.2, x: 1180, y: 300, z: 1.55 },
        { at: w(S, 'switched') - 0.4, x: 1180, y: 520, z: 1.5 },
        { at: claims, x: 1180, y: 260, z: 1.5, ms: 400 },
      ]}
      rings={[
        { at: w(S, 'switched'), until: w(S, 'spent') - 0.1, x: 1000, y: 462, w: 362, h: 66 },
        { at: w(S, 'spent'), until: claims - 0.1, x: 1000, y: 716, w: 362, h: 56 },
        { at: w(S, 'false'), until: w(S, 'planted') - 0.2, x: 1030, y: 14, w: 360, h: 90, tone: 'bad' },
        { at: w(S, 'planted'), until: len(S) - 0.3, x: 1030, y: 104, w: 360, h: 140, tone: 'bad' },
      ]}
    />
  )
}

export function ResultsScene() {
  const m = M.results, S = 'results' as const
  const lb = w(S, 'evidence-gated') - 0.4, drag = w(S, 'weigh') - 0.2, after = drag + 3
  return (
    <Screen clip="results" url="localhost · Assay / Leaderboard" step={2}
      segments={[
        { from: m.findings - 0.7, to: m.leaderboard - 0.3, at: 0, dur: lb },
        { from: m.leaderboard, to: m.priorities - 0.2, at: lb, dur: drag - lb },
        { from: m.priorities - 0.2, to: m.reordered + 1, at: drag, dur: after - drag },
        { from: m.reordered + 1, to: m.reordered + 1 + len(S) - after, at: after, dur: len(S) - after },
      ]}
      cams={[
        { at: 0, x: 720, y: 400, z: 1 },
        { at: w(S, 'cheap-first') - 0.4, x: 720, y: 230, z: 1.2 },
        { at: lb, x: 865, y: 400, z: 1.35, ms: 600 },
        { at: drag, x: 720, y: 330, z: 1.2 },
      ]}
      rings={[
        { at: w(S, 'cheap-first'), until: lb - 0.1, x: 728, y: 64, w: 568, h: 152 },
        { at: w(S, 'evidence-gated'), until: w(S, 'our') - 0.1, x: 440, y: 548, w: 856, h: 68, tone: 'bad' },
        { at: w(S, 'baseline'), until: drag - 0.1, x: 440, y: 306, w: 856, h: 70 },
        { at: w(S, 'weigh'), until: after - 0.1, x: 140, y: 205, w: 265, h: 70 },
        { at: after, until: len(S) - 0.3, x: 440, y: 345, w: 856, h: 66 },
      ]}
    />
  )
}

export function BriefingScene() {
  const m = M.briefing, S = 'briefing' as const
  const submit = w(S, 'the', 0) - 0.1, done = w(S, 'writes') - 0.2, scroll = w(S, "what's") - 0.3
  return (
    <Screen clip="briefing" url="localhost · Assay / Briefing Agent" step={3}
      segments={[
        { from: 1, to: m.submit + 0.5, at: 0, dur: submit },
        { from: m.submit + 0.5, to: m.done, at: submit, dur: done - submit },
        { from: m.done, to: m.done + 2.7, at: done, dur: scroll - done },
        { from: m.done + 2.7, to: m.sections, at: scroll, dur: 0.4 },
        { from: m.sections, to: m.sections + len(S) - scroll - 0.4, at: scroll + 0.4, dur: len(S) - scroll - 0.4 },
      ]}
      cams={[
        { at: 0, x: 300, y: 420, z: 1.35 },
        { at: submit, x: 720, y: 400, z: 1.1 },
        { at: done, x: 896, y: 340, z: 1.6, ms: 700 },
      ]}
      rings={[
        { at: w(S, 'ship'), until: w(S, 'enter') - 0.1, x: 140, y: 535, w: 307, h: 52 },
        { at: w(S, 'enter'), until: submit - 0.1, x: 140, y: 300, w: 307, h: 170 },
        { at: w(S, 'tavily') - 0.6, until: done - 0.1, x: 140, y: 722, w: 310, h: 38 },
        { at: w(S, 'verified'), until: scroll, x: 524, y: 218, w: 744, h: 240 },
        { at: scroll + 0.5, until: w(S, 'what') - 0.1, x: 524, y: 102, w: 744, h: 115 },
        { at: w(S, 'what'), until: w(S, 'questions') - 0.1, x: 524, y: 238, w: 744, h: 108 },
        { at: w(S, 'questions'), until: len(S) - 0.3, x: 524, y: 374, w: 744, h: 148 },
      ]}
    />
  )
}
