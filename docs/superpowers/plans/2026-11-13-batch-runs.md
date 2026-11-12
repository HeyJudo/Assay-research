# Batch Runs Implementation Plan

**Goal:** The Run button works: `POST /api/batches` starts ≤3 agents × 1 task × 3 repeats in parallel, each run on its own Bifrost virtual key, and `GET /api/batches/{id}/stream` streams progress.

**Spec:** PRD §8 (API table, "Runs in a batch execute in parallel (up to 9)", agent contract), §6 (proxy per batch, model outage), §3 must-have 3 (budget cap), §11 Wed. Contract: `BatchRequest`, `BatchCreated`, `BatchStatus`, SSE event models in `backend/assay/models.py` (merged in #8). No run record shape change.

**Lanes:** lead only (runner, API, Bifrost config, Docker, practice pool). Backend lane heads-up: each agent id is a folder `backend/agents/<id>/` with `run` and a new `agent.json` `{"version", "models", "prompt_hash"}`. Briefing versions need one folder each.

## Decisions

- Budget cap = Bifrost budget on each run-slot virtual key (`vk-run-1..9`, $0.50/day each, user choice Nov 13). Bifrost answers 402 `{"type": "budget_exceeded", ...}`. A run whose agent stderr shows it gets `status: budget_exceeded`.
- Run slot n of a batch (n = 1..9, agent-major order) gets `BIFROST_RUN_VK_n` as `OPENAI_API_KEY`. One batch at a time, so slots never collide.
- One search proxy per batch (task pool + `ASSAY_TRAP`), plus the outage pass-through for `model_outage`. Started in the POST handler so a failure is the caller's error, stopped when the batch ends.
- Batch state and events live in memory. A restart forgets running batches (records stay in SQLite).
- `step` events carry the record's steps at run end. Live steps from proxy and Bifrost logs come with the step-timeline task.
- `OPENAI_BASE_URL` = `BIFROST_URL` env, default `http://localhost:8080/v1`. `NO_PROXY` gains the Bifrost host so Docker's `bifrost` hostname skips the search proxy.

## Tasks

0. Rename the practice pool to `data/practice/pools/practice-python3-year.json` with matching `task_id` (pool lookup is `<task_id>.json`, PRD §8).
1. `runner.run_once`: `on_start(record)` callback with a `running` record, `budget_exceeded` from stderr, Bifrost host in `NO_PROXY`. Tests in `test_runner.py`.
2. `runner`: `find_agent`, `find_task`, `find_pool`, `start_batch` (proxies, thread pool, per-slot VK, emit events, save records). Tests: real proxy, real stub subprocesses; runs overlap in time; each run sees its own VK.
3. `api.py`: `POST /api/batches` (403 passcode, 409 busy, 404 unknown agent/task, 422 no pool/trap doc, 503 missing VK), `GET /api/batches/{id}`, `GET /api/batches/{id}/stream` (SSE, replays from `Last-Event-ID`). Tests with `TestClient`.
4. `bifrost/config.json` budgets for vk-run-1..9. `docker-compose.yml` sets `BIFROST_URL` for the app.
5. Live run on the practice task (e2e-testing skill).
