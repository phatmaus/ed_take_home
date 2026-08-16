# Implementation Plan

Builds on `data_model_plan.md` (entities, derivation) and `tech_stack_plan.md` (Express + Drizzle/better-sqlite3 + React/Vite/Fluent + FullCalendar + Zod + ical-generator + qrcode + Playwright). Repo: `github.com/phatmaus/ed_take_home` (private).

## Orchestration & model policy

- **Fable (this session, medium effort) is orchestrator and sole executor** of all code. Sub-agents are used ONLY for adversarial review.
- **Critique of the no-fan-out-for-codegen rule (as requested): I agree, and would go further.** Parallel codegen agents on a 3 h project buy ~nothing: the work is serial by dependency (shared → server → client), agents can't share evolving context so they produce integration seams and style drift, and every agent-authored chunk still needs orchestrator review — which costs the tokens the fan-out "saved." Worse for this brief specifically: commit/PR clarity is graded, and multi-agent authorship produces exactly the muddy history we're trying to avoid. The one place model diversity genuinely pays is *finding defects* (different models miss different bugs — matches my experience), which is precisely where the plan uses it. The only codegen fan-out I'd ever consider here is none — even front/back parallelism fails cost-benefit since both touch `shared/`.
- **Model/effort mechanics — one limitation, flagged now, not silently at runtime:** my sub-agent tooling accepts model families (`fable`, `opus`, `sonnet`, `haiku`) + per-call effort, but **cannot pin a version like "Opus 4.8" — `opus` resolves to the current default Opus (5)**. Proposal: replace the requested Opus 4.8 reviewer with a second Opus 5 xhigh reviewer given a deliberately different lens (see reviewer instructions) to preserve the diversity intent. Any model fallback that occurs at spawn time gets reported in chat and in the review .md — never silent. "Extra" effort is mapped to `xhigh`.

## Commit / PR discipline

- Branch per phase → PR → merge to main. PRs are **compact, single-purpose, boilerplate never mixed with logic**.
- Commit prefixes: `scaffold:` (generated/boilerplate), `feat:`, `test:`, `fix(review):` (adversarial-review fixes, one per finding, referencing the finding ID from the review .md), `docs:`.
- **Eugene's own changes and changes originating from his push-back are isolated commits labeled `[eugene]`** in the subject (e.g. `fix(review) [eugene]: ...`), never folded into my commits. If Eugene edits files directly, I commit those separately with that label before continuing.
- No AI co-author trailers.

## PR sequence

| PR | Branch | Content |
|---|---|---|
| 1 | `scaffold` | `npm create vite@latest` client, minimal Express server, deps installed, version-compat check (Node LTS, Express 5 + middleware, FullCalendar React 18 peer deps, Drizzle/better-sqlite3), boilerplate stripped (Vite demo assets, default CSS). Zero logic. `tests.md` + `.gitignore` + workspace wiring (npm workspaces, dev proxy, concurrently). |
| 2 | `shared-and-backend` | TDD first: unit tests for duration derivation (bucket boundaries 4/8/9/16/17/30, custom schedules) and Zod schemas → then implement `shared/`. Drizzle schema + FK pragma + seed script including **dangerous presets**: event with exactly 1 seat left, event at full capacity, event at `minPlayers` boundary, custom-schedule event. Endpoint tests → endpoints (below). |
| 3 | `frontend` | React pages (below), Fluent components, FullCalendar, `data-testid` on every interactive/assertable element from the first render. No new logic — client calls API, reuses `shared/` validation. |
| 4 | `review-fixes-backend` | One commit per accepted finding: `fix(review): <finding-id> <summary>`. Rejected findings documented in `back_end_review.md`, not fixed. |
| 5 | `review-fixes-frontend` | Same pattern from `front_end_review.md`. |
| 6 | `e2e-docker-readme` | Golden-path Playwright spec, Dockerfile + compose, README. |

## API surface (PR 2)

- `GET /api/game-systems` — for the dropdown
- `GET /api/formats?gameSystemId=` — filtered formats
- `POST /api/events` — Zod-validated; capacity: `format.minPlayers ≤ capacity ≤ 30`
- `GET /api/events?from=&to=` — calendar feed (returns derived `endTime`, min/max duration)
- `GET /api/events/:id` — event page data (registration count, spots left)
- `GET /api/events/:id/invite.ics` — ical-generator; stable UID; derived endTime; LOCATION
- `POST /api/events/:id/registrations` — **the graded endpoint**: single transaction, `INSERT ... WHERE count < capacity` shape; errors `EVENT_FULL` (409) vs `ALREADY_REGISTERED` (409, distinct code) vs validation (400)
- `GET /api/events/:id/qr` — QR PNG data-URL of the registration URL, **built from request origin**

## Pages (PR 3)

