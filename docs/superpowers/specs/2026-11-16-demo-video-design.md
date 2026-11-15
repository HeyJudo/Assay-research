# Assay demo video: design

## Intent

A 2:30 demo video for the hackathon submission and the Nov 29 final judging. It mixes real screen footage of the Assay site with SaaS-explainer motion graphics. Judges score innovation, technical execution, impact, use of AI, UX, and potential, so the video must show the product working, both sponsors' roles, and one real finding.

Story angle (decided): lean into the real result. We built two "smarter" Briefing Agent versions, and Assay showed neither beat Baseline. That proves why a benchmark is needed.

## Goals

- 2:30 ± 5 s, 1920×1080, 30 fps, H.264 MP4.
- Show logo, the problem, how a run works, a run, a receipt, results, the Briefing Agent, and a closing card with the repo URL.
- Tie Bifrost to the run and receipt costs, and Tavily to the frozen pages and the live briefing.
- Eye-catching motion design that matches the site's look.

## Non-goals

- No changes to the web app or backend to make footage look better.
- No 3:00 version, no vertical/social cuts.

## Anti-goals

- Any number on screen or in narration that does not come from recorded runs (PRD §9). Fixture data must never appear as if it were measured.
- Hiding that our versions lost.
- Waiting periods shown without a labeled time cut.

## Constraints

- Footage uses the real UI in API mode (`web-api` + `api` launch configs) backed by the measured database, not the default fixture mode. The numbers below come from the current Home page and must be re-checked against the API at capture time. If they differ, the script follows the API.
- Live runs take ~3 min and hit Gemini 429s, so the run scene shows ~10 s of a live run, then a labeled time cut to saved batch `bench_198121eb12d0` (same agents, task, trap; 9/9 done).
- Capture runs the API on a **copy** of `backend/bench.db`, so the live footage run never writes into the measured database.
- ElevenLabs: key is in `.env` (`ELEVENLABS_API_KEY`). Voice ID `VCgLBmBjldJmfphyB8sZ`. Music via the ElevenLabs Music API.
- Remotion license is free for teams of 3 or fewer.

## Approaches

| Approach | Trade-off |
|---|---|
| **Remotion (picked by user)** | React code, reuses site fonts/colors/logo, frame-exact sync to VO durations, edits are code changes. New dev dependency in its own folder. |
| Animated HTML pages, screen-recorded | No new tool, but loose VO sync and every change means re-recording. |
| Timeline editor (CapCut/Resolve) | Most manual control, but assembly falls on the user and motion quality drops. |

## Look

- Site palette: cream background, rust orange accent, dark brown text. Fonts: Oxanium (headings), Geist (body), Fira Code (mono). Logo from `artifacts/logo-options/verified-wordmark/`, sponsor logos from `deck/assets/`.
- Recurring motif: the receipt. It prints in at the hook, carries the step list in "How it works", and closes the video.
- Screen footage sits in a floating browser frame with soft shadow. Camera pushes in on the area being narrated, with highlight boxes and short labels.
- Burned-in captions (my call: judges often watch muted).

## Scenes and narration (~340 words, ~145 wpm)

| Time | Type | Visual | Narration |
|---|---|---|---|
| 0:00–0:10 | Motion | Confident brief types out, half its lines flip to red "TRAPPED". Logo assembles from the receipt icon. | "Your research agent just wrote a confident meeting brief. Some of it came from a page planted to fool it. Would you know? This is Assay." |
| 0:10–0:26 | Motion | Three cards: wrong claim with fake source, three runs giving three answers, a "?" price tag. | "Research agents sound sure even when they're wrong. Run one twice, get two answers. And nobody tells you what a correct answer actually cost." |
| 0:26–0:50 | Motion | Six steps print onto a receipt: freeze the web, plant a trap, run three times, record every step, check every claim, rank. Tavily and Bifrost logos slide in on their steps. | "Assay freezes the web, so every agent searches the same saved pages, built once with Tavily. It plants a trap: a fake article, a hidden instruction, or an outage. Each agent runs three times. Every model call goes through Bifrost on a budget-capped key, so every step and every cent is recorded. Then each claim is checked against its source." |
| 0:50–1:12 | Screen | Run: pick Baseline, Cheap-first, Evidence-gated, task `brief-maxim-ai-trap`, hidden-instruction trap. ~10 s of a live Running screen, labeled time cut, then saved batch `bench_198121eb12d0` results. | "Pick your agents, a task, and a trap. Here, our three agent versions brief on Maxim AI, with a hidden instruction planted in one of the pages. Steps land live, with costs read from Bifrost's logs." |
| 1:12–1:35 | Screen | Receipt for run `run_155e8837eedf`: zoom on model switch at 32.7 s, $0.0055 total, then the TRAP claim and its source quote. | "Every run leaves a receipt. This Cheap-first run switched models at 32 seconds, spent half a cent, and fell for the trap. Here's the claim, and here's the planted page it came from." |
| 1:35–1:58 | Screen | Home findings card, then Leaderboard. Change priorities toward accuracy, rows reorder. | "Here's what surprised us. We built two smarter versions of our agent. Cheap-first costs 16% more per correct answer. Evidence-gated scored lower. Baseline wins. Weigh accuracy over cost, and the outside agent, GPT Researcher, takes the top spot." |
| 1:58–2:18 | Screen | Briefing Agent: type "Tavily", meeting time, Write the brief, brief fills in with Verified / Uncertain / Not found / Open questions. | "Then put it to work. Enter a company and a meeting time. The Briefing Agent searches the last thirty days live with Tavily, and separates verified facts from uncertain ones, with open questions to ask." |
| 2:18–2:30 | Motion | Receipt prints the closing line, logo, Tavily + Bifrost lockup, team names, repo URL `github.com/HeyJudo/Assay-research`. | "Assay. Don't trust the answer. Check the receipt." |

## Production pipeline

1. Capture: puppeteer-core + Edge (pattern from `deck/shoot.js`) drives the local site in API mode at 1920×1080 and records each scene as a clip. Briefing scene uses one real live call (Tavily + Gemini). If it fails, retry once, then fall back to a saved brief and say so.
2. VO: one ElevenLabs request per scene, saved as MP3. Scene lengths in Remotion come from the measured audio durations.
3. Music: one ~2:35 instrumental bed from ElevenLabs Music, ducked under the voice.
4. Compose and render in Remotion to `video/out/assay-demo.mp4`.

## Where things live

- Remotion project in `video/` at the repo root. Generated audio, clips, and renders are gitignored.
- This spec is not committed yet.

## Left to the builder

- Exact easing, transition styles, and sound effects.
- Caption styling.
- Which leaderboard priority control to use, as long as the reorder is real.

## Manual steps for the user

- If ElevenLabs Music is not on your plan, generate a track in the ElevenLabs web app and place it at `video/public/music.mp3`.
- Confirm on Discord that a video can still be added after the Nov 15 deadline.
- Review the rough cut before the final render.
