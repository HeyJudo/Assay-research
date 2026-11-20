<p align="center">
  <img src="docs/images/assay-wordmark-color.png" alt="Assay" width="300">
</p>

<p align="center"><strong>Know which research agent to trust, and why.</strong></p>

<p align="center">
  <a href="https://heyjudo-assay.static.hf.space"><img src="https://img.shields.io/badge/Live_demo-open-B45309?style=for-the-badge" alt="Live demo"></a>
  <a href="https://drive.google.com/file/d/17u86gcrxQa9aCrrcDeHq_-4jH2z0gFrF/view"><img src="https://img.shields.io/badge/Demo_video-watch-553D30?style=for-the-badge" alt="Demo video"></a>
  <a href="https://hackculture.io/hackathons/ai-global-hackathon"><img src="https://img.shields.io/badge/Global_AI_Hackathon-2026-553D30?style=for-the-badge" alt="Global AI Hackathon 2026"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-553D30?style=for-the-badge" alt="MIT license"></a>
</p>

Assay benchmarks research agents on the same frozen web pages, repeats every run three times, plants traps, and checks each claim against its cited source.

- **Frozen web.** Every agent searches the same saved Tavily pages, so a score reflects the agent and not the day's search results.
- **Planted traps.** Fake articles, hidden instructions, search outages and model outages show how each agent fails.
- **Run receipts.** Every search, page read, model call, cost and claim verdict is recorded for each run.
- **Priority leaderboard.** Agents are ranked by accuracy, cost, trap resistance and honesty, weighted the way you choose.

<p align="center">
  <a href="docs/images/leaderboard.png"><img src="docs/images/leaderboard.png" alt="Leaderboard with priority sliders, agent rankings and a cost versus accuracy chart" width="720"></a>
</p>

## Contents

