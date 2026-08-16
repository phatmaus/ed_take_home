# Tech Stack Plan

Final stack — V5's Express base with the library picks settled in discussion. One repo, TypeScript everywhere, shared validation between front and back.

## Decided stack

| Slot | Choice | Why (and what was rejected) |
|---|---|---|
| Runtime / language | Node.js + TypeScript | Fixed by Eugene; enables shared front/back validation logic. |
| Backend framework | **Express 5** | Eugene's familiarity beats Fastify's marginal TS ergonomics (Claude recommended Fastify; overruled — familiarity is the right tiebreaker in a 3 h box). |
| Database | **SQLite via better-sqlite3** | Battle-tested, synchronous API — single-process serialized writes make last-seat concurrency trivially correct. Chosen over built-in `node:sqlite` (younger, no transaction helper) — npm native install deemed a non-issue. `PRAGMA foreign_keys = ON` at bootstrap (off by default!). |
| ORM / query layer | **Drizzle ORM** (better-sqlite3 driver) | Schema-as-TS-code documents the data model (graded); typed queries; thin enough to drop to raw SQL for the one atomic capacity-check statement. No codegen. Rejected: Prisma (heavy, slow cold start), raw-only SQL (no query types). |
| Shared validation | **Zod** | De-facto standard; schemas live in `shared/` and are imported by both Express routes and React forms. |
| Frontend build | **Vite + React 18** | Fixed by Eugene. |
| UI components | **Fluent UI React** | Eugene's familiarity. Note: Fluent has no event-calendar component (its Calendar is a date picker) — hence the next row. |
| Calendar view | **FullCalendar** (`@fullcalendar/react` + `@fullcalendar/daygrid`) | Month grid in ~20 lines, best docs, MIT core covers all needs. Rejected: react-big-calendar (sleepy maintenance, date quirks), Schedule-X (too young to risk mid-timebox), hand-rolled agenda (kept as Plan B: if FullCalendar isn't rendering within ~30 min, ship a Fluent grouped-by-day list instead). |
| .ics generation | **ical-generator** | TS-native, maintained, object API; emits correct folding/escaping/UID/DTSTAMP (Google/Outlook are strict). Rejected: `ics` (array-based date API, slower maintenance), hand-rolling (rubric explicitly calls this bad judgment). |
| QR code | **qrcode** (node-qrcode) | Standard; data-URL PNG or SVG, works server- or client-side. Rejected: react-qr-code (browser-only, no flexibility gain), external QR APIs (network dependency + leaks URLs to a third party). |
| E2E tests | **Playwright** | Eugene's familiarity. Scope: the golden path + the two graded error cases (full event, duplicate registration). |

## Key implementation notes carried from discussion

- **Capacity enforcement:** one atomic statement (raw SQL via Drizzle) — insert-where-count-below-capacity inside a transaction; better-sqlite3's synchronous single-writer model serializes concurrent last-seat attempts. Distinct errors: `EVENT_FULL` vs `ALREADY_REGISTERED` (UNIQUE(eventId, playerName)).
- **QR contents:** the registration URL must be built from the request origin, not hardcoded localhost, so a phone on the same LAN can actually use it.
- **.ics end time:** derived max-duration endTime (capacity attendance) per `data_model_plan.md`; stable UID = event id + app domain.
- **Node version:** whatever LTS; no `node:sqlite` dependency, so no Node 22 floor.

## Project layout (single repo)

```
/shared        Zod schemas + duration-derivation pure functions (used by both sides)
/server        Express app, Drizzle schema, routes, seed script
/client        Vite React app (Fluent UI + FullCalendar)
```

Dev: Vite dev server proxies `/api` → Express. Prod/run: `npm run dev` starts both (concurrently); seed script populates GameSystems/Schedules/Formats + a few demo events.
