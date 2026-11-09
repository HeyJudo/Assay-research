# Global AI Hackathon 2026: Context

Reference for AI sessions working on this project. Source: https://hackculture.io/hackathons/ai-global-hackathon (JavaScript-rendered: read it with a browser, not a plain fetch) and the organizer's problem-statement PDFs (not in this repo). Facts checked on 2026-11-06.

## Basics

- **Organizer:** Geek Room, hosted on HackCulture. Contact: team@geekroom.co.in
- **Format:** online, global. Teams of 1–4; each person on one team only.
- **Our team:** 3 people. The lead has 5+ hackathons of experience; the other two are first-timers, mostly React web devs, one leaning backend. We build with AI-assisted development.
- **Discord is mandatory** for announcements: https://discord.gg/WBvcRKg8t

## Dates

| Event | Date |
|---|---|
| Problem statements released, build window opens | Nov 1, 2026 |
| **Submission deadline** | **Nov 15, 2026, 11:59 PM** |
| Final judging (shortlisted teams, online) | Nov 29, 2026, 7:00–11:59 PM |
| Tavily coupon expires | Nov 28, 2026 |

## Submission requirements

- **Required:** a public GitHub repo with working code and a detailed README (project, features, setup and install steps, implementation, technologies used), plus a **PPT** covering the problem, solution, technical architecture, implementation and prototype demo.
- **Optional:** a deployed app and a demo video (we plan to do both).
- The README must let judges understand and run the project.
- AI tool usage must be disclosed in the submission.
- If both sponsors are used, the README and PPT must explain how each one contributes.
- **How to submit:** on HackCulture, go to Manage → Submissions → "Problem Statements & Prototype Submission". Select the problem statement, title, repo URL, PPT and optional video, then Save.
- **Combining tracks:** select the Bifrost problem statement as primary, then tick the Tavily problem statement in the optional integration checkbox.

## Rules

1. The core project must be built during the hackathon (Nov 1–15). Existing libraries, frameworks and boilerplate are allowed.
2. AI tools are encouraged but must be disclosed.
3. Work must be original and properly licensed. Plagiarism means disqualification.
4. Third-party APIs and open source are fine if licenses and terms are respected.
5. One final project per team. The FAQ also allows separate Bifrost and Tavily entries; we submit one.
6. No illegal, malicious or harmful projects.
7. Organizers' decisions are final.

## Judging criteria

The criteria are innovation, technical execution, problem and potential impact, use of AI, user experience, and scalability and potential. **No weights are published**, so treat them as equal.

## Prizes

- **Bifrost / Maxim AI track:** $1,000 cash pool.
- **Tavily track:** 50,000 API credits shared by the top 3.
- An integrated project that meaningfully uses both technologies can compete for both pools. Using both does not guarantee a higher score.
- **Free for every participant:** 8,000 Tavily credits each. Redeem code `GEEKROOM2` at app.tavily.com before Nov 28.
- Everyone receives a certificate.
- The "$11.5K prize pool" headline mostly counts credits.

## Sponsors

- **Bifrost (by Maxim AI):** title and track partner. An open-source AI gateway: routing, failover, caching, logging, budgets. Maxim AI also sells agent simulation and evaluation, so expect them to judge.
- **Tavily (by Nebius):** track partner. A search and extraction API for AI agents.
- **Omnidimension** (voice AI) and **Pathway:** community partners, not required.

## The six problem statements

| # | Sponsor | Challenge | Hard requirements |
|---|---|---|---|
| 01 | Bifrost | Coding agent that uses the fewest tokens | Survives provider outages and tells the user when another model takes over; per-user spending limits checked before each model call; confidential repos go to local models only; reads are free, but writes, shell and git need approval that prompts can't override |
| **02** | Bifrost | **Benchmarking platform for agents, not just models** (category: coding, research or support) | Framework-independent; same tasks for every agent, recording success, steps, tool calls, tokens, cost and time; repeated runs; controlled failures (model down, broken tool, misleading instructions); comparison UI with step-by-step traces |
| 03 | Bifrost | Autonomous pentest agent | Runs in an organizer lab; real security tools; any out-of-scope action means automatic failure; produces a security report |
| 04 | Bifrost | Open-source contribution: a missing Bifrost feature | Uses public extension points; works on a standard install; tests, docs, quality good enough for an upstream PR |
| **05** | Tavily | **Pre-meeting briefing agent** | Input is a company or person plus a meeting time; output is a one-page brief of the last 30 days with sources and open questions; separates verified facts from uncertain ones |
| 06 | Tavily | Stale-answer detector | Pulls time-sensitive claims out of an LLM answer, flags ones that may be outdated, re-checks them live, gives each claim a freshness score |

**Our choice:** 02 as primary (research-agent category) with 05 as the Tavily add-on. The project is called **Assay**; see [`PRD.md`](PRD.md).

## Known conflicts and gotchas

- The PS06 PDF says Tavily + Bifrost are mandatory, while the FAQ says neither is. To confirm on Discord if it matters.
- Rule 8 says one submission per team, while the FAQ allows separate Bifrost and Tavily entries.
- **Positioning:** other PS02 entries may target general tool-use tasks. Assay's angle is the research category: frozen web, traps, claim-level checks.
