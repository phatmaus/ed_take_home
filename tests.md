# Test Ledger

Updated in the same PR as any test change. TDD applies to pure logic and correctness-critical endpoints (per `implementation_plan.md`); UX is validated by Playwright e2e, not unit tests.

| Area | What | Tests | Status |
|---|---|---|---|
| shared | Duration derivation (Swiss buckets 4/8/9/16/17/30/32/33/128/256, sub-4 **clamping** (spec changed by BE-2), non-integer/0/257 rejection, custom fixed time, break add-on) | `shared/src/schedule.test.ts` | ✅ TDD, green |
| shared | Zod schemas (capacity 0/31/2.5/'ten', blank/whitespace names, malformed dates, trim, year bounds, whitespace collapse, per-format floor factory) | `shared/src/validation.test.ts` | ✅ TDD, green |
| server | POST /api/events — derived min/max duration + endTime, capacity>30, capacity<minPlayers, unknown format, bad date | `server/src/app.test.ts` (17 total) | ✅ TDD, green |
| server | POST /api/events/:id/registrations — EVENT_FULL vs ALREADY_REGISTERED vs 400 vs 404; last-seat concurrency (6 parallel → exactly one 201, count lands at capacity) | `server/src/app.test.ts` | ✅ TDD, green |
| server | GET /api/events list + derived fields; /:id 404; invite.ics SUMMARY/DTSTART/DTEND/LOCATION/UID; /qr request-origin URL | `server/src/app.test.ts` | ✅ green |
| client | Pages/UX | — | no unit tests by design; covered by e2e |
| server | Location entity (spec amendment): /api/locations, wall-time→UTC via location tz (cross-zone verified), UNKNOWN_LOCATION, OUTSIDE_OPENING_HOURS (early/late/fits at max-capacity duration) | `server/src/app.test.ts` | ✅ TDD, green |
| server | Review-driven specs (BE-*): duplicate-on-full → ALREADY_REGISTERED, case/whitespace identity variants, JSON error contract (bad JSON body, unknown /api route, VALIDATION messages), from/to validation + instant-precision filtering, fail-closed formats filter, canonical-id guard, .ics final CRLF + domain UID, sub-4 minPlayers derivation, orphan-schedule isolation | `server/src/app.test.ts` (30 total) | ✅ green |
| shared | Review-driven specs: sub-4 clamp (spec change, Eugene informed — see back_end_review.md BE-2), `createEventSchemaFor` floor, startTime year bounds, inner-whitespace collapse | `shared/src/schedule.test.ts`, `shared/src/validation.test.ts` (27 total) | ✅ green |
| e2e | Golden path: create → calendar → event page → QR link → register → fill event | — | planned (PR 6) |

## Known gaps (honest list, per BE-18)
- `.ics` assertions cover SUMMARY/DTSTART/DTEND/UID/LOCATION/final-CRLF; full RFC 5545 folding/escaping verified by the adversarial review, not by automated tests.
- Cross-process concurrency (two server processes, one DB) verified manually by the review panel; the automated concurrency test is in-process only.
- QR PNG content is asserted as a data URL, not decoded and verified to contain the URL.
- No automated tests for the client (by design — Playwright e2e covers UX; see implementation_plan.md).
- Past-date events accepted by design (README cut list).
- `COLLATE NOCASE` folds ASCII only: `Renée`/`RENÉE` still register as two players (SQLite limitation; noted, accepted).
- Legacy DB files (pre schema-versioning) are refused with a delete-and-reseed message rather than migrated (`server/src/db.test.ts`).
- e2e is not retry-idempotent: the fill-the-event test consumes the seeded last seat, so `--retries`/`--repeat-each` would re-find a full event (fresh DB per invocation keeps default runs deterministic). Ports 3001/5173 must be free.
- HEAD-mirrors-GET on client routes and the stale-asset 404 behavior verified manually in the pass-3 review, not by automated tests.
