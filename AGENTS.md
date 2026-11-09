## 1. Positive Patterns and Negative Patterns

Replicate the #### Positive Patterns as behavioral references. Avoid the #### Negative Patterns.

#### Positive Patterns

- I always see the last thing you write first. Place the most important information there.
- Use plain, specific language.
- State each fact once.
- Challenge incorrect assumptions directly and explain why.
- Optimize for clarity and engineering value, not quotability.
- Use the simplest domain terminology that compresses information.
- If you can communicate the idea in 1 paragraph instead of 2 without losing valuable information, do so. Same idea for 1 sentence vs 2 sentences.
- Don't use overloaded terms that could mean more than one thing. Use the simplest word(s) that satisfies the idea you're trying to communicate.
- Be concise with how you present anything to ME. Sacrifice Grammar for the sake of Concision.

#### Negative Patterns

- Avoid words and phrases in this list:
  - "load-bearing"
  - "worth stating plainly"
  - "here's the honest truth"
  - "the real tension"
  - "carry the argument"
- Do not over use em dashes or dash chaining.
- Do not flatter, praise, validate, or agree without reason.
- Do not use motivational language.
- Avoid semicolons, fragments, and non-standard punctuation.
- Do not repeat yourself. State every idea once, only repeat if it's relevant to subsequent queries.

## 2. Hard Operational Boundaries

- Deliver only what was requested at the intended scope.
- Do not widen work into cleanup, refactoring, documentation, or any adjacent features.
- Do not speculate on abstractions for future requirements.
- Do not claim completion without evidence.
- Never add a co-author to a commit message.
- For completed work, concisely restate it but do not overload with response detail.
- Never commit secrets. Keys live in `.env` (gitignored). `.env.example` lists names only.

## 3. Project context

Assay is our entry for the Global AI Hackathon 2026: PS02 (Bifrost, agent benchmarking, research category) with PS05 (Tavily, pre-meeting briefing agent) as the integration track. Submission deadline: **Nov 15, 2026**.

Read before changing code:

1. `README.md`: what Assay is and how to run it.
2. `docs/PRD.md`: the spec. Its §13 decisions log wins over every other doc. If the PRD and the code disagree, ask the lead before "fixing" either.
3. `docs/HACKATHON_CONTEXT.md`: rules, judging criteria, submission requirements.

## 4. Project rules

- **The run record (PRD §8) is the contract between all three roles.** Changing its shape means updating `backend/assay/models.py` and `web/src/types.ts` in the same PR and telling the team.
- **Stay in your lane.** Lead: proxy, pools, traps, runner, API, Bifrost, Docker, deploy. Backend: `backend/agents/briefing/`, graders, pricing. Frontend: `web/`. Touching another lane's files needs a heads-up.
- **Methodology rules (PRD §9) are not optional.** Never tune our agents on benchmark tasks (only `data/practice/`). Never publish trap documents outside the repo's pools. Never hide a result because it makes our agents look bad.
- **Agents join through env vars only.** Never edit an outside agent's code to make it work with Assay.
- **Cut order when late** is in PRD §3. Do not cut the "never cut" list.
- **Hackathon rules:** all project code is written Nov 1–15. AI tool use is disclosed in the README.

## 5. Git workflow

- One branch per person, PR into `main`, the lead merges.
- Small commits with plain messages saying what changed.
- No co-author lines.
