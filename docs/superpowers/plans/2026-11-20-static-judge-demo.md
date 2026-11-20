# Static Judge Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free, always-up static site where judges browse the real benchmark and press Run to replay real recorded runs.

**Architecture:** A Python script snapshots the real API's read-only responses into `web/public/snapshot/`. A new `static` data mode in `web/src/lib/data.ts` reads them, replays recorded runs through the existing demo stream player, and serves recorded briefs. The static build uses `HashRouter` and relative assets. It is uploaded to a Hugging Face Static Space.

**Tech Stack:** FastAPI TestClient + pytest, Vite React TS + `node --test`, Hugging Face Static Space via `huggingface_hub`.

**Spec:** `docs/superpowers/specs/2026-11-20-static-judge-demo-design.md`

## Global Constraints

- Branch `deploy/judge-access`. Plain commit messages, no co-author lines. Push after each task.
- Demo (fixtures) mode and api mode behave exactly as before. Static is a third mode: `staticMode = import.meta.env.VITE_DATA_MODE === 'static'`.
- Never call `/api/*` in static mode. Snapshot files are fetched from `${import.meta.env.BASE_URL}snapshot/<name>.json`.
- Fixed copy (static mode):
  - Run provenance: `Replay of recorded benchmark runs. No live model calls or provider spending.`
  - Run start button: `Start replay`
  - Home primary button: `Replay a benchmark run`
  - Home CTA line: `The replay plays back real recorded runs.`
  - Briefing intro: `These briefs were recorded during the benchmark.`
  - Briefing record note: `Recorded benchmark brief`
  - Briefing mode note: `Recorded output. No live searches or model calls.`
- No passcode field in static mode.
- noindex everywhere: `<meta name="robots" content="noindex, nofollow">` in `web/index.html`, and `web/public/robots.txt` with `User-agent: *` / `Disallow: /`.
- All 136 runs stay listed, including the 4 errors.

## Review Focus

- Agent with no recorded run for the chosen task/trap: Run shows `No recorded run for <agent label> on this task with this trap.` and starts nothing. (Task 2 test.)
- Duplicate or retried repeats: replay shows one run per repeat 1–3, the latest. (Task 2 test.)
- Refresh during a replay: playback resumes from the saved position, because the existing demo cursor logic waits for the snapshot. (Task 3 manual check.)
- Deep link to `#/receipt/<real id>` on a fresh tab: the receipt loads from the snapshot. (Task 3 manual check.)
- Trap options for a task with no recorded trap runs: only `No trap` is offered. (Task 2 test via `recordedTraps`.)

---

### Task 1: Snapshot script

**Files:**
- Create: `backend/assay/snapshot.py`
- Create: `backend/tests/test_snapshot.py`
- Create (generated, committed): `web/public/snapshot/{agents,tasks,leaderboard,runs}.json`

**Interfaces:**
- Produces: `write_snapshot(out_dir: Path) -> None`. It runs as `uv run python -m assay.snapshot` from `backend/`, with a default out dir of `ROOT/web/public/snapshot`. Before importing `assay.api`, it sets `ASSAY_DB` to a temp file, so the leaderboard comes from `data/results/bench_runs.json`. Each file is JSON: `agents`, `tasks` and `leaderboard` hold the response bodies of `GET /api/agents`, `/api/tasks` and `/api/leaderboard`. `runs` holds the full list from `bench_runs.json`, with steps.

- [ ] **Step 1: Write the failing test**

```python
def test_snapshot_matches_published_results(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "empty.db"))
    snapshot.write_snapshot(tmp_path / "out")
    runs = json.loads((tmp_path / "out/runs.json").read_text("utf-8"))
    published = json.loads(api.BENCH_RESULTS.read_text("utf-8"))
    assert len(runs) == len(published) == 136
    assert all(r["steps"] for r in runs if r["status"] == "done")
    board = json.loads((tmp_path / "out/leaderboard.json").read_text("utf-8"))
    assert {row["agent_id"] for row in board} == {r["agent_id"] for r in published}
    assert board == TestClient(api.app).get("/api/leaderboard").json()
    for name in ("agents", "tasks"):
        assert json.loads((tmp_path / f"out/{name}.json").read_text("utf-8"))
```

