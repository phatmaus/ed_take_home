# Backend Adversarial Review — Findings & Triage

Panel: Fable @ medium (functional/concurrency lens) + Opus 5 @ high (spec-conformance lens), parallel, read-only, both ran live servers on scratch DBs. No model fallback occurred. Overlap: Fable's 3 findings were all also found by Opus (with deeper analysis), Opus found 15 more → per the loop rule, **Opus is included in the re-review pass**.

IDs: BE-n (combined, ordered by severity). Verdicts by Fable orchestrator; fixes in PR 4 as `fix(review): BE-n` commits.

## Majors

| # | Finding (found by) | Verdict |
|---|---|---|
| BE-1 | **Duplicate registration on a FULL event returns `EVENT_FULL`, masking `ALREADY_REGISTERED`** — the capacity WHERE short-circuits before the UNIQUE index can fire, so the distinct-code contract breaks on the most likely real path (already-registered player re-scans at a sold-out event). Opus also showed the existing concurrency test is structurally incapable of catching this (uses 6 distinct names on the one seeding where the bug can't appear). (Fable + Opus) | **Accept.** Probe for the existing registration first, then the atomic insert; new test: duplicate name on the full seed event → `ALREADY_REGISTERED`. Existing tests unchanged (they're correct for open events). |
| BE-2 | **A format with `minPlayers < 4` 500s the whole calendar feed** — `swissRounds` throws below 4, `enrichEvent` calls it unguarded, one bad row blanks every event (also `/events/:id`, `.ics`). Directly contradicts the model's "minPlayers is data, not a constant" and the "4th game = data only" promise (a min-2 board-game night is the named use case). (Opus) | **Accept, with a spec-level test edit — flagged to Eugene below.** Fix: clamp the low end (players < 4 derive as the 4–8 bucket → 3 rounds), keep the non-integer/overflow throws, and add per-row isolation in the events feed (BE-17's guard half). |
| BE-3 | **No error middleware**: malformed JSON bodies, unknown /api routes, and any unhandled throw return Express's HTML pages with **stack traces + absolute paths**; breaks the JSON error contract everywhere. (Fable + Opus) | **Accept.** JSON body-parse 400, JSON /api 404 fallthrough, JSON 500 (no stack). |
| BE-4 | `GET /api/events?from/to`: unvalidated, lexicographic string compare — `?from=banana` silently empties the calendar; precision mismatch (`00Z` vs `00.000Z`) drops events inside the window. (Opus) | **Accept.** Zod-validate bounds (400 on garbage), compare as instants, normalize `startTime` via `toISOString()` at insert. |
| BE-5 | "Every Schedule has exactly one child" invariant unenforced: an orphan SWISS row yields silent 0-minute events and an RFC-invalid `DTEND == DTSTART` .ics (type assertion hides it). (Opus) | **Accept (lite).** `scheduleInfo` throws loudly on missing child; DDL CHECKs: `time_in_minutes > 0`, swiss minutes ≥ 0 with `round_timer > 0`. |

## Minors

