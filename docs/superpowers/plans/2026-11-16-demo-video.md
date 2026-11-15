# Assay Demo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a 2:30, 1920×1080 demo video of Assay that mixes motion graphics with real screen footage, ElevenLabs narration, and ElevenLabs music.

**Architecture:** A standalone Remotion project in `video/`. Node scripts in `video/tools/` produce assets (narration audio with character timings, music, screen clips) into `video/public/`. Remotion scenes read one `script.ts` (narration + facts) and a generated `durations.json`, so scene lengths follow the real audio.

**Tech Stack:** Remotion 4 (React 19, TypeScript), puppeteer-core + Edge for capture, ffmpeg 9, ElevenLabs REST API (TTS with timestamps, Music), @fontsource Oxanium / Geist / Fira Code.

**Spec:** `docs/superpowers/specs/2026-11-16-demo-video-design.md`

## Global Constraints

- Output: `video/out/assay-demo.mp4`, 1920×1080, 30 fps, H.264, total 2:30 ± 5 s (4350–4650 frames).
- Voice ID `VCgLBmBjldJmfphyB8sZ`. Key from repo-root `.env` `ELEVENLABS_API_KEY`. Never print or commit the key.
- Every number on screen or in narration must match the API served from a copy of `backend/bench.db`. Never point the API at `backend/bench.db` itself.
- Brand: cream background, rust orange accent, dark brown text, read exact hex values from `web/src/index.css`. Fonts Oxanium (headings), Geist (body), Fira Code (mono).
- Logo: `artifacts/logo-options/verified-wordmark/assay-logo-color.png`, icon `assay-receipt-icon.png`. Sponsor logos: `deck/assets/tavily.png`, `deck/assets/bifrost.png`.
- Repo URL on the closing card: `github.com/HeyJudo/Assay-research`. Team names come from `TEAM` in `script.ts`. The final render is blocked while `TEAM` is empty.
- `video/public/audio/`, `video/public/clips/`, `video/out/`, `video/node_modules/` are gitignored.
- Do not modify `web/` or `backend/`. Commits have no co-author lines.

## Review Focus

- Narration audio comes back longer than the scene budget: scenes must stretch to the audio, and the total check must fail loudly, not clip speech.
- ElevenLabs returns 401/402/429 or Music is not on the plan: the tool exits non-zero with the HTTP status, and music falls back to a user-supplied `video/public/music.mp3`.
- Live run during capture errors (Gemini 429) before 10 s of footage: the capture retries once, then reports failure. It must never substitute fixture data.
- Web app in fixture mode by mistake: the capture aborts if the page shows "Sample results" or "Demo simulation".
- Captions drift from speech: captions are cut from ElevenLabs character timings, never from evenly split text.

---

### Task 1: Remotion project, brand tokens, script, facts check

**Files:**
- Create: `video/package.json`, `video/tsconfig.json`, `video/remotion.config.ts`, `video/.gitignore`
- Create: `video/src/index.ts`, `video/src/Root.tsx`, `video/src/brand.ts`, `video/src/script.ts`
- Create: `video/tools/check-facts.mjs`

**Interfaces:**
- Produces:
  - `brand.ts`: `export const C = { bg, card, text, muted, accent, accentSoft, line, danger, ok }` (hex strings from `web/src/index.css`), `export const F = { head: 'Oxanium', body: 'Geist', mono: 'Fira Code' }`.
  - `script.ts`: `export type SceneId = 'hook'|'problem'|'how'|'run'|'receipt'|'results'|'briefing'|'outro'`, `export const SCENES: { id: SceneId; text: string; minSeconds: number }[]` (narration copied verbatim from the spec table, in order), `export const FACTS` (below), `export const TEAM: string[] = []`, `export const REPO = 'github.com/HeyJudo/Assay-research'`.
  - `FACTS = { batchId: 'bench_198121eb12d0', receiptRunId: 'run_155e8837eedf', receiptSwitchSeconds: 32.7, receiptCostUsd: 0.0055, baseline: { accuracy: 0.25, costPerCorrect: 0.0053 }, cheapFirst: { costPerCorrect: 0.0061 }, evidenceGated: { accuracy: 0.17 }, gptResearcher: { accuracy: 0.42, trapResistance: 0.5 } }`.
  - Root registers composition `AssayDemo` (1920×1080, 30 fps) with a placeholder scene so `npx remotion still` works.

