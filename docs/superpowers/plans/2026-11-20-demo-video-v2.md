# Demo video v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-cut `video/out/assay-demo.mp4` as a builder story (Test → Inspect → Decide → Ship) with a new voice, no silent holds, clean framing and one text layer.

**Architecture:** Same Remotion project in `video/`. Narration text lives in `src/script-data.json`; `tools/elevenlabs.mjs voice` writes audio, `durations.json` and `timing.json`; scenes cue off spoken words via `cue()`/`w()`. Screen scenes reuse the existing clips and `marks.json`.

**Tech Stack:** Remotion 4.0.543, `@remotion/transitions` 4.0.543 (new), ElevenLabs TTS, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-20-demo-video-v2-design.md`

## Global Constraints

- 1920×1080, 30 fps, H.264 yuv420p, total 2:15–2:35.
- Scene length = 0.4 s lead + narration + 0.6 s tail. Outro is the only scene with an extra ~3 s hold.
- Voice `T2sZgOl8ol4kf4u6yM2z`, model `eleven_v4` (fallback `eleven_multilingual_v2` if no timestamps), speed 1.0, stability 0.5, similarity_boost 0.75, style 0.1, use_speaker_boost true.
- Numbers only from `script-data.json` facts (PRD §9). No "$0.3521".
- Camera zoom ≤ 1.6, whole component framed with ≥ 40 px padding. Camera moves 700–1000 ms, ≥ 1.5 s apart.
- Easing: camera `ease` = bezier(0.65,0,0.35,1); entries `easeOut` = bezier(0.16,1,0.3,1).
- Team: "Legendary Birds": Jude Sangalang, Harvey Buenaventura, Krystelle Eledia.
- No web app or backend changes. No co-author lines in commits.

## Review Focus

- A cue word missing from new narration → `cue()` throws at render. Every `w()`/`cue()` word must exist in the new text (render the Studio still per scene to catch it).
- Narration longer than a fixed segment plan → clip runs out and freezes. Segment `dur` sums must equal scene length (they derive from `len()`, keep that).
- Transitions overlap scenes, which shortens total length by the overlap. Account for it in the length check.
- Captions overlap the flow tracker or ring. Captions stay bottom, tracker top.
- `eleven_v4` returns no `alignment` → captions vanish. The voice tool must fail loudly, not write empty timing.

---

### Task 1: Voice and script

**Files:** Modify `video/tools/elevenlabs.mjs`, `video/src/script-data.json`. Create `video/tools/check-timing.mjs`.

- [ ] **Step 1:** Add the library voice to the account: `POST /v1/voices/add/{public_owner_id}/T2sZgOl8ol4kf4u6yM2z` with `{ "new_name": "David - Assay" }`. Record the returned `voice_id` (may differ from the library id) in `VOICE`.
- [ ] **Step 2:** Set `VOICE_SETTINGS` and model per Global Constraints. If the response lacks `alignment`, throw `Error('no timestamps from <model>')`.
- [ ] **Step 3:** Generate a sample (hook text only) to `public/audio/sample.mp3`. Stop and get user approval of the voice.
- [ ] **Step 4:** Replace the 8 scene `text` values with the spec script verbatim. Set `team` to `["Jude Sangalang","Harvey Buenaventura","Krystelle Eledia"]`, add `"teamName": "Legendary Birds"`. Drop `minSeconds` from all scenes except outro (`"holdSeconds": 3`).
- [ ] **Step 5:** In `voice()`, frames = `Math.ceil((0.4 + audioSeconds + 0.6 + (s.holdSeconds ?? 0)) * 30)`.
- [ ] **Step 6:** Write `tools/check-timing.mjs`: for every scene assert `frames/30 - 0.4 - audioSeconds - (holdSeconds ?? 0) <= 0.7`, and print the total. Add `"timing": "node tools/check-timing.mjs"` to package.json.
- [ ] **Step 7:** Run `npm run voice` then `npm run timing`. Expected: `timing ok`, total printed.
- [ ] **Step 8:** Commit `Switch demo narration to the builder story and new voice`.

### Task 2: Transitions, pacing and shared UI

**Files:** Modify `video/src/Root.tsx`, `video/src/ui/Screen.tsx`, `video/src/brand.ts`. Create `video/src/ui/FlowTracker.tsx`.

**Produces:** `FlowTracker({ step: 0|1|2|3 })`; `Screen` props gain `step` and `rings?: Ring[]` where `Ring = { at: number; until: number; x: number; y: number; w: number; h: number }` in clip CSS px; `label` and `facts` props removed.

- [ ] **Step 1:** `npm i @remotion/transitions@4.0.543`.
- [ ] **Step 2:** Replace `Series` with `TransitionSeries`, 12-frame `fade()` between scenes (`slide()` into and out of the screen block). Total = sum(frames) − 7×12; export it as `TOTAL` and use it for music fade.
- [ ] **Step 3:** `FlowTracker`: four pills "Test → Inspect → Decide → Ship" centered above the window, current filled accent, done ones checked, springs in. Replace the dark label badge.
- [ ] **Step 4:** Remove `FactChip` usage. Add `Ring`: 3 px accent outline, 12 px radius, soft glow, drawn in clip coordinates inside the zoomed layer, fades in/out with `easeOut`.
- [ ] **Step 5:** Clamp `cam.z` to 1.6 in `camAt`.
- [ ] **Step 6:** `npx tsc --noEmit` passes. Commit `Add scene transitions, flow tracker and focus rings`.

### Task 3: Screen scenes

**Files:** Modify `video/src/scenes/screens.tsx`.

**Consumes:** Task 2 `Screen` props; new narration cue words from Task 1.

- [ ] **Step 1:** Re-time each scene's `segments`, `cams` and `rings` to the new words (run: "pick", "trap", "live", "later"; receipt: "receipt", "switched", "spent", "claim", "planted"; results: "ranking", "cheap-first", "evidence-gated", "baseline", "weigh"; briefing: "ship", "enter", "tavily", "verified", "questions"). Keep the 3× badge and the "≈ 3 MIN LATER · SAVED BATCH" cut card.
- [ ] **Step 2:** Pick framings per Global Constraints. Render stills at each cam key (`npx remotion still AssayDemo --frame=N`) and check no text is cut at the window edge.
- [ ] **Step 3:** Commit `Re-time screen scenes to the builder story`.

### Task 4: Motion scenes

**Files:** Modify `video/src/scenes/Hook.tsx`, `Problem.tsx`, `HowItWorks.tsx`, `Outro.tsx`.

- [ ] **Step 1:** Hook: after the TRAPPED stamp, three tags "v1 Baseline / v2 Cheap-first / v3 Evidence-gated" pop in with "?" on "smarter", logo on "Assay".
- [ ] **Step 2:** Problem: price card shows "$ ?" (no number). Re-cue cards to "twice", "planted", "cost".
- [ ] **Step 3:** HowItWorks: left panel swaps per step (large lucide icon, one line, Tavily logo on freeze, Bifrost on record), entering with `easeOut`. Add a 7th line "Any agent joins. No code changes." on "join".
- [ ] **Step 4:** Outro: logo, Tavily + Bifrost lockup, "Team Legendary Birds" then three names, repo URL. Content fully visible ≥ 3 s.
- [ ] **Step 5:** `npx tsc --noEmit`, Studio check each scene. Commit `Rework motion scenes for v2`.

### Task 5: Verify and render

- [ ] **Step 1:** Start the API on a copy of `backend/bench.db` (as in v1), run `npm run facts`. Expected `facts ok`.
- [ ] **Step 2:** `REMOTION_FINAL=1 npm run render`, then `ffprobe` duration within 135–155 s.
- [ ] **Step 3:** Contact sheet at 1 frame / 2 s (`ffmpeg -vf fps=1/2,scale=480:-1,tile=6x13`). Check: no cropped text, no frame without motion or speech > 1 s except the outro, captions clear of tracker.
- [ ] **Step 4:** User reviews the cut. Commit `Render demo video v2`.