1. **Calendar** (`/`) — FullCalendar month grid fed by `/api/events`; note on events: "runs X–Yh depending on attendance"; click → event page. Fallback (pre-agreed): Fluent grouped-by-day agenda if FullCalendar integration stalls >30 min.
2. **Create event** (`/events/new`) — game system dropdown → filtered format dropdown → name/location/start/capacity (pre-validated by shared Zod).
3. **Event page** (`/events/:id`) — details, derived duration range, spots left, QR code, `.ics` download link.
4. **Registration** (`/events/:id/register`) — name field + submit; distinct full/duplicate error rendering.

`data-testid` convention: `page-element-role`, e.g. `create-event-submit`, `event-qr-img`, `register-error-full`, `calendar-event-<id>`.

## Testing policy

- `tests.md` at repo root, updated in the same PR as any test change: table of logic/endpoints/pages × has-tests/coverage-notes/gaps.
- **TDD (test first, red → green):** duration derivation, Zod schemas, event-creation validation, registration endpoint (incl. concurrency test: parallel registrations for 1 remaining seat via `Promise.all` against a running server — exactly one 201).
- **Not TDD:** UX/components. Playwright validates UX correctness instead (golden path in PR 6).
- **Tests encode the spec (data_model_plan + this plan), never the implementation. A failing test is fixed by fixing code. A test is only edited if the test itself contradicts the spec, and only after telling Eugene which test and why.**

## Adversarial review — sub-agent instructions (for Eugene's review)

**Backend panel — launched after PR 2 merges, 2 parallel read-only agents:** Fable @ medium, Opus 5 @ high. (Eugene's revision mid-schedule: second Opus reviewer cut, efforts lowered one notch from Fable high / Opus xhigh — time budget over review depth.)

> You are an adversarial reviewer of a take-home project's backend. Repo at <path>; spec in data_model_plan.md, tech_stack_plan.md, implementation_plan.md. Your job is to BREAK it, not praise it. (1) Functional attack: start the server against a scratch DB copy; attempt capacity oversell via concurrent registrations on the 1-seat-left seed event; duplicate names (exact, whitespace, case); capacity 0/31/negative/non-numeric; events in the past; unknown formatId; malformed dates; SQL injection via playerName; verify the .ics against RFC 5545 (UID, DTSTAMP, folding, escaping, UTC) and that a full event still serves its .ics. (2) Code review: FK enforcement actually on; transaction correctness of the registration statement; Zod schemas actually applied per route; error codes distinct and correct; duration derivation vs the bucket table spec incl. boundary players counts. Do NOT edit repo files; write throwaway scripts only under your scratch dir. Output: numbered findings — severity (critical/major/minor), file:line, repro steps or failing request, expected-vs-actual. If you find nothing in a category, say what you tried. Lens split: Fable weights the functional/concurrency attack; Opus weights spec-conformance code review (derivation math, validation gaps, ICS pedantry).

**Frontend reviewer — Opus 5 @ medium, launched after PR 3 while backend fixes proceed:**

> Adversarial review of the React client (repo at <path>, spec files as above). Check: every form field validates via shared Zod schemas (not duplicated ad-hoc rules); full/duplicate registration errors render distinctly (not generic "error"); data-testid present on all interactive/assertable elements per the plan's convention; QR image resolves and encodes the request-origin URL, not localhost-hardcoded; calendar events show derived duration range; event page shows live spots-left. Code review only + running the dev server for inspection; no repo edits. Output format: same numbered-findings contract as the backend panel.

**Fix / re-review loop:** findings → `back_end_review.md` / `front_end_review.md` (verbatim findings + accept/reject + fix commit hash) → tell Eugene → fix on the review-fixes branch → **re-launch: if an Opus agent found something Fable missed, the second pass includes Opus again; otherwise Fable @ high alone.** Re-review is scoped to the fixes + regressions, not a full re-audit.

## Sequence recap (Eugene's spec, operationalized)

1. PR 1 scaffold (npm-create where possible, no token-burn on boilerplate) → verify version compat → strip boilerplate → push.
2. PR 2 shared+backend TDD + dangerous-preset seeds → push → **launch backend panel** (Fable medium + Opus 5 high).
3. While panel runs: PR 3 frontend → **launch frontend reviewer** (Opus 5 medium).
4. Panel done → `back_end_review.md` → notify Eugene → PR 4 fixes → re-review per loop rule.
5. Frontend review done → `front_end_review.md` → PR 5 fixes.
6. PR 6: golden-path Playwright e2e (no edge-case repro — the panel owned edges), Dockerfile + `docker compose up` (default: **seeded sample DB**; `EMPTY_DB=1 docker compose up` for empty), README ≤1 page: run commands (docker + local), design write-up (capacity/concurrency story, template system + 4th-game story, cut list), AI-usage note distilled from `ai_usage.md`.

## Timebox budget (3 h dev clock)

Scaffold 20' · shared+backend TDD 55' · frontend 50' · review fixes 25' · e2e+docker+readme 30'. Buffer: none — cuts come from frontend polish first, then docker (compose is a "plus", not required).
