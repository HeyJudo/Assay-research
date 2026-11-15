# Assay

**Know which research agent to trust, and why.**

Assay is a benchmarking platform for AI research agents. It runs several agents on the same tasks, against the same frozen copy of the web, with planted traps, three times each. For completed briefing tasks, the judge checks claims against their cited sources. Assay ranks the agents by what matters to you: accuracy, reliability, cost, trap resistance and honesty.

> **Status:** in active development for the [Global AI Hackathon 2026](https://hackculture.io/hackathons/ai-global-hackathon) (build window Nov 1–15). Spec is final. Code lands from Nov 9. Sections marked _(planned)_ describe the target and will be replaced with real instructions as each part ships.

| Track | Problem statement | How Assay answers it |
|---|---|---|
| **Primary: Bifrost** | PS02: benchmarking platform for agents, research category | Framework-independent runs, repeated 3×, controlled failures, step-by-step run receipts, comparison UI |
| **Integration: Tavily** | PS05: pre-meeting briefing agent | Our Briefing Agent, built in 3 versions and tested on Assay. Tavily also builds the frozen web |

## The problem

- **Research-agent scores can't be repeated.** The live web changes daily, so two agents tested on different days aren't comparable.
- **One good run hides flakiness.** Single-run scores overstate reliability by 20–40% (ReliabilityBench, 2026).
- **Reports sound right but cite badly.** Nobody checks whether each source says what the agent claims.
- **Agents believe fake sources.** One planted article collapsed accuracy in six frontier models (arXiv 2603.00801).
- **Agents guess instead of saying "I don't know."** Most benchmarks reward guessing.
- **Leaderboards say who won, not why.** Outside agents differ in model, prompt and search all at once.

Full evidence and sources: [`docs/PRD.md`](docs/PRD.md#why-it-matters-evidence-for-the-deck).

## What Assay does

- **Frozen web.** Each task gets a fixed pool of real documents, collected once with Tavily. Every agent searches and reads only that pool, so runs are repeatable.
- **Plug in any agent with env vars only.** Its model calls go through Bifrost and its web traffic through the Assay search proxy. No code changes to the agent.
- **Traps.** Fake article, hidden instruction, search outage, model outage. Planted identically for every agent, each with a clean twin as the baseline.
- **Claim-by-claim citation check.** For completed briefing tasks only, a judge from a different model family marks claims supported, unsupported, trap or not found, with the exact source quote.
- **Reliability, cost and honesty.** The benchmark runs 11 of the 16 tasks (4 trapped twins, 4 clean twins, 3 unanswerable) × 3 repeats × 4 agents. We report pass^3, cost per correct answer, and whether agents say "Not found" when the answer truly isn't there.
- **Explains why.** Our Briefing Agent comes in three versions that differ in one design choice each (Baseline, Cheap-first, Evidence-gated). Assay measures what each choice changes.

## Screens

| Screen | What you do there |
|---|---|
| **Home** | See the headline findings and the top agents |
| **Leaderboard** | Drag "what matters to you" sliders and get the best-fit agent |
| **Run** | Pick up to 3 agents, a task and a trap, press Run, watch it live |
| **Compare** | Head-to-head of two agents, with spread across runs |
| **Run receipt** | Every step, cost by model, and every claim with its source |
| **Briefing Agent** | Company + meeting time in, one-page sourced brief out (PS05) |

## How it works

```
React app ──HTTP/SSE──► FastAPI ──► SQLite
                           │
                        Runner ── starts each agent with env vars
                    ┌──────┴───────┐
                    ▼              ▼
             Bifrost gateway   Search proxy (mitmproxy)
             all LLM calls,    serves the frozen pool,
             cost, budgets,    injects traps,
             run tags          logs every search
```

A run's step-by-step trace is built from the two places every research agent must pass through: Bifrost (model calls) and the search proxy (web access). That is what makes Assay framework-independent.

## How we use the sponsors

- **Bifrost:** gateway for every model call from every agent and the judge. Uses virtual-key budgets and per-run tagging for usage collection, plus simulated model outages for failure tests. Agents use one provider, Google AI Studio Gemini, so there is no provider failover in practice. The judge uses OpenAI.
- **Tavily:** builds every frozen document pool (search + extract). Powers the live Briefing Agent. The proxy speaks Tavily's API format, so agents written for Tavily run on Assay unchanged.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, uv, SQLite |
| Search proxy | mitmproxy add-on |
| Gateway | Bifrost (Docker / npx) |
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Live updates | Server-Sent Events |
| Models | Gemini 3.5 Flash-Lite and 3.1 Flash-Lite (Google AI Studio free tier) for agents. An OpenAI GPT model as the judge |
| Deploy | One Docker image (`docker compose up`; Hugging Face Docker Spaces need PRO, see Deploy) |

## Getting started

Prerequisites: Docker Desktop (full stack), or Node 20.19+ + Python 3.12 + [uv](https://docs.astral.sh/uv/) to run parts separately. API keys: Tavily, OpenAI (judge), and Google AI Studio Gemini (required for agents).

The API reads run records from SQLite. The runner and live batch, SSE and briefing endpoints are implemented. Set `ASSAY_SEED_FIXTURES=1` to load fixture runs into an empty database for frontend work.

Set these names in `.env`:

- Provider keys: `TAVILY_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`.
- Run-slot virtual keys: `BIFROST_RUN_VK_1`, `BIFROST_RUN_VK_2`, `BIFROST_RUN_VK_3`, `BIFROST_RUN_VK_4`, `BIFROST_RUN_VK_5`, `BIFROST_RUN_VK_6`, `BIFROST_RUN_VK_7`, `BIFROST_RUN_VK_8`, `BIFROST_RUN_VK_9`.
- Judge: `BIFROST_JUDGE_VK`, `ASSAY_JUDGE_MODEL`.
- Bifrost admin: `BIFROST_SETUP_TOKEN`, `BIFROST_ADMIN_USER`, `BIFROST_ADMIN_PASSWORD`.
- Live Run access: `RUN_PASSCODE`.

**Full stack** (app + API at http://localhost:8000, Bifrost UI at http://localhost:8080). The Bifrost dashboard asks for `BIFROST_SETUP_TOKEN` (any secret you put in `.env`) once, to create the admin account:

```bash
git clone https://github.com/HeyJudo/Assay-research.git
cd Assay-research
cp .env.example .env    # add your keys
docker compose up --build
```

**Frontend only** (Node, no Python; reads the fixtures directly, http://localhost:5173):

```bash
cd web
npm install
npm run dev
```

**Backend only** (API at http://localhost:8000/api/runs, docs at `/docs`):

```bash
cd backend
uv run uvicorn assay.api:app --reload
```

**Benchmark** (from the repository root, with Bifrost running and `.env` variables exported):

```bash
cd backend && ASSAY_DB=bench.db uv run python -m assay.bench
```

This is resumable: counted runs are skipped, while errors, interrupted runs and fallback runs are retried. Original records are kept.

**Bifrost alone** (UI at http://localhost:8080, reads `bifrost/config.json`; export the keys from `.env` first):

```bash
npx -y @maximhq/bifrost -app-dir ./bifrost
```

## Deploy

One image runs everywhere. Keys and `RUN_PASSCODE` come from env only. The image holds no `.env`, and `bifrost/config.json` has `env.*` references only.

- **`docker compose up`:** app + a separate Bifrost service. `assay.db` lives in the `assay-state` volume, so runs survive `docker compose down` and rebuilds (`down -v` wipes them).
- **Single container (Hugging Face Space):** with no `BIFROST_URL` set, the image starts its bundled Bifrost on `127.0.0.1:8080`, so only the app port faces the internet. Each batch starts its own mitmproxy search proxy on localhost, as it does locally.

**Status: not deployed.** Hugging Face now requires a PRO subscription for Docker Spaces on free CPU (creating one returned `402 Payment Required` on Nov 14, 2026). The demo runs from a laptop (fallback below). The image already runs as a single container, so with PRO the steps are:

1. Create a Space with the Docker SDK.
2. In Space settings → Secrets, add every name from `.env.example` that has a value in your `.env`. Leave `BIFROST_URL` unset.
3. Push the tracked files, with a Space README that sets the port:

```bash
git archive HEAD -o /tmp/assay.tar && mkdir /tmp/space && tar -xf /tmp/assay.tar -C /tmp/space
printf -- '---\ntitle: Assay\nsdk: docker\napp_port: 8000\n---\n' | cat - README.md > /tmp/space/README.md
HF_TOKEN=... uvx --from huggingface_hub hf upload <user>/<space> /tmp/space . --repo-type space
```

The free Space disk is not persistent: a restart clears `assay.db` and Bifrost's logs. The leaderboard falls back to the committed fixtures until a benchmark exists.

**Laptop fallback (PRD §12), the current demo setup:** run `docker compose up --build` on a laptop and demo at http://localhost:8000, with the recorded video as backup. One batch runs at a time, and the Run button needs `RUN_PASSCODE`.

## Repository layout

```
backend/assay/      FastAPI app (api.py) and the run record (models.py)
web/src/            React app: pages/, types.ts (mirrors models.py), fixtures/ (fake data, shared with the API)
bifrost/            Bifrost config.json
docs/               PRD and hackathon context
Dockerfile          one image: builds web/, FastAPI serves it + the API on port 8000
docker-compose.yml  app + Bifrost, assay.db in a volume
```

## Methodology

Same pools, tasks and trap seeds for every agent. Answers verified in-pool by two people. pass^3 and spread reported, not just averages. Judge checked against 50 claims labeled by Claude and reviewed by a human: 48% agreement (24/50). Our agents are tuned only on separate practice tasks, and at least one outside agent is always on the board. Cost is estimated from token usage at list prices in `pricing.json` (free tiers bill $0). Failed runs with no usage record have $0 recorded cost. Results that make our own agents look bad get published too. Full rules: [`docs/PRD.md`](docs/PRD.md) §9.

10 runs failed: 6 in test batches before the benchmark and 4 benchmark runs that hit free-tier 429s or since-fixed grader crashes, then retried under the resume rule. Raw records are kept.

## Team

| Role | Owns |
|---|---|
| Lead (Jude) | Platform: search proxy, pools, traps, runner, API, Bifrost, deploy |
| Backend | Briefing Agent (3 versions) and graders |
| Frontend | Dashboard screens |

## AI tool disclosure

We build with AI-assisted development. Claude Code (Anthropic) helped with planning, the spec, documentation and code. Every change is reviewed and merged by a team member. Claude also drafted the 50 judge-validation labels (`data/labels/`), and a team member reviewed each one. Assay itself calls LLMs at runtime: Gemini models as the agents under test and an OpenAI model as the judge, all through Bifrost.

## Docs

- [`docs/PRD.md`](docs/PRD.md): full spec, data contracts, roles and schedule
- [`docs/HACKATHON_CONTEXT.md`](docs/HACKATHON_CONTEXT.md): rules, judging criteria, submission checklist

## License

[MIT](LICENSE)
