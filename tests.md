# Test Ledger

Updated in the same PR as any test change. TDD applies to pure logic and correctness-critical endpoints (per `implementation_plan.md`); UX is validated by Playwright e2e, not unit tests.

| Area | What | Tests | Status |
|---|---|---|---|
| shared | Duration derivation (Swiss buckets 4/8/9/16/17/30/32/33/128/256, <4 and non-integer rejection, custom fixed time, break add-on) | `shared/src/schedule.test.ts` (15) | ✅ TDD, green |
| shared | Zod schemas (capacity 0/31/2.5/'ten', blank/whitespace names, malformed dates, trim) | `shared/src/validation.test.ts` (9) | ✅ TDD, green |
| server | POST /api/events — derived min/max duration + endTime, capacity>30, capacity<minPlayers, unknown format, bad date | `server/src/app.test.ts` (17 total) | ✅ TDD, green |
| server | POST /api/events/:id/registrations — EVENT_FULL vs ALREADY_REGISTERED vs 400 vs 404; last-seat concurrency (6 parallel → exactly one 201, count lands at capacity) | `server/src/app.test.ts` | ✅ TDD, green |
| server | GET /api/events list + derived fields; /:id 404; invite.ics SUMMARY/DTSTART/DTEND/LOCATION/UID; /qr request-origin URL | `server/src/app.test.ts` | ✅ green |
| client | Pages/UX | — | no unit tests by design; covered by e2e |
| e2e | Golden path: create → calendar → event page → QR link → register → fill event | — | planned (PR 6) |

## Known gaps
- None recorded yet.