| # | Finding (found by) | Verdict |
|---|---|---|
| BE-6 | .ics not terminated by final CRLF (RFC 5545 §3.1). Everything else RFC-verified clean: folding octet-exact incl. multibyte, escaping, UTC, UID stability. (Opus) | **Accept** (`+ '\r\n'`). |
| BE-7 | No year bounds on `startTime`: year 0 / 9999 produce malformed `DTSTART`/overflowed `DTEND` that Google/Outlook reject. (Opus) | **Accept.** Zod refine: year 2000–9000. |
| BE-8 | QR origin trusts an attacker-controlled Host header; ignores `X-Forwarded-*` behind TLS terminators. (Opus) | **Reject (documented).** No-auth LAN dev tool per brief; a Host-header attacker is outside the threat model; README notes `trust proxy` as the production step. |
| BE-9 | `/api/formats?gameSystemId=abc` fails open → ALL games' formats (typo shows Yu-Gi-Oh! formats under Magic); only route family with no Zod. (Fable noted; Opus detailed) | **Accept.** Zod query schema: valid int filters, omitted = all, garbage = 400. |
| BE-10 | Path ids accept `04`, `0x4`, `1e0`, `+4`, ` 4` (URL aliasing); non-numeric → 404 not 400. (Opus) | **Accept.** `/^\d+$/` guard → 400 `INVALID_ID`; absent → 404. |
| BE-11 | Past events creatable + registrable; spec silent. (Fable + Opus) | **Reject (documented).** Organizers may back-date; README cut list. |
| BE-12 | Shared capacity schema floor (1) doesn't encode `format.minPlayers` (client can't pre-validate the real rule — pairs with FE-5); `MAX_CAPACITY` written thrice (Zod, DDL literal, nowhere linked). (Opus) | **Accept.** Shared `createEventSchemaFor(minPlayers)` factory (FE-5's fix, used both sides); DDL interpolates `MAX_CAPACITY`. |
| BE-13 | Drizzle schema/DDL drift (CHECK only in DDL); SWISS value-object dedup enforced by convention while CUSTOM has UNIQUE. (Opus) | **Accept (lite).** DDL CHECKs from BE-5 + UNIQUE index over the four swiss param columns; comment in schema.ts pointing at DDL as constraint source of truth. |
| BE-14 | Duplicate detection matches the English error string; `err.code === 'SQLITE_CONSTRAINT_UNIQUE'` is the stable discriminator. (Opus) | **Accept.** |
| BE-15 | Identity defeated by one Shift key: "alice"/"Alice" and inner-whitespace variants take extra seats (Fable + Opus). | **Accept.** `COLLATE NOCASE` on the unique index + inner-whitespace collapse in the shared schema transform. |
| BE-16 | UID `@ed-take-home` isn't a domain → cross-deployment collisions in the same Google Calendar. (Opus) | **Accept (cheap).** `APP_DOMAIN` env, default `ed-take-home.example`. |
| BE-17 | Events feed is N+1 (4 queries/event) with no per-row isolation (the amplifier for BE-2). (Opus) | **Accept the isolation half** (per-row guard, skip+log bad rows). **Reject the perf half** — store scale; README note. |
| BE-18 | `tests.md` says "no known gaps" while duplicate-on-full, param handling, and RFC-level .ics assertions were untested. (Opus) | **Accept.** New tests for BE-1/4/9/10/15; honest gap list in tests.md. |

## Clean (both reviewers, live-verified)

Concurrency oversell: unbreakable in-process (20 parallel: exactly one 201) **and cross-process** (Opus ran two server processes on one WAL DB, 40 interleaved: still exactly one 201 — the single-statement guard holds beyond the single-process argument). SQL injection: fully parameterized, drop-table payloads stored as harmless text. Swiss bucket boundaries and derivation math: exact to spec at every boundary. Zod validation battery (capacity/date/name/prototype-pollution): all correct. Full event still serves its .ics. FK enforcement live-verified.

## ⚠️ Spec-level test change (BE-2) — Eugene informed

`shared/src/schedule.test.ts` asserted `swissRounds(3)` throws. That test encoded my (Fable's) bucket-table floor, but it contradicts the *approved data model's* explicit promises ("minPlayers is data, not a constant"; "4th game/non-card game = one template entry, zero core changes"). I am confident the test was wrong at the spec level and am changing it to assert clamping (players < 4 → 3 rounds), keeping the non-integer and >256 throws. Flagged here per the tests-are-spec rule.

---

## Second pass (scoped re-review): Fable @ medium (repro re-runs) + Opus 5 @ high (diff-driven regression hunt)

**Verdicts:** all accepted findings **FIXED** (BE-13/BE-18 partial: missing schema.ts pointer comment; stale tests.md row). Concurrency guard re-verified unbroken: 20 parallel distinct-name and 20 parallel case-variant registrations both yield exactly one 201. Eugene suggested swapping the model lenses for pass two; kept as-is mid-flight (Opus-high demonstrably stronger on the code-read task) — logged judgment call.

**New findings (REG-*), all triaged Accept unless noted:**

| # | Sev | Finding | Resolution |
|---|---|---|---|
| REG-1 | medium | DDL fixes (NOCASE, CHECKs) are inert on pre-existing DB files — `CREATE IF NOT EXISTS` never alters; live-repro'd a case-duplicate 201 on a legacy DB. | **Fixed:** `user_version` schema stamp; legacy files refused at boot with a delete-and-reseed message. |
| REG-2 | med-low | `ux_swiss_params` can brick boot on a legacy DB holding pre-fix duplicate rows (raw stack, no listen). | **Fixed** by the same version guard (legacy DBs never reach DDL execution). |
| REG-3 | low-med | New error middleware collapsed body-parser 4xx (413 too-large, 415) into 500s. | **Fixed:** honors `err.status` < 500, keeps JSON contract. |
| REG-4 | low | `APP_DOMAIN=` (empty env) produced RFC-invalid `UID:event-4@`. | **Fixed:** trim-or-default. |
| REG-5 | low | `min_players` had no CHECK — a 0 value now *silently vanishes* from the feed under BE-17's isolation. | **Fixed:** `CHECK (min_players > 0)`. |
| REG-6 | low | from/to rejected date-offset forms and empty strings. | **Fixed:** `datetime({offset:true})`, empty = omitted. |
| REG-7 | low | tests.md still described the pre-BE-2 throw behavior. | **Fixed** in ledger. |
| — | note | `COLLATE NOCASE` is ASCII-only (`Renée`/`RENÉE` = two seats). | **Accepted-documented** (tests.md gap list). |
| — | note | Docker static/SPA layers register after the JSON error middleware (errors there fall to Express default handler). | **Accepted-documented**; benign for static file serving, revisit if the server ever grows non-API HTML routes. |

All REG fixes TDD'd (6 specs red-first: `server/src/db.test.ts`, REG block in `app.test.ts`); suite now 63 unit/API tests + 2 e2e, all green.

---

## Third pass (lens swap, per Eugene): Opus 5 @ high functional attack · Fable @ medium diff/code read

Scope: REG-fix verification + the previously-unreviewed PR 6 layer (docker, static/SPA, e2e config). All REG-1..7 re-repro'd FIXED by both lenses. Concurrency re-verified deeper than ever: in-process, cross-process (2 servers/1 WAL DB), and a 25-pair case-variant duplicate race — zero oversells, zero 500s. Static layer survived a full path-traversal battery.

**The swap paid off — findings by severity (P3-*, consolidated across both reviewers):**

| # | Sev | Finding | Resolution |
|---|---|---|---|
| P3-1 | **high** | `E2E_DB_PATH=""` (empty string — the exact `${VAR:-}` idiom compose files use) survived `??` and turned the Playwright webServer cleanup into **`rm -f *` in the repo root**; live-demonstrated in a sandbox. Also unquoted (word-splitting) and a predictable world-writable /tmp path. | **Fixed:** `\|\|` + trim, quoted interpolation, per-process tmpdir default. |
| P3-2 | med-high | Every container restart re-ran the seed → all user data wiped AND ids renumbered (AUTOINCREMENT), so distributed QR links/ICS UIDs 404 after any `docker restart`. Found independently by both reviewers. | **Fixed:** seed only when the DB file doesn't exist; restarts preserve everything. README updated. |
| P3-3 | medium | `EMPTY_DB=1` produced a permanently unusable app (no templates, no admin UI → no way to ever create an event) while the README advertised it as a supported mode. | **Fixed:** empty mode seeds templates (games/formats/schedules) but no sample events; seed script owns the branch. |
| P3-4 | low-med | `HEAD` on client routes 404'd while `GET` 200'd (RFC 9110) — link checkers/unfurlers report QR links dead. | **Fixed:** fallback accepts GET+HEAD. |
| P3-5 | low | SPA/API split by string prefix: `//api/health` got HTML 200, `/apix` got Express's HTML error page. | **Fixed:** slash-collapsed segment-aware check + JSON catch-all after the fallback. |
| P3-6 | low | README/tests.md counts stale (57 vs 63); REG-6 test title claimed date-only bounds it neither tests nor the API accepts. | **Fixed:** counts corrected; test retitled (title-only edit, no assertion change). |
| P3-7 | low | e2e hard-fails when ports 3001/5173 are busy; register test non-idempotent under retries (consumes the last seat). | **Accepted-documented** (README ports note, tests.md gap). |
| P3-8 | low/doc | db.ts guard ordering: WAL pragma (a write) ran before the version check, so legacy/read-only DBs got a raw SQLite error instead of the friendly refusal; `BAD_REQUEST` flattened body-parser specifics; SWISS_ROUND_BUCKETS comment overclaimed line-by-line fidelity to MTR Appendix E (top band deviates); docker CMD honors only literal `EMPTY_DB=1`; seed not transactional; no static-mode boot log. | **Fixed:** guard-before-writes + DDL skipped on current DBs; BAD_REQUEST keeps the parser's message; comment softened to "mirrors … approximates the top band"; seed wrapped in a transaction; boot logs static mode. Literal-`1` semantics kept, documented in README. |

Clean this pass: path traversal (8 encodings), method/verb matrix, error-contract battery, re-seed under live traffic (wipe order is reader-safe by construction), missing client/dist degradation, docker CMD fail-loud on seed failure, Dockerfile layer caching/workspaces wiring.
