# TCG Event Calendar

Store organizers schedule in-store trading-card events (MTG, Pokémon, Yu-Gi-Oh! out of the box); players register by scanning a per-event QR code. Capacity is enforced server-side; every event offers a downloadable `.ics` invite.

## Run it

**Docker (sample data included):**
```sh
docker compose up            # http://localhost:3001
EMPTY_DB=1 docker compose up # same, but starting from an empty database
```

**Locally (Node 22, tested):**
```sh
npm install
npm run seed   # sample data incl. a nearly-full event; re-run anytime to reset
npm run dev    # client http://localhost:5173, API :3001
```

Tests: `npm test` (57 unit/API tests) · `npx playwright test` (golden-path e2e).

## Design write-up

**Capacity.** Capacity lives on the Event row (validated `format.minPlayers ≤ capacity ≤ 30` — the ceiling is one shared constant used by the Zod schema, the API, and the SQLite `CHECK`). Registration is enforced in the API by a single atomic statement — `INSERT … SELECT … WHERE (SELECT COUNT(*) FROM registrations WHERE event_id=?) < (SELECT capacity …)` — so the count and the insert happen inside one SQLite write transaction. better-sqlite3 is synchronous and SQLite is single-writer, so concurrent last-seat attempts serialize; an adversarial review pass fired 20 parallel requests (and a 40-request two-process variant against one WAL database) at a one-seat event: exactly one 201, never an oversell. Duplicates are a distinct case: a case/whitespace-insensitive unique index on `(event_id, player_name)` plus an explicit probe means an already-registered player is told `ALREADY_REGISTERED` — even when the event is also full — while strangers get `EVENT_FULL`.

**Templates.** `GameSystem → Format → Schedule` with class-table inheritance for schedules: a parent `schedules(type)` row FK-references exactly one child row (`swiss_schedules` with round timer/overtime/pre-event/break minutes, or `custom_schedules` with a fixed duration). Formats are the template hub (game, min players, schedule); **event duration is derived, not stored** — Swiss duration = pre-event + rounds(players) × (timer + slack) + breaks, where rounds comes from the standard Swiss bucket table (4–8→3, 9–16→4, 17–32→5), so the calendar and `.ics` show a min–max range ("runs 3h15–4h15 depending on attendance") computed from the format's minimum players and the event's capacity. Adding a 4th game — verified on paper against One Piece TCG and Lorcana rules — is seed data only: a GameSystem row, Format rows, and schedule rows (Lorcana's 8-player sanctioning minimum is just `minPlayers` data). A non-card game with a fixed-length night uses a `CUSTOM` schedule. A new *scheduling discipline* (e.g. single-elim) is one new child table + one case in the derivation function; Format/Event/Registration schemas don't change. Schedule child rows are deduplicated shared value objects (MTG Standard and Yu-Gi-Oh! Advanced literally share one Swiss row) and therefore immutable by rule.

**Cut/faked, and next.** Cut: editing/cancelling (per brief), auth, live spots-left updates (refresh-on-mount), calendar month-range fetching (loads all events — fine at store scale), past-date event rejection (organizers may back-date), reverse-proxy `Host` trust for the QR origin (LAN dev tool; `trust proxy` is the production step), top-cut modeling in Swiss durations. Faked: templates are seed-only (no admin UI). Next: registration cancellation + waitlist, format-management UI, promoting the Swiss rounds table from code constant to per-game data if a game's table diverges within the ≤30 range.

## AI usage

Built with Claude Code (Fable 5) as pair-programmer under a plan-first workflow: research (real MTG/Pokémon/Yu-Gi-Oh! tournament structures ground the schedule model), data-model and stack decisions were argued in both directions before any code — several of the AI's proposals were rejected or reworked (its original flat `defaultDurationMinutes` template field, its `CustomSchedule`-less polymorphic schema), and some of mine were amended after its critique (missing Event.capacity, undefined Custom type). Multi-model adversarial review (Fable + Opus 5) against the running server produced 31 triaged findings; the standout rejected-AI-output example: the AI asserted (in a code comment, backed by a passing test) that the Vite proxy preserves the browser's Host header for QR generation — a second-model review disproved it in a real browser, the test having only verified an echo of a header real traffic never sends. Full logs: `ai_usage.md` (decision log with accept/reject verdicts), `ai_usage_raw.md` (session transcript), `back_end_review.md` / `front_end_review.md` (findings + triage).
