# AI Usage Log

Tool: Claude Code (CLI, model: Claude Fable 5), running in a VS Code terminal.

Each entry summarizes a major AI interaction: what was asked, the outcome, and whether the output was **accepted as-is**, **accepted with modifications**, **modified after push-back**, or **rejected**.

---

## 1. Session setup & brief review (2026-08-15 16:04)

**Asked:** Read the take-home brief, set up AI-usage logging (this file plus a raw transcript log `ai_usage_raw.md`), and follow a plan-first workflow — no implementation until a plan is requested, reviewed, and approved.

**Outcome:** Claude read `Take-Home.md`, created both log files, and summarized the requirements and evaluation criteria. No implementation work started.

**Verdict:** Accepted as-is.

## 2. CCG tournament research → `ccg_knowledge.md` (2026-08-15 ~16:10)

**Asked:** Eugene (casual MTG background, no tournament experience) asked Claude to research the tournament rules of MTG, Pokémon TCG, and Yu-Gi-Oh!; identify what an organizer needs to know to schedule an event; and find what's common (templatable) vs. different, deriving a lowest-common-denominator template. Findings to `ccg_knowledge.md`.

**Outcome:** Claude spawned three parallel research sub-agents (one per game) against official sources (MTG Tournament Rules/WPN, Play! Pokémon Handbook, Konami Tournament Policy v2.5), then synthesized `ccg_knowledge.md`: per-game scheduling essentials; commonalities (all three: 4-player sanctioning minimum, Swiss structure, timed rounds → predictable durations, format lists, ~8–32 practical capacity); differences (format names, Pokémon age divisions, Bo1/30-min vs Bo3/50-min, player-ID/sanctioning bureaucracy — flagged as data or out-of-scope); and a proposed LCD template (formats, default duration, min players, default/max capacity).

**Verdict:** Rejected in part (after clarifying Q&A on Swiss structure and duration factors, Eugene rejected the proposed flat `defaultDurationMinutes` template field as dishonest modeling — see entry 3).

## 3. Data-model design: derived durations, schedule polymorphism (2026-08-15 ~16:30)

**Asked:** Eugene rejected Claude's fixed-duration template simplification and proposed his own model: `GameSystem` and `Format` entities, a polymorphic `scheduleType`/`scheduleId` reference into per-type schedule tables (starting with `SwissSchedule`: roundTimer, overtimeSlack, preEventTime, hasTopCut, breakTime), with event duration *derived* from schedule rules (min/max duration from min/max players, calendar note showing the range). Asked Claude to critique.

**Outcome:** Claude endorsed the direction (better honesty and extensibility showcase) and raised five objections: (1) Event was missing the `capacity` field — the brief's most-graded constraint; (2) the `Custom` schedule type was undefined and needs a `CustomSchedule` entity; (3) `hasTopCut: boolean` is insufficient to derive maxTime (cut size is attendance-dependent, cut rounds differ) and turnover time was missing; (4) the polymorphic reference loses FK integrity — suggested a parent `Schedule(id, type)` table (class-table inheritance) as an equal-extensibility alternative; (5) Registration needs a uniqueness constraint for the rubric's duplicate-registration case. Plus minor notes (ICS uses maxTime, format naming redundancy, live-reference edit semantics).

