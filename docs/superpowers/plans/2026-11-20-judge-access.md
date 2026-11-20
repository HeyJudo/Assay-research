# Judge Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Judges open one link and use real Assay on a hosted Hugging Face Space, with the team's keys held as Space secrets and live actions behind a pre-filled passcode.

**Architecture:** `RUN_PASSCODE` now guards `/api/brief` as well as `/api/batches`. The web app saves `?code=` from any URL to `sessionStorage` at startup and pre-fills the passcode field on Run and Briefing. The existing single-container Dockerfile (bundled Bifrost) is uploaded to a public Docker Space from a clean `git archive`, secrets are set through the HF API from `.env`, and the README links the Space.

**Tech Stack:** FastAPI + pytest, Vite React TS + `node --test`, Hugging Face Spaces (Docker SDK), `huggingface_hub` CLI via `uvx`.

**Spec:** `docs/superpowers/specs/2026-11-20-judge-access-design.md`

## Global Constraints

- Branch `deploy/judge-access` from `origin/main`. Plain commit messages. No co-author lines.
- Never print, log or commit a key. `.env` stays local. Deploy uploads committed files only.
- `BriefRequest` gains `passcode: str`. Change `backend/assay/models.py` and `web/src/types.ts` in the same PR.
- 403 `"wrong passcode"` on wrong or unset `RUN_PASSCODE`, same check as `/api/batches`.
- URL param name: `code`. `sessionStorage` key: `assay.passcode`.
- Space: public, Docker SDK, CPU basic (free), `app_port: 8000`. README links the direct `https://<hf-user>-<space>.hf.space` URL.
- The Space `RUN_PASSCODE` is a fresh value, not the one in `.env`, because it gets published.
- No live run or brief that spends quota without the user's go-ahead.

## Review Focus

- Server with `RUN_PASSCODE` unset: `/api/brief` must return 403, not run. (Task 1 test.)
- A rejected brief must not hold `BRIEF_LOCK`: the next valid brief returns 200, not 409. (Task 1 test.)
- Judge lands on `/?code=x` then clicks to Briefing: field still pre-filled. (Task 2 test: second call without the param returns the saved value.)
- Passcode with spaces or `&` in the link: decoded correctly. (Task 2 test with `a%20b%26c`.)
- Wrong code in the link: Run and Briefing show the API's "wrong passcode" error and the field stays editable. (Task 3 smoke check.)

---

### Task 1: Passcode on `/api/brief`

**Files:**
- Modify: `backend/assay/models.py:121-124` (`BriefRequest`)
- Modify: `backend/assay/api.py:120-` (`create_brief`), `:205-208` (`create_batch`)
- Modify: `web/src/types.ts:121-126` (`BriefRequest`)
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Produces: `BriefRequest.passcode: str` (API and TS type). `check_passcode(passcode: str) -> None` in `api.py`, raises `HTTPException(403, "wrong passcode")`. Both endpoints call it first.

- [ ] **Step 1: Update existing brief tests and add the new ones**

Add `"passcode": "test-passcode"` to `BRIEF_BODY` (`test_api.py:171`). Add an autouse fixture in `test_api.py` that does `monkeypatch.setenv("RUN_PASSCODE", "test-passcode")`. New tests, using the existing brief fixtures that stub the agent:

```python
def test_brief_wrong_passcode_is_403(...):
    assert client.post("/api/brief", json={**BRIEF_BODY, "passcode": "nope"}).status_code == 403

def test_brief_unset_server_passcode_is_403(..., monkeypatch):
    monkeypatch.delenv("RUN_PASSCODE")
    assert client.post("/api/brief", json=BRIEF_BODY).status_code == 403

def test_rejected_brief_does_not_take_the_lock(...):
    assert client.post("/api/brief", json={**BRIEF_BODY, "passcode": "nope"}).status_code == 403
    assert client.post("/api/brief", json=BRIEF_BODY).status_code == 200
```

- [ ] **Step 2: Run, expect the 3 new tests to fail**

Run: `cd backend && uv run pytest tests/test_api.py -q`
Expected: the 403 tests FAIL (200 or 422 returned), the rest pass.