- [ ] **Step 2: Run, expect failure** (`cd backend && uv run pytest tests/test_snapshot.py -q`, expect no module `assay.snapshot`).
- [ ] **Step 3: Implement** `write_snapshot` with `fastapi.testclient.TestClient(api.app)`. Write with `ensure_ascii=False` and no indent.
- [ ] **Step 4: Run the test, then generate:** `cd backend && uv run python -m assay.snapshot`. Expect 4 files, with `runs.json` about 600 KB.
- [ ] **Step 5: Commit and push** (`git commit -m "Add snapshot of published results for the static demo"`).

### Task 2: Replay selection helpers

**Files:**
- Create: `web/src/lib/replay.ts`
- Create: `web/tests/replay.test.mjs`

**Interfaces:**
- Produces:
  - `pickReplayRuns(records: RunRecord[], agents: string[], taskId: string, trap: Trap | null): RunRecord[]`. It throws `Error('No recorded run for <agentLabel(agent)> on this task with this trap.')` for the first agent with no match. It returns runs ordered by the agent order given, then by repeat ascending. Per agent and repeat in 1–3 it keeps the latest `started_at`, and it ignores `status === 'running'`.
  - `recordedTraps(records: RunRecord[], taskId: string): (Trap | null)[]` lists the distinct `trap` values recorded for the task.
  - `recordedBriefs(records: RunRecord[], version: string): RunRecord[]` returns one run per briefing `task_id` with `trap === null` and the given `agent_id`. It keeps the lowest repeat, prefers `status === 'done'`, and sorts by `task_id`.

- [ ] **Step 1: Write the failing tests.** Build records with a small `rec({agent_id, task_id, trap, repeat, started_at, status, task_type})` factory, so no snapshot file is needed:
  - Two agents, each with repeats 1–3. Expect 6 runs in order agentA r1–r3 then agentB r1–r3.
  - Repeat 2 recorded twice (an error run, then a later done run). Expect the later one.
  - An agent with only `trap: 'fake_article'` runs, asked for `trap: null`. Expect the throw, with the message containing `on this task with this trap.`
  - `recordedTraps` on a task with null and `fake_article` runs gives both. A task with only null runs gives `[null]`.
  - `recordedBriefs`: a trap run is excluded, the lowest repeat is kept, and a `done` run is preferred over an `error` run at the same repeat.
- [ ] **Step 2: Run, expect failure** (`cd web && npm test`, expect module not found).
- [ ] **Step 3: Implement** in `replay.ts`, importing `agentLabel` from `./agent-names`.
- [ ] **Step 4: Run** `cd web && npm test`. Expect all to pass.
- [ ] **Step 5: Commit and push** (`git commit -m "Add replay selection for recorded runs"`).

### Task 3: Static mode in the web app

**Files:**
- Modify: `web/src/lib/data.ts` (`staticMode`, snapshot loading, static branches of every `data.*` method, new `recordedBrief`)
- Modify: `web/src/App.tsx:64` (router choice)
- Modify: `web/src/pages/Run.tsx`, `web/src/pages/Briefing.tsx`, `web/src/pages/Home.tsx`, `web/src/pages/Compare.tsx` (static copy and branches)
- Modify: `web/package.json` (`"build:static": "tsc -b && vite build --mode static --base ./"`), `web/index.html` (robots meta)
- Create: `web/.env.static` (`VITE_DATA_MODE=static`), `web/public/robots.txt`

**Interfaces:**
- Consumes: the snapshot files (Task 1) and `pickReplayRuns`, `recordedTraps`, `recordedBriefs` (Task 2).
- Produces:
  - `staticMode: boolean`, exported from `data.ts`.
  - `sampleData` is false when `staticMode`.
  - `data.recordedBriefs(version: string): Promise<RunRecord[]>` and `data.recordedTraps(taskId: string): Promise<(Trap | null)[]>`, both static only.

