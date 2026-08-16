# Test Ledger

Updated in the same PR as any test change. TDD applies to pure logic and correctness-critical endpoints (per `implementation_plan.md`); UX is validated by Playwright e2e, not unit tests.

| Area | What | Tests | Status |
|---|---|---|---|
| shared | Duration derivation (Swiss buckets 4/8/9/16/17/30, custom, boundaries) | — | planned (PR 2, TDD) |
| shared | Zod schemas (event creation, registration) | — | planned (PR 2, TDD) |
| server | POST /api/events validation (capacity bounds, minPlayers, unknown format) | — | planned (PR 2, TDD) |
| server | POST /api/events/:id/registrations — capacity enforcement, EVENT_FULL vs ALREADY_REGISTERED, last-seat concurrency (parallel, exactly one 201) | — | planned (PR 2, TDD) |
| server | GET /api/events/:id/invite.ics — correct DTSTART/DTEND/UID/LOCATION | — | planned (PR 2) |
| client | Pages/UX | — | no unit tests by design; covered by e2e |
| e2e | Golden path: create → calendar → event page → QR link → register → fill event | — | planned (PR 6) |

## Known gaps
- None recorded yet.
