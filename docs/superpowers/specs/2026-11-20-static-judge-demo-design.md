# Static judge demo: real results and a replay Run button

Supersedes the hosting part (Tasks 3–4) of `2026-11-20-judge-access-design.md`. Hugging Face Docker Spaces need PRO (402 on create, Nov 20), and no free host runs the live stack without a card. Tasks 1–2 of that plan (passcode on briefings, `?code=` pre-fill) stay. They protect the live app the team runs.

## Intent

Judges open one free, always-up link and see the real published benchmark: leaderboard, compare, all 136 receipts. A Run button replays real recorded runs. No server, no keys, no spend. Live runs stay available through Docker with your own keys, and the team demos them on Nov 29.

## Goals

- `static` build mode of the web app that reads a snapshot of the real API responses.
- Run in static mode replays the recorded steps of real runs matching the chosen agents, task and trap.
- Briefing in static mode shows the real recorded brief for a chosen benchmark briefing task and version.
- Free static hosting with no card.

## Non-goals

- Any live model or search call from the static site.
- Porting leaderboard math to the client. The snapshot holds the server's own output.
- Changing the existing demo (fixtures) mode or api mode.

## Anti-goals (PRD §9)

- A replay that looks like a live run. Every replay screen says it is a replay of a recorded run.
- Hiding results. All 136 runs, including the 4 errors, stay visible.
- Planted trap facts reaching search engines. The site sends noindex and a `robots.txt` that disallows everything.

## Decided

- **Snapshot.** A Python script calls the real FastAPI app in-process (TestClient) against an empty temp DB, so `/api/leaderboard` uses `data/results/bench_runs.json`. It writes `agents.json`, `tasks.json`, `leaderboard.json` and `runs.json` (full records from `bench_runs.json`) to `web/public/snapshot/`. Output is committed.
- **Mode.** `VITE_DATA_MODE=static` through `vite build --mode static` and `web/.env.static`. `sampleData` is false in static mode.
- **Replay pick.** For each agent, use recorded runs with the same `agent_id`, `task_id` and `trap`. Per repeat 1–3, keep the latest `started_at`. If an agent has none, show an error naming the agent. Trap choices in static mode are only traps with recorded runs for that task.
- **Replay ids.** Records keep their real run ids, so receipt links open real receipts. Batch ids start with `replay_`.
- **Briefing.** Pick a recorded briefing task (clean, `trap` null) plus a version. It shows that run's output and receipt link. No free text, no meeting time.
- **Routing.** `HashRouter` in static mode, built with relative asset paths (`--base ./`), so any static host works with no rewrite rules.
- **Host.** A free Hugging Face Static Space (`sdk: static`). We already have the token. Fallback: GitHub Pages.

## Left to the builder

- Layout of the static Briefing picker, using existing components.
- Exact wording beyond the copy the plan fixes.