**Verdict:** Eugene accepted points 1, 4, 5 as-is; modified point 2 (chose `customDuration` on Format instead of Claude's proposed `CustomSchedule` entity); overruled point 3 (top cut cut entirely as beyond scope rather than modeled).

## 4. `data_model_plan.md` drafted (2026-08-15 ~16:45)

**Asked:** Produce a reviewable `data_model_plan.md` incorporating the five decisions.

**Outcome:** Claude wrote the plan: GameSystem, Schedule (class-table inheritance parent), SwissSchedule child (roundTimer/overtimeSlack/preEventTime/breakTime, no top cut), Format hub (minPlayers, scheduleId, nullable customDurationMinutes), Event with validated capacity (minPlayers ≤ capacity ≤ 30) and derived min/max duration + endTime, Registration with UNIQUE(eventId, playerName) and atomic server-side capacity enforcement; pure-function duration derivation with the Swiss bucket table as a code constant; seed data; trade-off list for the README. Opened in VS Code.

**Verdict:** Accepted with one modification — Eugene rejected the nullable `customDurationMinutes`-on-Format asymmetry (which Claude had flagged as awkward) and specified a `CustomSchedule` child table (`id`, unique `timeInMinutes`) with find-or-create dedup, keeping the "every Schedule has exactly one child" invariant.

## 5. CustomSchedule revision applied (2026-08-15 ~16:55)

**Asked:** Update the plan per Eugene's critique: CustomSchedule child table with deduplicated rows (find-or-create by timeInMinutes; widen the uniqueness constraint if fields are added).

**Outcome:** Claude agreed with the child table, but pushed back with one caveat: deduplicated rows are shared between formats, so all schedule child rows (Swiss included) must be treated as immutable value objects — repointing, never in-place mutation — or a future edit feature would silently change other formats. Claude noted it would have skipped dedup for simplicity but adopted it as specified since the cost is trivial and no editing UI is in scope; the immutability rule is now documented in the plan.

**Verdict:** Eugene's design adopted with Claude's immutability caveat documented.

## 6. Extensibility check against two more CCGs (2026-08-15 ~17:10)

**Asked:** Verify the data model extends to the next two most popular CCGs (any two acceptable — Claude picked One Piece Card Game and Disney Lorcana after a market-ranking check).

**Outcome:** Two parallel research sub-agents (official Bandai / Ravensburger tournament rules). Result: both games onboard as pure seed data — no schema or code change. One Piece: Swiss Bo1 30–35 min rounds, min 4, same bucket table. Lorcana: fixed 2-game Swiss matches (scoring quirk, invisible to a time-only model), 45–50 min rounds, **min 8 players** — which validates `minPlayers` as per-Format data rather than a constant. One known soft spot reaffirmed: the Swiss rounds bucket table is a single code constant, so per-game bucket variations are approximated; promotion to SwissSchedule data is a contained future change. Findings appended to `ccg_knowledge.md` §4.

**Verdict:** Accepted as-is (model unchanged; check passed).

## 7. Tech-stack variants proposed (2026-08-15 ~17:20)

**Asked:** Eugene fixed Node/TS + Vite, Fluent UI, Playwright, and asked for 5 stack variants with pros/cons, specifically wanting current guidance on SQLite libraries, calendar UI, and `.ics`/QR generation.

**Outcome:** Claude proposed: V1 Fastify + raw better-sqlite3 + custom agenda; V2 Fastify + Drizzle + FullCalendar (recommended); V3 Hono RPC + Drizzle + react-big-calendar; V4 Next.js + Prisma (called out as worst fit for the timebox); V5 Express 5 + built-in node:sqlite + Schedule-X. Constants across all: Zod shared validation, `qrcode`, `ical-generator`. Flagged that Fluent UI has no event-calendar component (only a date picker) so a calendar lib is needed regardless, and that better-sqlite3's synchronous writes make last-seat concurrency trivially serializable — a write-up point.

**Verdict:** Decided over a follow-up Q&A (SQLite drivers deep-dive, calendar libraries deep-dive, ICS/QR libraries): Eugene took Claude's library picks — better-sqlite3, Drizzle, FullCalendar, ical-generator, qrcode, Zod — but **overruled the recommended Fastify in favor of Express** (familiarity over marginal TS ergonomics). Written up in `tech_stack_plan.md`.

## 8. Repo created; implementation plan drafted (2026-08-15 ~17:45)

**Asked:** Create private GitHub repo `ed_take_home`, push current docs; draft `implementation_plan.md` for review covering Eugene's process spec: PR atomicity with labeled Eugene-originated changes, Fable as sole executor with sub-agents only for adversarial review (Claude asked to critique the no-codegen-fan-out rule), explicit model/effort per sub-agent with fallback warnings, scaffold via generators, `tests.md` + TDD on logic/critical endpoints, data-testid from the start, the review→fix→re-review loop with model-diversity rule, docker + seeded/empty DB, 1-page README.

**Outcome:** Repo created and pushed (github.com/phatmaus/ed_take_home). Plan drafted with: 6-PR sequence, API surface, page list, reviewer prompts for the backend panel (Fable high + 2× Opus 5 xhigh) and frontend reviewer (Opus 5 medium), testing policy, timebox budget. Claude endorsed the no-fan-out rule with reinforcement (serial dependencies, PR-clarity grading, review is where model diversity pays). **One push-back: the requested "Opus 4.8" reviewer isn't addressable** — sub-agent tooling pins model family only (`opus` = current Opus 5); proposed a second Opus 5 xhigh with a different review lens as the diversity-preserving stand-in, pending Eugene's approval.

**Verdict:** Reviewed with one revision — Eugene rejected Claude's proposed second-Opus stand-in for the unaddressable Opus 4.8 reviewer, cutting the panel to two agents and lowering efforts one notch (Fable high→medium, Opus 5 xhigh→high) to protect the tight schedule. Plan updated accordingly.

## 9. Execution: PRs 1–3 (scaffold, backend TDD, frontend) (2026-08-15 ~18:00)

**Asked:** "execute" — implement per the approved plan.

**Outcome:** PR 1 scaffold (npm create vite, deps verified, drizzle bumped to 0.45.2 clearing a fresh SQL-injection advisory); PR 2 shared+backend with genuine TDD (red commit then green commit, 41 tests incl. last-seat concurrency); PR 3 frontend (Fluent + FullCalendar, data-testids from the start). All tests/typechecks/builds green before each merge.

**Verdict:** Accepted (proceeded per plan without intervention).

## 10. Adversarial review cycle (2026-08-15 ~18:30)

**Asked (per plan):** Backend panel Fable-medium + Opus5-high; frontend reviewer Opus 5. Mid-cycle, Eugene directed: start client-only fixes while waiting on the backend panel.

**Outcome:** Frontend: 13 findings — the critical one **disproved a Claude factual claim that was backed by a passing test** (Vite proxy Host-header behavior → QR encoded a dead localhost:3001 URL; the test only echoed a header real traffic never carries). Backend: 18 combined findings (Fable 3, all subsumed by Opus's deeper versions; Opus +15 — incl. duplicate-on-full masking ALREADY_REGISTERED with proof the existing test was structurally blind to it, and a data-only 4th game crashing the whole feed). Both written to `front_end_review.md` / `back_end_review.md` with per-finding accept/reject triage; rejected: FE-10 liveness, FE-12 range fetch, BE-8 Host trust, BE-11 past events, BE-17 perf half (all documented in README cut list). Fixes: PR 5 (client-only, per-finding commits), PR 4 (backend + shared, 13 new specs written red-first, 57 total green). **One spec-level test edit** (BE-2: `swissRounds(<4)` now clamps instead of throwing) — Eugene informed per the tests-are-spec rule, rationale in back_end_review.md.

**Verdict:** Review findings largely accepted (26 of 31); Eugene queried the second-pass lens assignment (suggested swapping Fable/Opus lenses); Claude acknowledged the swap idea as arguably better, kept the original split mid-flight with rationale (Opus-high demonstrably stronger on the diff-read task), logged as a judgment call.

## 11. E2E, Docker, README (2026-08-15 ~19:00)

**Asked (per plan):** Golden-path e2e only (edge cases owned by review), docker compose with seeded/empty variants, 1-page README.

**Outcome:** 2 Playwright tests green (one flaky async-race in Claude's first calendar assertion, fixed); Docker image smoke-tested in-container (seeded API + SPA fallback → QR origin correct by construction); README with run commands, design write-up, and the AI-usage note citing the QR/Host-header incident as the rejected-output example.

**Verdict:** Accepted; backend re-review (Fable medium + Opus high, scoped to fixes/regressions) in flight at time of writing.

## 12. Re-review closure: all fixes verified, 7 regressions found and fixed (2026-08-15 ~19:30)

**Asked (per plan loop):** Scoped second pass. Mid-pass Eugene asked (a) why FE-12 was rejected (Claude defended the cut: client-side range fetching buys nothing at store scale and adds the async-race surface class of FE-2; API half was fixed as BE-4) and (b) whether non-existent routes have a 404 page (yes — client catch-all, event/register not-found states, JSON API 404).

**Outcome:** Both re-reviewers confirmed every accepted backend finding FIXED and the concurrency guard unbroken (20 parallel case-variant same-name attempts → one 201). Opus's diff-hunt found 7 regressions in Claude's own fixes — most notably REG-1/2: the schema-level fixes (NOCASE, CHECKs) were inert on pre-existing DB files, live-reproduced as a case-duplicate 201 on a legacy DB; also 413s collapsed to 500s by the new error middleware. All 7 fixed TDD-style in PR 7 (schema `user_version` guard refusing legacy files loudly, status-preserving error middleware, min_players CHECK, offset-form range bounds, ledger correction); two notes accepted-documented (ASCII-only NOCASE, docker static-layer error ordering). Final state: 63 unit/API tests + 2 e2e, all green, 7 PRs merged.

**Verdict:** Accepted. Notable for the AI-leverage criterion: the second pass caught real defects in the AI's own first-pass fixes — the review loop earned its cost twice.

## 13. Eugene's manual testing + lens-swapped pass 3 + second client pass (2026-08-15 ~20:30)

**Asked:** Eugene questioned the bucket-table-vs-formula choice (Claude defended the table: floor-of-3 wrinkle, per-game divergence, traceability — Eugene accepted, asked for the rationale as an expanded comment, committed `[eugene]`). Eugene found a live UX bug in manual testing (incomplete datetime-local leaking doubled Zod jargon) that Claude and the frontend reviewer had both missed; Claude fixed it (`[eugene]` commit). Eugene reported it still broken and requested a Fable-medium client review; he also directed re-launching the backend review with **swapped lenses** (his idea from entry 10).

**Outcome:** The client reviewer proved the datetime fix worked — including inside Eugene's own running container — and identified the cause as a stale docker image (`up` without `--build`); it contributed 6 new findings (5 fixed, 1 rejected). The lens-swapped backend pass vindicated Eugene's swap suggestion: Opus-on-functional found **P3-1 (HIGH)** — an empty `E2E_DB_PATH` env turning Playwright's cleanup into `rm -f *` in the repo root — plus the docker-restart data-wipe/id-drift bug (both reviewers independently) and the unusable EMPTY_DB mode; Fable-on-code verified all REG fixes and caught the db-guard write-before-check ordering and a doc overclaim in the very comment from this session's bucket-table discussion. All accepted findings fixed in PR 8 (63 tests green; e2e not re-run — port 3001 held by Eugene's live session). A `.gitignore` gap (WAL sidecars) surfaced via Eugene's VS Code question; the 10k-changes scare itself was stale VS Code UI.

**Verdict:** Eugene's interventions drove this cycle: his lens-swap idea produced the highest-severity finding of the project, and his manual testing caught a UX bug all AI reviewers missed. Claude's "keep the lenses" call in entry 10 is hereby revised: the swap was right.

## 14. UX iteration + Location entity amendment (2026-08-15 ~21:30)

**Asked (series of Eugene directives from hands-on testing):** (a) root-caused the date/time confusion himself — native `datetime-local` segment-gated typing, not a bug — and asked for split date + time fields; (b) then a proper time-picker widget; (c) then Location as a dropdown; (d) then flagged Location as a data-model gap, specifying `Location(name, openingHours, timeZone)` — "otherwise we don't know what the time zone for a particular location even is."

**Outcome:** (a) split fields with targeted empty-messages; (b) `@fluentui/react-timepicker-compat` (15-min dropdown, freeform, h23); (c) first shipped as a freeform Combobox over previously used locations (no schema change — Claude flagged the closed-list entity as the alternative); (d) superseded by the full amendment: schema v2 Location entity, events.locationId FK, **wall-clock start times interpreted in the venue's IANA zone** (date-fns-tz; the previous model silently trusted the organizer's browser zone — a genuine correctness gap), opening-hours validation at max-capacity duration, closed dropdown with hours/tz hint, venue-local display. 7 new specs incl. cross-zone conversion; 67 tests green. Note on provenance: Eugene recalled specifying Location during the data-model review; the approved plan had transcribed location as a plain Event text field from his original field list — logged as a spec amendment caught by Eugene, whoever dropped it.

**Verdict:** Eugene's requirements, Claude's implementation — accepted per iteration; (c)'s freeform interim was superseded by (d)'s entity within the hour, validating Claude's flagged alternative.

## 15. Wrap-up: transcript + publication (2026-08-15 ~18:55)

**Asked:** Generate the full session log, push, make the repo public.

**Outcome:** Full `[+h:m:s]` transcript written to `ai_usage_raw.md` (anchored to git timestamps), pushed; repo flipped to public (first `gh` flag attempt failed on an unsupported option — retried with the correct syntax and verified PUBLIC).

**Verdict:** Accepted as-is.
