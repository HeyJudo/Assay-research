# Judge access: hosted demo without judge keys

## Intent

Judges have no Gemini, OpenAI or Tavily keys. Today every path in the README runs on their own machine. Goal: one link, real Assay in seconds, no install, no keys, no account. Deadline extended to Nov 21. Final judging Nov 29.

## Goals

- Public URL where anyone can browse Home, Leaderboard, Receipts and Compare from the published benchmark records.
- Live benchmark runs and live briefings use the team's keys, held as server secrets.
- One judge link in the README that pre-fills the passcode, so judges never type it.

## Non-goals

- Per-judge passcodes, rate limiting, accounts.
- Persistent run history on the host. A restart resets SQLite. The leaderboard falls back to the published records.
- Vercel or any split frontend/backend host.

## Anti-goals

- Keys in the repo, the README, or a judge's machine.
- `/api/brief` reachable without the passcode.

## Constraints

- Agents join through env vars only. No agent code changes.
- Run record contract: `BriefRequest` gains `passcode`, so `backend/assay/models.py` and `web/src/types.ts` change together.
- Spend caps already in `bifrost/config.json`: run keys $20/day each, judge $10/month.
- Gemini free-tier quota is the real limit. One run or brief at a time (existing lock).

## Approaches

1. **Send judges the team's keys.** Rejected. Copies can't be revoked one at a time, a raw OpenAI key bypasses the Bifrost cap, and all judges share the Gemini quota.
2. **Vercel.** Rejected (PRD §6). No 3-minute jobs, no long-lived Bifrost or proxy, no disk.
3. **Hugging Face Space (Docker, free), passcode on runs and briefs, passcode link in README.** Picked. The Dockerfile already supports single-container hosts with bundled Bifrost.
4. Fallback if the Space fails: the same image on the user's laptop behind a Cloudflare quick tunnel.

## Decided

- Public Space. The direct `*.hf.space` URL goes in the README (query params work there, not in the huggingface.co iframe page).
- `RUN_PASSCODE` guards `/api/brief` with the same check as `/api/batches` (403 on wrong or unset).
- `?code=<passcode>` on any page is saved to `sessionStorage` and pre-fills the passcode field on Run and Briefing. The field stays visible and editable.
- The passcode is public in the README. Accepted risk: strangers can spend quota, money stays capped. Abuse response: change `RUN_PASSCODE` in Space settings and update the README.
- Space config (`sdk: docker`, `app_port: 8000`) lives in a Space-only README uploaded at deploy, not in the GitHub README.
- Deploy uploads only what the image needs (no video, deck, docs, `.env`).

## Left to the builder

- Exact copy of the README judge section and the passcode field hints.
- Upload command details and exclude list.
