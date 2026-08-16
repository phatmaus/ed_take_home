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