- [ ] **Step 3: Implement**

Add `passcode: str` to `BriefRequest` in `models.py` and `passcode: string` to the TS `BriefRequest`. Move the check from `create_batch` into `check_passcode` (`hmac.compare_digest`, empty `RUN_PASSCODE` rejects) and call it as the first line of `create_brief` and `create_batch`.

- [ ] **Step 4: Run the backend suite**

Run: `cd backend && uv run pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/assay/models.py backend/assay/api.py backend/tests/test_api.py web/src/types.ts
git commit -m "Require the run passcode for live briefings"
```

### Task 2: Pre-filled passcode in the web app

**Files:**
- Create: `web/src/lib/passcode.ts`
- Create: `web/tests/passcode.test.mjs`
- Modify: `web/src/main.tsx` (call once before render)
- Modify: `web/src/pages/Run.tsx:63,81,184` (initial value and resets)
- Modify: `web/src/pages/Briefing.tsx` (passcode field, pass to `data.brief`)
- Modify: `web/src/lib/data.ts:116-117` (`brief` takes `passcode`)

**Interfaces:**
- Consumes: `BriefRequest.passcode` (Task 1).
- Produces: `savedPasscode(search?: string, store?: Pick<Storage, 'getItem' | 'setItem'>): string`. Defaults are `location.search` and `sessionStorage`, both wrapped in try/catch (storage can throw). If `search` has `code`, it saves it under `assay.passcode` and returns it. Otherwise it returns the stored value or `''`. `data.brief(subject, meeting_time, version, passcode)`.

- [ ] **Step 1: Write the failing test**

Use the `memoryStorage()` helper pattern from `web/tests/run-session.test.mjs`.

```js
test('saves code from the URL and returns it later without the param', () => {
  const store = memoryStorage()
  assert.equal(savedPasscode('?code=a%20b%26c', store), 'a b&c')
  assert.equal(savedPasscode('', store), 'a b&c')
})
test('no code and nothing saved gives empty string', () => {
  assert.equal(savedPasscode('', memoryStorage()), '')
})
test('a throwing store still returns the URL code', () => {
  const bad = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(savedPasscode('?code=x', bad), 'x')
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd web && npm test`
Expected: FAIL, cannot find `../src/lib/passcode.ts`.

- [ ] **Step 3: Implement**

Write `passcode.ts` with `URLSearchParams`. Call `savedPasscode()` in `main.tsx` before `createRoot`, so the code survives navigation away from the landing URL. In `Run.tsx`, use `useState(savedPasscode)`, and make both `setPasscode('')` resets `setPasscode(savedPasscode())`. In `Briefing.tsx`, when `apiMode` is on, add the same field markup as `Run.tsx:269` (class `run-passcode`, label "Team passcode", hint "Live briefings spend real model budget, so they need the passcode."). It starts from `savedPasscode()`, and an empty value is blocked with "Enter the team passcode for a live briefing." Pass it to `data.brief`. Demo mode ignores the passcode.

- [ ] **Step 4: Run tests and build**

Run: `cd web && npm test && npm run build`
Expected: all tests pass, build succeeds with no TS errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/passcode.ts web/tests/passcode.test.mjs web/src/main.tsx web/src/pages/Run.tsx web/src/pages/Briefing.tsx web/src/lib/data.ts
git commit -m "Pre-fill the passcode from a ?code= link on Run and Briefing"
```

### Task 3: Deploy the Hugging Face Space

**Files:**
- Create: `deploy/space-README.md` (Space config only, uploaded as the Space's `README.md`)

**Interfaces:**
- Consumes: Tasks 1–2 committed on `deploy/judge-access`.
- Produces: the live URL `https://<hf-user>-assay.hf.space` and the Space passcode, both used in Task 4.

- [ ] **Step 1: Get what only the user has**

Ask for their HF username and a fresh Space passcode. Get an HF write token via `request_secret` with `delivery: "file"`. Never echo it.

- [ ] **Step 2: Write `deploy/space-README.md`**

