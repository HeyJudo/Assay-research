// node tools/elevenlabs.mjs voice|sfx|music
// Generates narration (with character timings), sound effects and the music bed into public/.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const env = Object.fromEntries(fs.readFileSync(new URL('../.env', root), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]))
const KEY = env.ELEVENLABS_API_KEY
if (!KEY) { console.error('ELEVENLABS_API_KEY missing in .env'); process.exit(1) }
const VOICE = 'T2sZgOl8ol4kf4u6yM2z' // David - Real and Laid Back (library voice)
const MODEL = process.env.TTS_MODEL ?? 'eleven_v4'
const VOICE_SETTINGS = { speed: 1.0, stability: 0.5, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true }
const data = JSON.parse(fs.readFileSync(new URL('src/script-data.json', root)))
const out = p => { const u = new URL('public/' + p, root); fs.mkdirSync(new URL('.', u), { recursive: true }); return u }

async function call(path, body) {
  const r = await fetch('https://api.elevenlabs.io' + path, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) { const t = await r.text(); const e = new Error(`${path} → HTTP ${r.status}: ${t.slice(0, 400)}`); e.status = r.status; throw e }
  return r
}
const seconds = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fileURLToPath(file)]).toString())

async function voice() {
  const scenes = data.scenes, durations = {}
  for (const [i, s] of scenes.entries()) {
    const hash = crypto.createHash('sha1').update(VOICE + MODEL + JSON.stringify(VOICE_SETTINGS) + s.text).digest('hex')
    const jsonFile = out(`audio/${s.id}.json`), mp3 = out(`audio/${s.id}.mp3`)
    const old = fs.existsSync(jsonFile) && JSON.parse(fs.readFileSync(jsonFile))
    if (old?.hash !== hash || !fs.existsSync(mp3)) {
      const r = await call(`/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
        text: s.text, model_id: MODEL, voice_settings: VOICE_SETTINGS,
        previous_text: scenes[i - 1]?.text, next_text: scenes[i + 1]?.text,
      })
      const j = await r.json()
      fs.writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'))
      const a = j.alignment
      if (!a?.characters?.length) throw new Error(`no timestamps from ${MODEL}`)
      fs.writeFileSync(jsonFile, JSON.stringify({ hash, chars: a.characters, start: a.character_start_times_seconds, end: a.character_end_times_seconds }))
      console.log('voice', s.id)
    }
    const audioSeconds = seconds(mp3)
    durations[s.id] = { audioSeconds, frames: Math.ceil((0.4 + audioSeconds + 0.6 + (s.holdSeconds ?? 0)) * 30) }
  }
  fs.writeFileSync(new URL('src/durations.json', root), JSON.stringify(durations, null, 2) + '\n')
  // Word timings for animation cues and captions: { scene: [[word, start, end], ...] }
  const timing = {}
  for (const s of scenes) {
    const a = JSON.parse(fs.readFileSync(out(`audio/${s.id}.json`))), words = []
    let w = null
    a.chars.forEach((ch, i) => {
      if (/\s/.test(ch)) { if (w) words.push(w); w = null; return }
      if (!w) w = [ch, a.start[i], a.end[i]]; else { w[0] += ch; w[2] = a.end[i] }
    })
    if (w) words.push(w)
    timing[s.id] = words.map(([t, b, e]) => [t, +b.toFixed(3), +e.toFixed(3)])
  }
  fs.writeFileSync(new URL('src/timing.json', root), JSON.stringify(timing) + '\n')
  const total = Object.values(durations).reduce((n, d) => n + d.frames, 0)
  for (const [id, d] of Object.entries(durations)) console.log(id.padEnd(9), d.audioSeconds.toFixed(2) + 's audio', (d.frames / 30).toFixed(2) + 's scene')
  console.log('total', (total / 30).toFixed(2) + 's', total, 'frames')
  if (total < 3624 || total > 4734) { console.error("TOTAL OUT OF RANGE: 1:58–2:35 after 84 transition frames"); process.exit(1) }
}

const SFX = {
  whoosh: ['Soft airy swoosh transition, clean, modern UI motion graphics', 0.8],
  print: ['Small thermal receipt printer printing a short burst, crisp mechanical', 1.6],
  stamp: ['Rubber stamp hitting paper on a desk, single firm thud', 0.6],
  pop: ['Soft subtle UI pop, bubbly, clean, minimal', 0.5],
  click: ['Single crisp mouse click', 0.5],
  type: ['Light keyboard typing, a few quick keystrokes, laptop keyboard', 1.5],
  chime: ['Gentle bright success chime, two notes, warm, minimal UI notification', 1.2],
  riser: ['Short soft cinematic riser building tension then stopping, subtle', 1.8],
  error: ['Short low soft error buzz, UI warning, subtle, not harsh', 0.6],
}
async function sfx() {
  for (const [name, [text, duration_seconds]] of Object.entries(SFX)) {
    const file = out(`sfx/${name}.mp3`)
    if (fs.existsSync(file)) continue
    const r = await call('/v1/sound-generation?output_format=mp3_44100_128', { text, duration_seconds, prompt_influence: 0.6 })
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
    console.log('sfx', name)
  }
}

async function music() {
  const d = JSON.parse(fs.readFileSync(new URL('src/durations.json', root)))
  const ms = Math.round(Object.values(d).reduce((n, x) => n + x.frames, 0) / 30 * 1000) + 3000
  try {
    const r = await call('/v1/music', {
      prompt: 'Warm, modern, upbeat minimal electronic background bed for a software product demo video. Light plucked synths, soft kick, airy pads, steady 110 bpm, optimistic and focused. Gentle lift around 26 seconds and again around 95 seconds, calm clean ending. Instrumental, mixed low to sit under a voiceover.',
      music_length_ms: ms, force_instrumental: true,
    })
    fs.writeFileSync(out('music.mp3'), Buffer.from(await r.arrayBuffer()))
    console.log('music', ms, 'ms')
  } catch (e) {
    if (e.status === 402 || e.status === 403 || e.status === 401) { console.error(e.message + '\nMusic API not on plan: put a track at video/public/music.mp3'); process.exit(2) }
    throw e
  }
}

const cmd = process.argv[2]
await ({ voice, sfx, music }[cmd] ?? (() => { console.error('usage: voice|sfx|music'); process.exit(1) }))()