- [ ] **Step 1:** Create `video/package.json` with deps `remotion`, `@remotion/cli`, `@remotion/media-utils`, `react@19`, `react-dom@19`, `@fontsource/oxanium`, `@fontsource-variable/geist`, `@fontsource/fira-code`, `puppeteer-core`; dev `typescript`, `@types/react`. Scripts: `studio`, `render` (`remotion render AssayDemo out/assay-demo.mp4`), `facts`, `voice`, `capture`. Run `npm install` in `video/`.
- [ ] **Step 2:** Write `tools/check-facts.mjs`. It fetches `${API}/api/leaderboard` and `${API}/api/runs/run_155e8837eedf` (`API` env, default `http://localhost:8000`) and asserts each `FACTS` value (rounded as shown on the site: percent to whole number, cost to 4 decimals). It also asserts that Cheap-first costs `round((0.0061/0.0053 - 1)*100) = 16`% more per correct answer, and that Baseline ranks first by default. It exits 1 listing each mismatch. Read `FACTS` by importing a compiled copy or by duplicating it in a JSON file `src/facts.json` imported by both. Pick the JSON file and have `script.ts` re-export it.
- [ ] **Step 3:** Copy `backend/bench.db` to `video/.capture/bench.db` (gitignored). Start the API with `ASSAY_DB` pointed at that copy (`cd backend && ASSAY_DB=../video/.capture/bench.db uv run uvicorn assay.api:app --port 8000`). Run `npm run facts`. Expected: `facts ok`. On any mismatch, stop and report to the user. The script changes to the API value with their approval, never the reverse.
- [ ] **Step 4:** Run `npx remotion still AssayDemo out/still.png --frame=0`. Expected: PNG with the cream background and the logo, in Oxanium.
- [ ] **Step 5:** Commit `video/` (excluding gitignored) with message `Add Remotion project and facts check for demo video`.

### Task 2: Narration and music generation

**Files:**
- Create: `video/tools/voice.mjs`, `video/tools/music.mjs`
- Output (gitignored): `video/public/audio/<scene>.mp3`, `video/public/audio/<scene>.json`, `video/public/music.mp3`
- Output (committed): `video/src/durations.json`