- [ ] **Step 1: Data layer.** Load all 4 snapshot files once, through a memoized promise. In static mode:
  - `agents`, `tasks` and `leaderboard` return the snapshot.
  - `runs(batch?)` returns snapshot runs, plus replay-batch members when `batch` starts with `replay_`.
  - `run(id)` looks up the snapshot.
  - `batch(config)` calls `pickReplayRuns`, stores the records in `simulatedBatches` under `replay_<Date.now()>`, persists `{batchId: runIds}` under the localStorage key `assay:replay-batches` with the existing `writeStored`, and returns `{batch_id}`.
  - `subscribe` waits for the snapshot (restoring `replay_` batches from `assay:replay-batches`), then reuses the existing demo event player and cursor unchanged.
  - `brief` throws in static mode, because Briefing uses `recordedBriefs`.
  - Fixtures and demo branches stay untouched when not static.
- [ ] **Step 2: Router and build.** `const Router = staticMode ? HashRouter : BrowserRouter`. Add the `build:static` script, `.env.static`, the robots meta and `robots.txt`.
- [ ] **Step 3: Pages.**
  - **Run:** the storage `mode` is `'static'` in static mode, there's no passcode, `availableTraps` is limited to the `recordedTraps` of the chosen task, and it uses the fixed button and provenance copy.
  - **Briefing:** in static mode, replace the subject and meeting inputs with a `Select` of `recordedBriefs(selected)` by task prompt. Submitting shows that record's output and receipt link without polling. Use the fixed intro, record note and mode note.
  - **Home:** fixed button and CTA copy.
  - **Compare:** a `replay_` batch shows `Replay of recorded benchmark runs.`, not the demo-simulation note.
- [ ] **Step 4: Verify.** Run `cd web && npm test && npm run build && npm run build:static`. All pass, and `dist/snapshot/runs.json` and `dist/robots.txt` exist. Then `npx vite preview --outDir dist` and check by hand:
  - Home shows "Measured benchmark findings".
  - Leaderboard has 4 agents.
  - Run: pick 2 agents and a trap task, choose a recorded trap, then Start replay. Steps play, and refreshing mid-replay resumes.
  - Clicking a receipt opens a real one. A fresh tab on that `#/receipt/...` URL loads.
  - Briefing shows a recorded brief.
  - `npm run build` (api/demo) still shows the old copy.
- [ ] **Step 5: Commit and push** (`git commit -m "Add static data mode with replayed benchmark runs"`).

### Task 4: Deploy the static Space and update the README (controller)

**Files:**
- Modify: `deploy/space-README.md`. Set the frontmatter to `sdk: static`, remove `app_port`, and keep the title and source line.
- Modify: `README.md:9`, `:16-24` ("For judges"), `:152-158` ("Deploy").

- [ ] **Step 1: Create and upload.** Using the HF token file, call `HfApi().create_repo("heyjudo/assay", repo_type="space", space_sdk="static", exist_ok=True)`. Copy `web/dist` from `npm run build:static` into an empty scratch dir with `deploy/space-README.md` as `README.md`, then `upload_folder` it. No secrets are needed.
- [ ] **Step 2: Verify:**
  - `curl -s -o /dev/null -w "%{http_code}" https://heyjudo-assay.static.hf.space/` returns `200`.
  - `.../snapshot/leaderboard.json` returns JSON.
  - `.../robots.txt` contains `Disallow: /`.
  - Open the site and repeat the Task 3 manual checks.
- [ ] **Step 3: README:**
  - **Line 9:** add `[Live demo](https://heyjudo-assay.static.hf.space)`.
  - **"For judges":** the demo link goes first, with "real benchmark results and receipts, Run replays recorded runs, no keys needed". Then the click path: Run → Start replay → Receipt → Leaderboard slider → Briefing. Keep "Run a live batch locally" as the live option.
  - **"Deploy":** the static demo build (`npm run build:static`, `uv run python -m assay.snapshot` to refresh it), and the passcode now guarding runs and briefs on a live host.
- [ ] **Step 4: Commit, push, PR.** `git commit -m "Point judges to the static demo"`, push, then `gh pr create --base main` with no attribution lines. Link the PR. The user merges.
- [ ] **Fallback:** if the Static Space fails, publish `web/dist` to GitHub Pages from a `gh-pages` branch. HashRouter and relative paths need no changes.

### Task 5: End-to-end product test

Use the `e2e-testing` skill on the static site (free). Run the live Docker path only with the user's go-ahead, because it spends quota.
