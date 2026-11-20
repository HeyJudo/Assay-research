<h1 align="center">
  <img src="docs/images/assay-wordmark-color.png" alt="Assay" width="340">
</h1>

<p align="center"><strong>Know which research agent to trust, and why.</strong></p>

Assay tests research agents on the same frozen web pages, repeats each task, and injects controlled failures. A separate model checks claims in completed benchmark briefings against their cited passages. Run receipts show what the agents did, and a leaderboard helps teams choose based on accuracy, cost, resistance to traps, and whether agents admit when evidence is missing.

[Global AI Hackathon 2026](https://hackculture.io/hackathons/ai-global-hackathon) · [Live demo](https://heyjudo-assay.static.hf.space) · [Demo video](<VIDEO_URL>)

| Track | Problem statement | Entry |
|---|---|---|
| Primary · Bifrost | PS02 · Agent benchmarking, research category | Repeatable head-to-head tests with run receipts |
| Integration · Tavily | PS05 · Pre-meeting briefing agent | A live briefing agent whose three versions compete on Assay |

## For judges

### Open the demo (no install, no keys)

[**heyjudo-assay.static.hf.space**](https://heyjudo-assay.static.hf.space) shows the real published benchmark: the leaderboard, head-to-head comparisons and all 136 run receipts, including failed runs. **Run** replays the recorded steps of real benchmark runs and labels them as replays. It makes no live model calls.

1. Open **Run**. Click **Next** through the preselected agents. Pick a task marked "supports planted traps", click **Next**, and click **Start replay**.
2. When **Results** opens, click a run under **Receipts**. Expand **Show all steps** and inspect the claim verdicts.
3. Open **Leaderboard** and move a priority slider.
4. Open **Briefing Agent**, pick a recorded brief and a version, and click **Show the recorded brief**.

To see live runs and live briefings, run the stack yourself with the steps below.

### Run a live batch locally

1. With Docker Desktop running, copy [`.env.example`](.env.example) to `.env`. Set a Google AI Studio key (`GEMINI_API_KEY`), an OpenAI judge key (`OPENAI_API_KEY`), and a Tavily key (`TAVILY_API_KEY`) for live briefings. Set the [local Bifrost values](#run-the-live-stack) and choose a `RUN_PASSCODE`.
2. Run `docker compose up --build` and open [http://localhost:8000](http://localhost:8000).
3. Open **Run**. Click **Next** through the preselected agents and Tavily briefing task. Keep **No trap**, enter `RUN_PASSCODE` in **Team passcode**, and click **Start benchmark**. A batch takes about 3 minutes.
4. When **Results** opens, compare the agents and click a run under **Receipts**. Expand **Show all steps** and inspect the claim verdicts. Open **Leaderboard** and move a priority slider. Then open **Briefing Agent**, enter a company or person and meeting time, and click **Write the brief**.

| Hard requirement | Where to check |
|---|---|
| PS02 · Framework-independent | **Run** includes GPT Researcher alongside Assay's own agents. The [runner](backend/assay/runner.py) passes gateway and proxy settings through environment variables. The [GPT Researcher wrapper](backend/agents/gpt-researcher/run) uses the upstream agent unchanged. |
| PS02 · Same tasks and recorded metrics | **Run** shows the shared task. **Receipt** shows success, steps, tool calls, tokens, cost and elapsed time. The [run record](backend/assay/models.py) defines those fields. |
| PS02 · Repeated runs | **Run** shows three repeats per agent. **Leaderboard → More** shows pass³ and accuracy spread. |
| PS02 · Controlled failures | In **Run**, select **Model outage**, **Search outage** or a planted task's **Hidden instruction** to test a model failure, broken tool or misleading instruction. See the [model outage handler](backend/assay/outage.py) and [search proxy](backend/assay/proxy.py) for the injected failures. |
| PS02 · Comparison UI and step-by-step traces | **Results** compares agents head to head. Its **Receipts** show the recorded search, read, model and error steps. |
| PS05 · Company or person plus meeting time | **Briefing Agent** asks for both before starting live research. |
| PS05 · One-page brief for the last 30 days, with sources and open questions | **Briefing Agent** displays the cited brief and questions to ask in the meeting. The [briefing prompt](backend/agents/briefing_agent.py) asks for one page covering the 30 days before the meeting. |
| PS05 · Verified and uncertain facts separated | **Briefing Agent** gives **Verified**, **Uncertain** and **Not found** their own sections. |

## The problem

A research agent can return the right answer once, fail on a repeat, or cite a page that gives no support for its claim. The changing web makes it hard to tell whether a new model, search setting or evidence rule actually improved the result. Assay holds the task and sources fixed so a team can test those changes before relying on an agent for meeting prep or other research. [Research behind the design](docs/PRD.md#why-it-matters-evidence-for-the-deck).

## What Assay does

- **Freeze the web.** Each task uses a fixed pool of Tavily search results and page text. The same pool goes to every agent in the batch.
- **Test failure and abstention.** Fake articles, hidden instructions, search outages and model outages test different failure modes. Unanswerable tasks measure whether the agent says “Not found” when the pool lacks the answer.
- **Grade and compare.** The claim judge checks completed benchmark briefings against the cited pool text. Fact tasks use exact-match grading after normalization. The leaderboard ranks agents by the priorities you set and reports cost per correct answer.
- **Test a design choice.** **Baseline** uses the main model. **Cheap-first** starts with the smaller model and can switch when a briefing fails a fixed check. **Evidence-gated** checks draft claims and searches again for unsupported ones.

## Screens

**Leaderboard** ranks agents by your priorities and shows cost per correct answer.

<p align="center">
  <a href="docs/images/leaderboard.png"><img src="docs/images/leaderboard.png" alt="Leaderboard with priority sliders, agent rankings and a cost versus accuracy chart" width="680"></a>
</p>

| Run a benchmark | Write a meeting brief |
|:---:|:---:|
| [![Run screen with agent selection](docs/images/run.png)](docs/images/run.png) | [![Briefing Agent form with company or person, meeting time and agent version](docs/images/briefing.png)](docs/images/briefing.png) |
| Pick agents, a task and a trap. Compare the runs in **Results**. | Use live search to prepare for a meeting and see how the selected version scored. |

<details>
<summary>See a run receipt</summary>

Inspect the recorded steps, costs and claim verdicts, with source quotes where available.

![Run receipt with model usage and claim evidence](docs/images/receipt.png)

</details>

<details>
<summary>See the home screen</summary>

![Home screen with benchmark findings](docs/images/home.png)

</details>

## How it works

```
React app --HTTP/SSE--> FastAPI --> SQLite
                           |
                        Runner -- starts each agent with env vars
                    +------+-------+
                    v              v
             Bifrost gateway   Search proxy (mitmproxy)
             all LLM calls,    serves the frozen pool,
             cost, budgets,    injects traps,
             run slots         logs searches and reads
```

The runner starts each agent as a subprocess. It builds the benchmark trace from Bifrost model-usage logs and the proxy's search and page-read logs. The proxy serves stored pages and blocks requests outside the pool. A supported claim verdict requires a verbatim quote from a cited pool document. The live Briefing Agent uses Tavily directly and returns a brief with its own run receipt.

The runner executes repeats in parallel, with up to three agents per batch. The resumable CLI uses the same runner for the full suite. The app accepts one live batch or briefing at a time.

## Sponsors

- **Bifrost (Maxim AI).** Routes model calls for the agents and judge. Its virtual keys isolate run-slot usage and budgets, and its logs supply tokens, model names and costs for receipts. Assay injects model outages before calls reach the gateway. [Bifrost configuration](bifrost/config.json).
- **Tavily (Nebius).** Search and Extract build the frozen pools. Live Search powers the Briefing Agent. During benchmarks, the proxy responds in Tavily's API format so existing Tavily clients can use the same frozen sources. [Pool builder](backend/assay/pool_builder.py).

## Tech stack

| Layer | Technology |
|---|---|
| Web | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts |
| API and storage | Python 3.12, FastAPI, uv, SQLite |
| Live updates | Server-Sent Events |
| Agent infrastructure | Bifrost, Tavily, mitmproxy, GPT Researcher |
| Packaging | Docker and Docker Compose |

## Getting started

### Run the live stack

Install and start Docker Desktop. Clone the repo and copy the environment template. In PowerShell, use `Copy-Item .env.example .env` for the copy step.

```bash
git clone https://github.com/HeyJudo/Assay-research.git
cd Assay-research
cp .env.example .env
```

Fill in `.env` before starting the stack.

| Setting | Value |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key for the benchmark agents and live briefings |
| `OPENAI_API_KEY`, `ASSAY_JUDGE_MODEL` | OpenAI API key and a GPT judge model in `openai/<model>` format. See the example in [`.env.example`](.env.example). |
| `TAVILY_API_KEY` | Tavily API key for live briefings and pool building. The benchmark uses the committed pools. |
| `BIFROST_RUN_VK_1` through `BIFROST_RUN_VK_9`, `BIFROST_JUDGE_VK` | Choose a distinct local secret for each virtual key. Each value must start with `sk-bf-`. The committed [configuration](bifrost/config.json) reads these values. |
| `BIFROST_SETUP_TOKEN` | Choose a local secret for initial Bifrost setup and log access. If you create a dashboard admin, also set `BIFROST_ADMIN_USER` and `BIFROST_ADMIN_PASSWORD` in `.env` to the matching login so Assay can read usage logs. |
| `RUN_PASSCODE` | Choose the passcode you will enter in Run. |

```bash
docker compose up --build
```

The app is at [http://localhost:8000](http://localhost:8000), the API docs are at [http://localhost:8000/docs](http://localhost:8000/docs), and the Bifrost dashboard is at [http://localhost:8080](http://localhost:8080). On an empty database, the leaderboard uses the published benchmark records. Receipts for live batches come from local SQLite.

To run the full benchmark with Bifrost running, install Python 3.12 and [uv](https://docs.astral.sh/uv/), export the `.env` values into your shell, and run `uv run python -m assay.bench` from [`backend/`](backend/).

### Try without keys

With Node installed, run these commands from the cloned repo and open the URL Vite prints. This mode uses sample results, simulates batches and shows a sample brief.

```bash
cd web
npm ci
npm run dev
```

## Deploy

The judging demo runs locally with Docker Compose. FastAPI serves the built web app and API. Compose runs Bifrost as a separate service and persists `assay.db` in the `assay-state` volume.

On a single-container Docker host, supply the same settings as environment secrets and expose port 8000. Leave `BIFROST_URL` unset so the bundled Bifrost starts on localhost. Mount persistent storage at `/app/state` to keep runs across container replacements. [Dockerfile](Dockerfile) · [Compose config](docker-compose.yml).

On a live host, `RUN_PASSCODE` protects benchmark runs and live briefings. Opening `/?code=<passcode>` fills in the passcode on Run and Briefing Agent. [API handlers](backend/assay/api.py).

**Static demo.** `npm run build:static` in [`web/`](web/) builds a server-free site from the snapshot in [`web/public/snapshot/`](web/public/snapshot/). Refresh the snapshot with `uv run python -m assay.snapshot` from [`backend/`](backend/). The public demo is this build on a Hugging Face Static Space ([config](deploy/space-README.md)).

## Methodology

- **Fixed inputs.** Agents share tasks, source pools and trap seeds. Clean twins keep the same real sources. We tune our agents on separate practice tasks and include GPT Researcher as an outside baseline. Honesty penalizes guessing on unanswerable tasks and refusing answerable ones.
- **Repeatability.** The published benchmark covers 11 tasks across four agents with three repeats each. pass³ is the share of clean, answerable tasks all three repeats pass. Accuracy spread shows how scores vary between repeats.
- **Cost and retries.** Assay uses nonzero costs from Bifrost and [list-price token estimates](backend/assay/pricing.json) when Bifrost logs no charge. Failed runs without usage show zero recorded cost. The benchmark can resume and retains failed records, including the four failed benchmark runs that were retried. [Published records](data/results/bench_runs.json).
- **Claim judge validation.** The judge agreed with the reviewed labels on 24 of 50 claims (48%). Use the quote and verdict in the receipt to inspect individual judgments. [Agreement results](data/judge_agreement.json).

[Methodology rules](docs/PRD.md#9-methodology-rules-non-negotiable-for-credibility) · [Benchmark decisions](docs/PRD.md#13-decisions-log)

## Repo layout

| Path | Contents |
|---|---|
| [`backend/assay/`](backend/assay/) | API, runner, proxy, graders and benchmark CLI |
| [`backend/agents/`](backend/agents/) | Briefing Agent versions and GPT Researcher wrapper |
| [`data/`](data/) | Tasks, frozen pools, practice data and published run records |
| [`web/src/`](web/src/) | Screens, API client and frontend fixtures |
| [`bifrost/`](bifrost/) | Gateway configuration |
| [`docs/`](docs/) | [PRD](docs/PRD.md), [hackathon requirements](docs/HACKATHON_CONTEXT.md) and screenshots |

## How we used AI

### Built with

Claude Code (Anthropic) helped with planning, the spec, code and docs. Codex (OpenAI) helped with code and docs. ElevenLabs generated the demo video's narration, sound effects and music. Claude drafted the 50 judge-validation labels, and a human reviewed each one. Every change was reviewed and merged by a team member.

### Inside the product

The agents under test use Gemini 3.5 Flash-Lite and Gemini 3.1 Flash-Lite via Google AI Studio. An OpenAI GPT model judges claims. All model calls go through Bifrost. Tavily built the frozen web pools and powers live Briefing Agent search.

## Team

**Legendary Birds**

| Member | Role | Work |
|---|---|---|
| Jude | Lead | Search proxy, pools, traps, runner, API, Bifrost and deploy |
| Krystelle | Backend | Briefing Agent and graders |
| Harvey  | Frontend | Dashboard screens |

## License

[MIT](LICENSE)