```markdown
---
title: Assay
sdk: docker
app_port: 8000
pinned: false
---
Assay: know which research agent to trust. Source: https://github.com/HeyJudo/Assay-research
```

Commit: `git commit -m "Add Hugging Face Space config"`.

- [ ] **Step 3: Create the Space and set secrets**

Run `uvx --from huggingface_hub hf repo create <hf-user>/assay --repo-type space --space-sdk docker` with `HF_TOKEN` read from the token file. Then run a one-off Python snippet in the scratchpad that parses `.env` and calls `HfApi().add_space_secret` for: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ASSAY_JUDGE_MODEL`, `TAVILY_API_KEY`, `BIFROST_RUN_VK_1`–`9`, `BIFROST_JUDGE_VK`, `BIFROST_SETUP_TOKEN`. It sets `RUN_PASSCODE` from Step 1, prints only the secret names, and skips empty values. Do not set `BIFROST_URL`, `BIFROST_ADMIN_USER` or `BIFROST_ADMIN_PASSWORD`. The bundled Bifrost is fresh and takes the setup token.

- [ ] **Step 4: Upload committed files only**

Extract `git archive HEAD` into an empty scratchpad dir. Delete `README.md`, `video/`, `docs/` and `deck/` if present. Copy `deploy/space-README.md` in as `README.md`. Run `hf upload <hf-user>/assay <dir> . --repo-type space`. Before uploading, confirm `.env` is absent: `test ! -e <dir>/.env`.

- [ ] **Step 5: Verify the build and smoke-test without spending**

Wait for the Space status to show `RUNNING` (`HfApi().get_space_runtime`). Then check:
- `curl -s -o /dev/null -w "%{http_code}" https://<hf-user>-assay.hf.space/` → `200`
- `curl -s https://<hf-user>-assay.hf.space/api/leaderboard` → JSON with the published agents
- `curl -s -o /dev/null -w "%{http_code}" -X POST .../api/brief -H 'content-type: application/json' -d '{"subject":"x","meeting_time":"2026-11-29T12:00:00Z","version":"briefing-baseline","passcode":"wrong"}'` → `403`
- Open `/?code=wrong`, go to Briefing, confirm the field is pre-filled. Submitting shows "wrong passcode".

If the build fails on bundled Bifrost and can't be fixed within about an hour, use the fallback: `docker compose up` on the user's laptop plus `cloudflared tunnel --url http://localhost:8000`. That URL replaces the Space URL in Task 4.

### Task 4: README judge path

**Files:**
- Modify: `README.md:9` (add the live demo link next to the video link), `:16-24` ("For judges"), `:152-158` ("Deploy")

**Interfaces:**
- Consumes: the Space URL and passcode from Task 3.

- [ ] **Step 1: Edit the README**

- **Line 9:** add `[Live demo](https://<hf-user>-assay.hf.space/?code=<passcode>)`.
- **"For judges":** the first item is the live demo link. Browsing needs nothing, and the link pre-fills the passcode for Run and Briefing Agent. Keep the existing click path (Run → Results → Receipt → Leaderboard → Briefing). Add one line saying the Space may take about a minute to wake. Move "Run a live batch locally" below it as the self-hosted option.
- **"Deploy":** replace the paragraph saying the Briefing Agent has no passcode check. `RUN_PASSCODE` now guards benchmark runs and live briefings. Bifrost caps spend at $20/day per run key and $10/month for the judge.

- [ ] **Step 2: Check links**

Open the README link in a browser. It loads the Space, and Run shows the passcode pre-filled.

- [ ] **Step 3: Commit, push, PR**

```bash
git add README.md
git commit -m "Point judges to the hosted demo"
git push -u origin deploy/judge-access
gh pr create --base main --title "Hosted judge demo with passcode on briefings" --body "<summary>"
```

PR body: no co-author or attribution lines. Link the PR. The user merges.

### Task 5: End-to-end product test (separate session step)

Use the `e2e-testing` skill against the Space URL: Run → Receipt → Leaderboard → Briefing. Get the user's go-ahead before starting, because it spends Gemini quota and OpenAI judge budget.
