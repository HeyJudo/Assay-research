# Assay demo video v2: design

Revises `2026-11-16-demo-video-design.md`. Same Remotion project in `video/`, same captured clips, new story, voice and pacing.

## Intent

A judge watching once, possibly muted, should understand what Assay is, see it work, and see one real finding. v1 toured features with no user goal, held frames while nothing was said, cropped the UI badly when zooming, and showed the same words twice (captions plus callouts).

## Story (decided: builder)

"We made our research agent smarter. Is v2 actually better?" Test → Inspect → Decide → Ship. The finding (both upgrades lost to Baseline) is the plot, and shipping Baseline in the Briefing Agent ties in PS05.

## Goals

- 2:15 to 2:35, 1920×1080, 30 fps, H.264 yuv420p, `video/out/assay-demo.mp4`.
- No silent holds: every scene ends ≤ 0.8 s after its narration.
- Covers every judging criterion (innovation, technical execution, impact, use of AI, UX, scalability) and the PS02/PS05 hard requirements shown in the table below.
- Motion that matches the site (palette, fonts, logo already in `brand.ts`).

## Non-goals

- No web app or backend changes. No re-capture: the existing clips already contain every step (`marks.json`), including agent selection.
- No vertical cut, no second language.

## Anti-goals

- Any number not from recorded runs (PRD §9). v1's "$0.3521" problem card is removed and replaced with "$ ?".
- Hiding that our versions lost.
- Saying "Baseline wins" and then showing a different winner without saying why.

## Approaches

| Approach | Trade-off |
|---|---|
| **A. Rework existing Remotion project (picked)** | Reuses clips, scenes and pipeline. Fixes are code edits. |
| B. Full rebuild from one continuous recording | Smoother capture, but redoes every scene, and needs the live stack and Gemini quota again. |

## Voice

- ElevenLabs library voice `T2sZgOl8ol4kf4u6yM2z` ("David – Real and Laid Back", US male, casual, verified on `eleven_v4`). Add it to the account first (API currently returns `voice_not_found`).
- Settings: model `eleven_v4`, speed 1.0, stability 0.5, similarity_boost 0.75, style 0.1, use_speaker_boost true.
- User approves a 2-line sample before the full run. If `eleven_v4` has no word timestamps, fall back to `eleven_multilingual_v2` with the same voice (captions and cues need timestamps).

## Script (~330 words, target ~150 wpm)

| Scene | Visual | Narration |
|---|---|---|
| hook (motion) | Brief card types out, lines flip to TRAPPED, three version tags v1/v2/v3 with "?", logo assembles | "We built an AI agent that writes meeting briefs. Then we made two smarter versions. Are they actually better? Every brief sounds confident, even when it's wrong. This is Assay." |
| problem (motion) | Three cards: unsupported claim, run 1/2/3 disagree, price tag "$ ?" | "You can't tell by reading. Run the same agent twice, and you get two different answers. One planted page can fool it. And nobody shows what a correct answer actually cost." |
| how (motion) | Receipt prints six steps in sync with words. Left panel changes per step: big icon, one line, sponsor logo on its step. No step held > 4 s | "Assay tests every agent the same way. It freezes the web with Tavily, so every agent reads the same saved pages. It plants a trap. It runs each agent three times. Every model call goes through Bifrost, so every step and every cent is recorded. Then each claim is checked against its source. And any agent can join, with no code changes." |
| run (screen, Test) | Pick 3 agents, task, hidden-instruction trap, Run. Live steps. Labeled time cut to saved batch `bench_198121eb12d0`, 9/9 Failed grid | "Let's test our three versions. Pick the agents, a meeting-brief task, and a trap: a hidden instruction planted in one page. Each agent runs three times, and every search, page read and model call appears live. A few minutes later: all nine runs fell for the trap." |
| receipt (screen, Inspect) | Receipt `run_155e8837eedf`: model switch, total, TRAP claim, source quote | "Why? Open a receipt. This Cheap-first run switched models at thirty-two seconds, and spent half a cent. Here's the false claim, and here's the planted page it came from." |
| results (screen, Decide) | Home findings, leaderboard, priority change reorders rows | "Now the ranking. Cheap-first costs sixteen percent more per correct answer. Evidence-gated scored lower. Our original, Baseline, has the best cost per correct answer. Weigh accuracy most, and the outside agent, GPT Researcher, comes first." |
| briefing (screen, Ship) | Type "Tavily", meeting time, Baseline selected, Write the brief, sections fill in | "So we ship Baseline. Enter a company and a meeting time. The Briefing Agent searches the last thirty days live with Tavily, and writes a one-page brief: verified facts with sources, what's uncertain, what it couldn't find, and questions to ask." |
| outro (motion) | Receipt "Don't trust the answer. Check the receipt.", logo, Tavily + Bifrost lockup, "Team Legendary Birds: Jude Sangalang, Harvey Buenaventura, Krystelle Eledia", repo URL | "Assay. Don't trust the answer. Check the receipt." |

Every number above is already in `script-data.json` facts and is re-checked by `npm run facts`. The outro holds about 3 s past the narration so the team and repo can be read; this is the one allowed hold.

## Criteria coverage

| Criterion / requirement | Where |
|---|---|
| Innovation (frozen web, traps, claim checks) | how, receipt |
| Technical execution | run (live), receipt |
| Problem and impact | hook, problem, results finding |
| Use of AI | agents under test, LLM judge, live briefing |
| UX | real UI in every screen scene, flow tracker |
| Scalability | "any agent can join, with no code changes" (env vars) |
| PS02: same tasks, repeats, controlled failure, steps/tokens/cost/time, comparison UI with traces | how, run, receipt, results |
| PS05: company + time in, 30-day sourced brief, verified vs uncertain, open questions | briefing |
| Both sponsors' roles | Tavily on freeze + briefing, Bifrost on recording + costs |

## Motion and layout rules

- **Pacing:** scene length = 0.4 s lead + narration + 0.6 s tail. Remove `minSeconds` padding. Scene changes use `@remotion/transitions` (`TransitionSeries`, ~12-frame fade/slide) so scenes overlap instead of cutting through blank cream.
- **Easing (easings.net):** camera moves easeInOutCubic (`bezier(0.65,0,0.35,1)`, current `ease`), element entries easeOutQuint/expo (`bezier(0.16,1,0.3,1)`), stamps and chips on springs. Camera moves 700–1000 ms. No two camera moves closer than 1.5 s.
- **Camera:** zoom ≤ 1.6, always framing a whole UI component with ≥ 40 px padding. No text cut at the window edge. Check by contact sheet before render.
- **One text layer:** burned-in captions stay. Fact chips that repeat the caption are removed. A soft accent ring outlines the UI area being narrated instead.
- **Flow tracker:** a small "Test → Inspect → Decide → Ship" stepper above the browser window on the four screen scenes, current step filled. Replaces the dark scene badge that covered the site nav.
- **Speed-up and time cut:** keep the "▶▶ 3× sped up" badge and the "≈ 3 min later · saved batch" card (honesty about waiting).

## Verification

- `npm run facts` passes.
- Contact sheet at 1 frame / 2 s reviewed for cropped text, holds and caption overlap.
- Total length printed by ffprobe within 2:15–2:35.
- User reviews the voice sample, then the rough cut, before the final render.

## Left to the builder

- Exact transition type per scene boundary, SFX placement, ring styling, hook "v1 v2 v3" motion detail.
