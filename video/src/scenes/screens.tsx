import { FPS, type SceneId } from '../brand'
import marks from '../../public/clips/marks.json'
import durations from '../durations.json'
import { Screen } from '../ui/Screen'
import { cue } from '../ui/kit'

// Scene seconds where a spoken word starts.
const w = (s: SceneId, word: string, nth = 0) => cue(s, word, nth) / FPS
const len = (s: SceneId) => (durations as Record<SceneId, { frames: number }>)[s].frames / FPS
const M = marks as Record<'run' | 'receipt' | 'results' | 'briefing', Record<string, number>>

export function RunScene() {
  const m = M.run
  const live = 13, cut = 19
  return (
    <Screen clip="run" url="localhost · Assay / Run" label="LIVE BENCHMARK"
      segments={[
        { from: 2, to: m.start + 0.4, at: 0, dur: 9 },
        { from: m.start + 0.4, to: m.running + 1.2, at: 9, dur: 2 },
        { from: m.running + 1.2, to: m.live - 0.3, at: 11, dur: 2 },
        { from: m.live - 0.3, to: m.cut, at: live, dur: cut - live },
        { from: m.results - 0.2, to: m.results + 6.5, at: cut, dur: len('run') - cut },
      ]}
      cams={[
        { at: 0, x: 720, y: 380, z: 1.3 },
        { at: 9, x: 720, y: 405, z: 1, ms: 700 },
        { at: live + 0.2, x: 1084, y: 430, z: 1.6 },
        { at: w('run', "bifrost's") - 0.3, x: 1000, y: 200, z: 1.5 },
        { at: cut + 0.6, x: 430, y: 520, z: 1.65, ms: 10 },
      ]}
      facts={[
        { at: w('run', 'hidden'), until: 9.6, text: 'Trap: hidden instruction', tone: 'bad' },
        { at: w('run', 'each', 0), until: 12.8, text: '3 agents × 3 repeats = 9 runs' },
        { at: w('run', "bifrost's") - 0.4, until: cut, text: 'Costs from Bifrost logs', logo: 'brand/bifrost.png' },
        { at: w('run', 'all'), until: 24, text: '9 of 9 runs fell for the trap', tone: 'bad' },
      ]}
      cut={{ at: cut - 0.6, text: '≈ 3 MIN LATER · SAVED BATCH' }}
    />
  )
}

export function ReceiptScene() {
  const m = M.receipt
  const scroll = 12
  return (
    <Screen clip="receipt" url="localhost · Assay / Receipt · run_155e8837eedf" label="RUN RECEIPT"
      segments={[
        { from: 1.6, to: m.trapClaim - 1.1, at: 0, dur: scroll },
        { from: m.trapClaim - 1.1, to: m.trapClaim + 8.5, at: scroll, dur: len('receipt') - scroll },
      ]}
      cams={[
        { at: 0, x: 1165, y: 430, z: 1.25 },
        { at: w('receipt', 'what', 0) - 0.2, x: 1170, y: 470, z: 1.7 },
        { at: w('receipt', 'switched') - 0.3, x: 1180, y: 470, z: 2.1 },
        { at: w('receipt', 'spent') - 0.2, x: 1170, y: 700, z: 2 },
        { at: w('receipt', 'fell') - 0.2, x: 1100, y: 330, z: 2 },
        { at: scroll + 0.1, x: 1170, y: 150, z: 1.7 },
        { at: w('receipt', 'planted') - 0.3, x: 1170, y: 210, z: 2.1 },
      ]}
      facts={[
        { at: w('receipt', 'switched'), until: w('receipt', 'spent') - 0.2, text: 'Switched models at 32.7 s' },
        { at: w('receipt', 'spent'), until: w('receipt', 'fell') - 0.2, text: 'Total $0.0055 · 11,769 tokens' },
        { at: w('receipt', 'fell'), until: scroll, text: 'Fell for the planted trap', tone: 'bad' },
        { at: w('receipt', 'planted'), until: 23, text: 'Source: the planted page', tone: 'bad' },
      ]}
    />
  )
}

export function ResultsScene() {
  const m = M.results
  const lb = 7.2, drag = w('results', 'weigh') - 0.2
  return (
    <Screen clip="results" url="localhost · Assay / Leaderboard" label="MEASURED RESULTS"
      segments={[
        { from: m.findings - 0.7, to: m.leaderboard - 0.6, at: 0, dur: lb },
        { from: m.leaderboard, to: m.priorities - 0.3, at: lb, dur: drag - lb },
        { from: m.priorities - 0.3, to: m.reordered + 1, at: drag, dur: 5.9 },
        { from: m.reordered + 1, to: m.reordered + 7.5, at: drag + 5.9, dur: len('results') - drag - 5.9 },
      ]}
      cams={[
        { at: 0, x: 720, y: 240, z: 1.2 },
        { at: w('results', 'cheap-first') - 0.3, x: 1012, y: 140, z: 1.8 },
        { at: lb, x: 860, y: 420, z: 1.2, ms: 10 },
        { at: w('results', 'evidence-gated') - 0.1, x: 860, y: 578, z: 1.7 },
        { at: w('results', 'baseline') - 0.2, x: 760, y: 160, z: 1.7 },
        { at: drag, x: 330, y: 300, z: 1.6 },
        { at: w('results', 'gpt') - 0.3, x: 860, y: 300, z: 1.4 },
      ]}
      facts={[
        { at: w('results', 'cheap-first'), until: w('results', 'evidence-gated') - 0.2, text: 'Cheap-first: +16% cost per correct' },
        { at: w('results', 'evidence-gated'), until: w('results', 'baseline') - 0.2, text: 'Evidence-gated: 17% accuracy', tone: 'bad' },
        { at: w('results', 'baseline'), until: drag, text: 'Baseline wins by default', tone: 'ok' },
        { at: w('results', 'gpt'), until: 23, text: 'Accuracy first → GPT Researcher (42%)' },
      ]}
    />
  )
}

export function BriefingScene() {
  const m = M.briefing
  const wait = 4.4, done = 7.6, scrollAt = 11.3
  return (
    <Screen clip="briefing" url="localhost · Assay / Briefing Agent" label="BRIEFING AGENT · LIVE"
      segments={[
        { from: 1.5, to: m.submit + 0.5, at: 0, dur: wait },
        { from: m.submit + 0.5, to: m.done, at: wait, dur: done - wait },
        { from: m.done, to: m.done + 2.4, at: done, dur: scrollAt - done },
        { from: m.done + 2.4, to: m.sections, at: scrollAt, dur: 1.1 },
        { from: m.sections, to: m.sections + len('briefing') - scrollAt - 1.1, at: scrollAt + 1.1, dur: len('briefing') - scrollAt - 1.1 },
      ]}
      cams={[
        { at: 0, x: 300, y: 360, z: 1.55 },
        { at: wait, x: 860, y: 330, z: 1.15 },
        { at: w('briefing', 'verified') - 0.4, x: 890, y: 340, z: 1.6 },
        { at: scrollAt + 0.4, x: 890, y: 170, z: 1.6, ms: 500 },
        { at: w('briefing', "couldn't") - 0.2, x: 890, y: 270, z: 1.6 },
        { at: w('briefing', 'open') - 0.2, x: 890, y: 430, z: 1.6 },
      ]}
      facts={[
        { at: w('briefing', 'tavily') - 0.4, until: done + 0.6, text: 'Live search: last 30 days', logo: 'brand/tavily.png' },
        { at: done + 0.3, until: w('briefing', 'verified') - 0.2, text: 'Written in 21.3 s · $0.0028', tone: 'ok' },
      ]}
    />
  )
}