**Interfaces:**
- Consumes: `SCENES` text (read `src/script-data.json`, which Task 1's `script.ts` re-exports. Move narration there if Task 1 kept it in TS).
- Produces: `durations.json`: `{ [sceneId]: { audioSeconds: number, frames: number } }`, where `frames = ceil(max(audioSeconds + 0.6, minSeconds) * 30)`. Per-scene alignment JSON: `{ chars: string[], start: number[], end: number[] }`.

- [ ] **Step 1:** `voice.mjs` loads `../.env`, then for each scene calls `POST https://api.elevenlabs.io/v1/text-to-speech/VCgLBmBjldJmfphyB8sZ/with-timestamps?output_format=mp3_44100_128` with `{ text, model_id: 'eleven_multilingual_v2', previous_text, next_text }` (neighbour scenes, for consistent prosody). It decodes `audio_base64` to mp3 and writes `alignment` to JSON. A scene whose text hash is unchanged is skipped (hash stored in the JSON). Non-2xx → print status + body, exit 1. Confirm the endpoint and field names with context7 (`elevenlabs`) before writing.
- [ ] **Step 2:** Run `node tools/voice.mjs`. Expected: 8 mp3 + 8 json. Listen to `hook.mp3` with `ffplay -autoexit -nodisp`.
- [ ] **Step 3:** Write `durations.json` from `ffprobe -show_entries format=duration`. Add a sum check printing total seconds. It exits 1 if total frames fall outside 4350–4650. If they do, report which scenes run long and propose script trims to the user.
- [ ] **Step 4:** `music.mjs` calls `POST https://api.elevenlabs.io/v1/music` with `{ prompt: 'Warm, modern, upbeat minimal electronic bed for a software product demo, light plucks and soft kick, no vocals, steady 110 bpm, gentle build at 0:26 and 1:35, clean ending', music_length_ms: <total ms + 3000> }` and writes `public/music.mp3`. Confirm the endpoint with context7 first. On 402/403, print `Music API not on plan: put a track at video/public/music.mp3` and exit 2.
- [ ] **Step 5:** Commit `tools/` and `durations.json` with message `Generate demo narration and music with ElevenLabs`.

### Task 3: Screen capture of the real site

**Files:**
- Create: `video/tools/capture.mjs`
- Output (gitignored): `video/public/clips/{run,receipt,results,briefing}.mp4`

**Interfaces:**
- Produces: four clips at ≥ 2560 px wide (so a 1.6× zoom stays sharp), with `clips/marks.json`: `{ [clip]: { [label]: secondsFromClipStart } }` for the moments scenes zoom on (e.g. `run.start`, `run.cut`, `receipt.switch`, `receipt.trapClaim`, `results.priorities`, `briefing.submit`, `briefing.done`).

- [ ] **Step 1:** Start services: Bifrost (`bifrost` launch config), the API from Task 1 Step 3 on the bench copy, and the web app in API mode with `VITE_RESULTS_ARE_FIXTURES=false` on port 5174. Load `/leaderboard` and assert that no text "Sample results" or "Demo simulation" appears.
- [ ] **Step 2:** Write `capture.mjs`, modeled on `deck/shoot.js` (Edge, puppeteer-core). Viewport 1280×720 at `deviceScaleFactor: 2` (2560×1440 device pixels). Use `page.screencast({ path })` per clip, then convert with ffmpeg to H.264 mp4. If screencast output is not at device resolution, switch to viewport 2560×1440, dpr 1, with CSS `zoom: 2` on `html`. Move the mouse visibly with `page.mouse.move(x, y, { steps: 25 })` before each click. Type with `{ delay: 70 }`. Record `marks.json` from `performance.now()` deltas. Do not set reduced motion: the site's own animations are wanted.
  - `run`: `/run`, tick Evidence-gated (Baseline and Cheap-first are preselected), Next, choose task `brief-maxim-ai-trap`, Next, choose trap hidden instruction, Start. Hold 12 s on Running (live), mark `run.cut`, then navigate to `/results?batch=bench_198121eb12d0&scope=batch` and hold 6 s.
  - `receipt`: open `/runs/run_155e8837eedf`, pause 2 s, scroll slowly to the model switch line (mark), then to the TRAP claim and its source quote (mark), hold 4 s.
  - `results`: `/` scroll to "What the benchmark found", hold 5 s, then `/leaderboard`, open "Rank by your priorities", raise accuracy weight until GPT Researcher is first (mark), hold 4 s.
  - `briefing`: `/briefing`, type `Tavily`, keep the default meeting time, Write the brief (mark), wait for the brief to finish (≤ 120 s), hold 5 s.
- [ ] **Step 3:** Run `node tools/capture.mjs`. Expected: four mp4s, `ffprobe` width ≥ 2560, `marks.json` has every label. If the live run shows an error state before `run.cut`, re-run the run clip once. If it fails again, stop and report. If the briefing fails twice, stop and report.
- [ ] **Step 4:** Open each clip and check that no fixture banner and no error toast is visible.
- [ ] **Step 5:** Commit `tools/capture.mjs` with message `Capture demo footage from the live site`.

### Task 4: Motion scenes (hook, problem, how it works, outro)

**Files:**
- Create: `video/src/scenes/Hook.tsx`, `Problem.tsx`, `HowItWorks.tsx`, `Outro.tsx`
- Create: `video/src/ui/Receipt.tsx` (shared paper receipt with a zig-zag bottom edge and a printing reveal)

**Interfaces:**
- Consumes: `C`, `F`, `FACTS`, `TEAM`, `REPO`. Each scene receives `{ frames: number }` from `durations.json` and must fill exactly that many frames.
- Produces: `Receipt({ lines: ReactNode[], printFrom: number, stamp?: 'TRAPPED' })`, reused by Hook, HowItWorks, and Outro.

- [ ] **Step 1:** `Receipt` prints line by line with `spring()` (damping 200) driving the translateY of a clip mask. The stamp scales from 1.4 to 1 with a slight rotation and a short shake.
- [ ] **Step 2:** `Hook`: a brief types out in the receipt. At about 45% of the scene, two lines turn danger red with the TRAPPED stamp. The receipt slides away, and the logo icon draws in and wordmark letters rise one by one, timed to "This is Assay".
- [ ] **Step 3:** `Problem`: three cards stagger in (claim with a red source, three run chips showing three different answers, a price tag with "?"). Each card's entrance aligns with its sentence. Use the scene's alignment JSON to find the start time of the words "Run" and "nobody".
- [ ] **Step 4:** `HowItWorks`: six step rows print onto a tall receipt. The camera pans down as rows print. The Tavily logo pops beside row 1 and the Bifrost logo beside row 4, timed to the words "Tavily" and "Bifrost" in the alignment.
- [ ] **Step 5:** `Outro`: the receipt prints "Don't trust the answer. Check the receipt.", then the logo, the Tavily + Bifrost lockup, `TEAM` names, and `REPO`.
- [ ] **Step 6:** Render a still at the midpoint of each scene (`npx remotion still AssayDemo out/<scene>.png --frame=N`) and view them. Expected: no text overflow, brand fonts loaded, logos crisp.
- [ ] **Step 7:** Commit with message `Add motion scenes for demo video`.

### Task 5: Screen scenes, captions, audio mix, full render

**Files:**
- Create: `video/src/ui/BrowserFrame.tsx`, `video/src/ui/Camera.tsx`, `video/src/ui/Callout.tsx`, `video/src/ui/Captions.tsx`
- Create: `video/src/scenes/ScreenScene.tsx`
- Modify: `video/src/Root.tsx` (full `<Series>` + audio)

**Interfaces:**
- Consumes: `clips/marks.json`, `durations.json`, alignment JSONs, scene components from Task 4.
- Produces: `Camera({ keys: { at: number; x: number; y: number; scale: number }[] })` interpolates with `Easing.bezier(0.65, 0, 0.35, 1)`. `Callout({ at, x, y, w, h, label, logo? })` draws a rounded highlight box plus a label chip. `Captions({ scene })` shows ≤ 7-word chunks from the alignment, positioned bottom center.

- [ ] **Step 1:** `BrowserFrame`: rounded window with a URL bar showing `localhost`, soft shadow, and a slight 3D tilt that settles to flat over the first 20 frames. Inside is `<OffthreadVideo>` with `startFrom` taken from marks so the narration lines up.
- [ ] **Step 2:** `ScreenScene` per clip, with camera keys and callouts tied to marks:
  - `run`: callout "Bifrost: budget-capped key, every call logged" with the Bifrost logo on the Running step list. At `run.cut`, a full-frame "≈ 3 minutes later" card (labeled time cut, 20 frames).
  - `receipt`: zoom 1.6× on the model switch line, then on the TRAP claim and source quote, with a red callout.
  - `results`: zoom on the findings cards, then the leaderboard reorder, callout "GPT Researcher takes #1 when accuracy matters most".
  - `briefing`: callout "Live search: Tavily" with the Tavily logo on submit. Use a speed ramp (`playbackRate` up to 4×) during the wait, labeled "sped up". Hold at normal speed on the finished brief, zoomed on Verified / Uncertain.
- [ ] **Step 3:** `Root.tsx`: `<Series>` of 8 scenes, using frames from `durations.json`. Add a 12-frame cross-fade or a receipt-tear wipe between scenes. Narration `<Audio>` per scene with a 0.3 s lead-in. Music `<Audio>` at volume 0.35, ducked to 0.12 while narration plays (volume callback from the alignment ranges), faded out over the last 2 s. Captions on all scenes.
- [ ] **Step 4:** Run `npm run render` to produce the rough cut (`TEAM` may be empty for the rough cut, which shows "Team names TBD").
- [ ] **Step 5:** Verify with `ffprobe out/assay-demo.mp4`: 1920×1080, 30 fps, duration 145–155 s, one audio stream. Extract frames at 5, 40, 80, 100, 120, 140 s (`ffmpeg -ss T -i … -frames:v 1`) and view them.
- [ ] **Step 6:** Commit with message `Compose full demo video in Remotion`.

### Task 6: User review and final render

- [ ] **Step 1:** Send the rough cut to the user. Collect notes on pacing, script, voice, and music.
- [ ] **Step 2:** Apply notes. Narration changes re-run `voice.mjs` (only changed scenes regenerate) and `check-facts`.
- [ ] **Step 3:** Fill `TEAM`. Add a guard in `Root.tsx`: if `TEAM` is empty and env `FINAL=1`, throw. Run `FINAL=1 npm run render`.
- [ ] **Step 4:** Repeat Task 5 Step 5 checks on the final file and send it to the user.
- [ ] **Step 5:** Commit with message `Final demo video render settings`.
