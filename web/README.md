# Assay frontend

Run from `web/` with `npm ci` and `npm run dev`. Open the local address printed by Vite. `npm run build` type-checks and creates `dist/` for the existing backend to serve.

## What works

All six PRD routes: overview, weighted leaderboard with cost/accuracy chart, benchmark setup and progress grid, scoped comparison, detailed receipt with export and source passages, and briefing form/output.

Demo mode is the default. Existing JSON under `src/fixtures/` remains unchanged. Simulated batches are generated in `src/lib/data.ts`, respond to chosen agents/task/trap, and stay in memory until a refresh. Their outcomes are synthetic and must not be presented as benchmark measurements. The brief generator produces an explicitly unresearched sample for the entered subject. Existing aggregate fixtures and individual receipts are independent samples, not a complete reconciled benchmark.

## Backend handoff

Set `VITE_DATA_MODE=api` and optionally `VITE_API_BASE_URL=http://localhost:8000` in `web/.env.local`, then restart Vite. With a separately hosted API, configure its CORS policy on the backend. A same-origin production deployment needs no base URL. No provider secrets belong in `VITE_` variables.

`src/lib/data.ts` is the single transport boundary. It uses the existing `src/types.ts` run contract without changing it. API errors remain errors, with no silent fixture fallback.

- Reads: `/api/agents`, `/api/tasks`, `/api/leaderboard`, `/api/runs`, `/api/runs/{id}`.
- Batch creation: `POST /api/batches` with existing `BatchRequest`, then named SSE events from `/api/batches/{id}/stream`. Passcodes stay in component memory and are cleared after success.
- Briefing: `POST /api/brief` with subject, UTC meeting time, and agent ID as version. Poll `/api/runs/{id}` until terminal. Backend must implement this endpoint and confirm its version naming. It is not implemented in the checked-out backend yet.
- Batch comparisons calculate from that batch's completed records, rather than calling the backend comparison stub that currently returns full fixture aggregates. Missing metric denominators render as unavailable. Full rankings use the leaderboard endpoint.

The current API still serves fixture leaderboard/agent/task lists. API mode does not imply those values are real. Server-side batch budgeting remains server-owned. This UI sends the contract's passcode and fixed three repeats; it does not introduce unsupported budget/repeat fields.

The aggregate contract supplies no spread or judge-validation statistics. The UI does not invent them. Model costs are labeled as recorded/list-price values. Research and judge totals cannot be independently recovered from the current run record. Historical fixture model names are shown as recorded.

## Checks

`npm run build` verifies types and production compilation. `node --test tests/metrics.test.mjs` checks priority re-ranking, empty weights, no-success cost, repeat reliability, and missing-denominator behavior (Node 24+ for TypeScript stripping).

## PR review corrections

Results provenance is explicit: `VITE_RESULTS_ARE_FIXTURES` defaults to true, including API mode because the current leaderboard endpoint still serves fixtures. Set it to `false` only when the server supplies measured aggregates. Simulated batches are always labeled independently of that setting. Agent names come from `/api/agents`.

The startup splash and duplicate sidebar launch control were removed. Sidebar navigation scrolls at constrained heights; phone navigation exposes all five short labels. Colors live in the canonical shadcn variables in `index.css`; both stylesheets use those tokens. Button and Card were installed from the shadcn registry.

Run `npm test` for metric and EventSource reconnection tests. Backend variance and judge-agreement fields remain a lead decision and are not invented here.