[Quick start](#quick-start) · [For judges](#for-judges) · [Results](#results) · [How it works](#how-it-works) · [Sponsors](#sponsors) · [Methodology](#methodology) · [Tech stack](#tech-stack) · [How we used AI](#how-we-used-ai) · [Team](#team)

## Quick start

### 1. Try the hosted demo

No install, no keys and no passcode. Open **[heyjudo-assay.static.hf.space](https://heyjudo-assay.static.hf.space)**.

1. Open **Run**. Click **Next** through the preselected agents. Pick a task marked "supports planted traps", click **Next**, then **Start replay**.
2. When **Results** opens, click a run under **Receipts**. Expand **Show all steps** and read the claim verdicts.
3. Open **Leaderboard** and drag a priority slider.
4. Open **Briefing Agent**, pick a recorded brief and a version, then click **Show the recorded brief**.

> [!NOTE]
> The hosted demo shows the published benchmark: the leaderboard, comparisons and all 136 run receipts, failed runs included. **Run** replays recorded runs and labels them as replays. It makes no live model calls.

### 2. Run it locally with Docker

Live benchmark runs and live briefings need Docker Desktop and your own API keys.

```bash
git clone https://github.com/HeyJudo/Assay-research.git
cd Assay-research
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Fill in `.env`:

| Setting | What to put there |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key. Runs the benchmark agents and live briefings. |
| `OPENAI_API_KEY` | OpenAI key for the claim judge. |
| `ASSAY_JUDGE_MODEL` | The judge model in `openai/<model>` format, for example `openai/gpt-4.1-mini`. |
| `TAVILY_API_KEY` | Tavily key for live briefings. Benchmarks use the committed pools instead. |
| `BIFROST_RUN_VK_1` to `BIFROST_RUN_VK_9`, `BIFROST_JUDGE_VK` | Make up a different value for each, starting with `sk-bf-`. They are local Bifrost keys, not provider keys. |
| `BIFROST_SETUP_TOKEN` | Make up any secret. Bifrost uses it for setup and log access. If you create a Bifrost dashboard admin, also set `BIFROST_ADMIN_USER` and `BIFROST_ADMIN_PASSWORD`. |
| `RUN_PASSCODE` | Make up a passcode. See below. |

> [!IMPORTANT]
> **`RUN_PASSCODE` is a password you choose, for example `RUN_PASSCODE=blue-otter-59`.** Live runs and live briefings spend real API budget, so Assay refuses them unless the **Team passcode** you type in the app matches this value exactly. If it is empty, every live request is refused. Opening `http://localhost:8000/?code=<passcode>` fills it in for you.

Start the stack:

```bash
docker compose up --build
```

| Address | What it is |
|---|---|
| [localhost:8000](http://localhost:8000) | The Assay app |
| [localhost:8000/docs](http://localhost:8000/docs) | API docs |
| [localhost:8080](http://localhost:8080) | Bifrost dashboard |

Then run a live batch:

1. Open **Run**. Click **Next** through the preselected agents and Tavily briefing task.
2. Keep **No trap**, enter your passcode in **Team passcode**, and click **Start benchmark**. A batch takes 1 to 3 minutes.
3. When **Results** opens, click a run under **Receipts** to see its steps, cost and claim verdicts.
4. Open **Briefing Agent**, enter a company or person and a meeting time, and click **Write the brief**.

### 3. Try the interface without keys

Requires Node. This mode uses sample results and simulated batches.

```bash
cd web
npm ci
npm run dev
```

## For judges

| Track | Problem statement | Our entry |
|---|---|---|
| Primary: Bifrost | PS02, agent benchmarking, research category | Repeatable head-to-head tests with run receipts |
| Integration: Tavily | PS05, pre-meeting briefing agent | A live briefing agent whose three versions compete on Assay |

| Requirement | Where to check |
|---|---|
| PS02: framework-independent | **Run** includes GPT Researcher next to our own agents. The [runner](backend/assay/runner.py) passes gateway and proxy settings through environment variables, and the [GPT Researcher wrapper](backend/agents/gpt-researcher/run) runs the upstream agent unchanged. |
| PS02: same tasks, recorded metrics | **Run** gives every agent the same task. **Receipt** shows success, steps, tool calls, tokens, cost and time, as defined in the [run record](backend/assay/models.py). |
| PS02: repeated runs | **Run** shows three repeats per agent. **Leaderboard → More** shows pass³ and accuracy spread. |
| PS02: controlled failures | **Run** offers **Fake article**, **Hidden instruction**, **Search outage** and **Model outage**. See the [search proxy](backend/assay/proxy.py) and [model outage handler](backend/assay/outage.py). |
| PS02: comparison UI and step traces | **Results** compares agents head to head. **Receipts** list every search, page read, model call and error. |
| PS05: company or person plus meeting time | **Briefing Agent** asks for both before it starts. |
| PS05: one-page brief for the last 30 days, with sources and questions | **Briefing Agent** shows a cited brief and open questions. The [briefing prompt](backend/agents/briefing_agent.py) covers the 30 days before the meeting. |
| PS05: verified and uncertain facts separated | **Briefing Agent** gives **Verified**, **Uncertain** and **Not found** their own sections. |

## Results

From the published benchmark: 4 agents, 11 tasks, 3 repeats each, 132 counted runs.

| Finding | Number |
|---|---|
| Most accurate agent | GPT Researcher, 42% (Baseline 25%) |
| Its cost per correct answer | 4.7× Baseline ($0.025 vs $0.0053) |
| Trap resistance | GPT Researcher 50%, our three versions 25% |
| Evidence-gated accuracy | 17%. Our claim check did not help. |
| Claim judge agreement with human labels | 48% (24 of 50), so treat claim verdicts as indicative |

[Published records](data/results/bench_runs.json) · [Judge agreement](data/judge_agreement.json)

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

- **Runner.** Starts each agent as a subprocess and builds its trace from Bifrost usage logs and the proxy's search and read logs.
- **Search proxy.** Serves stored pages, blocks anything outside the pool, and injects traps.
- **Claim judge.** A claim counts as supported only with a verbatim quote from a cited pool document.
- **Concurrency.** Up to three agents per batch, with repeats in parallel. The app runs one live batch or briefing at a time.

## Sponsors

<table>
  <tr>
    <td width="200" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/brand/bifrost-white.png">
        <img src="docs/images/brand/bifrost.png" alt="Bifrost" height="32">
      </picture>
    </td>
    <td>Routes every model call for the agents and the judge. Virtual keys give each run slot its own budget, and Bifrost's logs supply the tokens, model names and costs on each receipt. <a href="bifrost/config.json">Configuration</a></td>
  </tr>
  <tr>
    <td width="200" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/brand/tavily-white.png">
        <img src="docs/images/brand/tavily.png" alt="Tavily" height="40">
      </picture>
    </td>
    <td>Search and Extract built the frozen page pools, and live Search powers the Briefing Agent. During benchmarks, the proxy answers in Tavily's API format, so existing Tavily clients work unchanged. <a href="backend/assay/pool_builder.py">Pool builder</a></td>
  </tr>
</table>

## Methodology

- **Fixed inputs.** Agents share tasks, page pools and trap seeds. Each trapped task has a clean twin with the same real sources.
- **No tuning on the benchmark.** We tuned our agents only on separate practice tasks, and GPT Researcher runs as an outside baseline.
- **Honesty.** Guessing on unanswerable tasks and refusing answerable ones both count against an agent.
- **Repeatability.** pass³ is the share of clean, answerable tasks where all three repeats pass.
- **Cost.** Uses Bifrost's recorded cost, or [list-price estimates](backend/assay/pricing.json) when Bifrost logs no charge.
- **Nothing hidden.** Failed runs stay in the records, including the four errored runs that were retried.

[Methodology rules](docs/PRD.md#9-methodology-rules-non-negotiable-for-credibility) · [Decisions log](docs/PRD.md#13-decisions-log) · [Research behind the design](docs/PRD.md#why-it-matters-evidence-for-the-deck)

## Tech stack

<p>
  <img src="https://skillicons.dev/icons?i=react,ts,vite,tailwind,python,fastapi,sqlite,docker" alt="React, TypeScript, Vite, Tailwind CSS, Python, FastAPI, SQLite, Docker">
</p>

| Layer | Technology |
|---|---|
| Web | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts, Motion |
| API and storage | Python 3.12, FastAPI, uv, SQLite, Server-Sent Events |
| Agent infrastructure | Bifrost, Tavily, mitmproxy, GPT Researcher |
| Packaging | Docker, Docker Compose, Hugging Face Static Space |

<details>
<summary>Build and deploy details</summary>

- **Full benchmark.** With Bifrost running, install Python 3.12 and [uv](https://docs.astral.sh/uv/), export the `.env` values, and run `uv run python -m assay.bench` from [`backend/`](backend/).
- **Static demo.** `npm run build:static` in [`web/`](web/) builds a server-free site from [`web/public/snapshot/`](web/public/snapshot/). Refresh the snapshot with `uv run python -m assay.snapshot` from `backend/`. The hosted demo is this build on a Hugging Face Static Space ([config](deploy/space-README.md)).
- **Single-container host.** Supply the `.env` values as secrets, expose port 8000, leave `BIFROST_URL` unset so the bundled Bifrost starts, and mount storage at `/app/state`. [Dockerfile](Dockerfile) · [Compose config](docker-compose.yml)

</details>

<details>
<summary>Repo layout</summary>

| Path | Contents |
|---|---|
| [`backend/assay/`](backend/assay/) | API, runner, proxy, graders and benchmark CLI |
| [`backend/agents/`](backend/agents/) | Briefing Agent versions and GPT Researcher wrapper |
| [`data/`](data/) | Tasks, frozen pools, practice data and published run records |
| [`web/src/`](web/src/) | Screens, API client and frontend fixtures |
| [`bifrost/`](bifrost/) | Gateway configuration |
| [`docs/`](docs/) | [PRD](docs/PRD.md), [hackathon requirements](docs/HACKATHON_CONTEXT.md) and screenshots |

</details>

<details>
<summary>More screens</summary>

| Run a benchmark | Write a meeting brief |
|:---:|:---:|
| [![Run screen with agent selection](docs/images/run.png)](docs/images/run.png) | [![Briefing Agent form](docs/images/briefing.png)](docs/images/briefing.png) |

![Run receipt with model usage and claim evidence](docs/images/receipt.png)

![Home screen with benchmark findings](docs/images/home.png)

</details>

## How we used AI

- **Building.** Claude Code (Anthropic) helped with planning, the spec, code and docs. Codex (OpenAI) helped with code and docs. Every change was reviewed and merged by a team member.
- **Judge labels.** Claude drafted the 50 judge-validation labels, and a person reviewed each one.
- **Demo video.** ElevenLabs generated the narration, sound effects and music.
- **Inside the product.** The agents under test use Gemini 3.5 Flash-Lite and Gemini 3.1 Flash-Lite. An OpenAI GPT model judges claims. Every model call goes through Bifrost.

## Team

**Legendary Birds**

| Member | Role | Work |
|---|---|---|
| Jude | Lead | Search proxy, pools, traps, runner, API, Bifrost and deploy |
| Krystelle | Backend | Briefing Agent, graders and pricing |
| Harvey | Frontend | React app, run receipt and leaderboard |

<a href="https://github.com/HeyJudo/Assay-research/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=HeyJudo/Assay-research" alt="Contributors">
</a>

## License

[MIT](LICENSE)
