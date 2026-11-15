import '@fontsource/oxanium/500.css'
import '@fontsource/oxanium/700.css'
import '@fontsource-variable/geist'
import '@fontsource/fira-code/400.css'
import '@fontsource/fira-code/500.css'
import data from './script-data.json'

// Hex values copied from web/src/index.css :root.
export const C = {
  bg: '#FDFBF7', card: '#FFFFFF', text: '#4A3B33', muted: '#6b645c', accent: '#B45309', accentDark: '#92400E',
  accentSoft: '#F2DABA', tint: '#FBF0DD', secondary: '#F1E9DA', line: '#E4D9BC', input: '#D6C8A4', ring: '#D98A4A',
  ok: '#2f5c44', okBg: '#E3EFE8', danger: '#991B1B', dangerBg: '#F6DEDC',
}
export const F = { head: 'Oxanium, sans-serif', body: '"Geist Variable", sans-serif', mono: '"Fira Code", monospace' }
export const FPS = 30
export type SceneId = 'hook' | 'problem' | 'how' | 'run' | 'receipt' | 'results' | 'briefing' | 'outro'
export const SCENES = data.scenes as { id: SceneId; text: string; minSeconds: number }[]
export const FACTS = data.facts
export const TEAM: string[] = data.team
export const REPO = data.repo
