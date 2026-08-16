# Data Model Plan

Incorporates the design discussion decisions: Event carries capacity; Custom schedules use a `customDuration` on Format; no top-cut modeling; class-table inheritance for schedules (real FKs); duplicate registrations blocked by a uniqueness constraint.

## Entities

### GameSystem
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| name | text, unique | e.g. "Magic: The Gathering", "Pokémon TCG", "Yu-Gi-Oh!" |

Exists so the UI can offer a game dropdown that filters Formats. Adding a 4th game = one row here + its Format rows. No code changes.

### Schedule (parent — class-table inheritance)
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| type | enum: `SWISS` \| `CUSTOM` | dispatch key for duration derivation |

Extensibility point: a new scheduling style (e.g. French) = new enum value + new child table + one derivation function registered for it. `Format`'s shape never changes.

### SwissSchedule (child of Schedule)
| Field | Type | Notes |
|---|---|---|
| scheduleId | PK, FK → Schedule.id | real FK integrity (vs. the polymorphic-ref alternative) |
| roundTimerMinutes | int | 50 (MTG, Yu-Gi-Oh!), 30 (Pokémon Bo1) |
| overtimeSlackMinutes | int | per-round: end-of-round turns + pairing/turnover (~10–15) |
| preEventTimeMinutes | int | registration; draft/sealed pack+build time lives here |
| breakTimeMinutes | int | flat add-on (0 for most locals) |

Top cut deliberately not modeled (out of scope per design discussion).

### CustomSchedule (child of Schedule)
| Field | Type | Notes |
|---|---|---|
| scheduleId | PK, FK → Schedule.id | |
| timeInMinutes | int, unique | fixed event duration |

Every Schedule row has exactly one child row, regardless of type — uniform dispatch, no nullable fields on Format.

**Custom rows are deduplicated:** when a format needs a custom time, find-or-create by `timeInMinutes` (backed by the unique constraint) and point to the existing row if present. If CustomSchedule ever grows more fields, the uniqueness constraint widens to cover them.

**Invariant this buys us:** schedule child rows (Swiss and Custom alike) are shared, immutable value objects — "editing" a format's schedule means pointing it at a different (possibly new) row, never mutating one in place, since a mutation would silently affect every format sharing the row. No schedule-editing UI exists in scope, so this is a documented rule, not code.

### Format — the template hub
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| gameSystemId | FK → GameSystem | |
| name | text | e.g. "Standard", "Booster Draft", "Commander Night" (game name not repeated — the GameSystem link covers it) |
| minPlayers | int | sanctioning minimum (4 for all three games — data, not a constant) |
| scheduleId | FK → Schedule | |

Template-driven event properties (brief requires ≥2): **minPlayers** and the **entire duration derivation** (via schedule), plus the format list per game itself.

### Event
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| name | text | |
| location | text | goes into the `.ics` LOCATION field |
| formatId | FK → Format | |
| startTime | datetime (UTC) | |
| capacity | int | **validated: format.minPlayers ≤ capacity ≤ 30** (app ceiling per brief); the enforced registration limit |

Derived (not stored): `minDurationMinutes = duration(format, format.minPlayers)`, `maxDurationMinutes = duration(format, event.capacity)`, `endTime = startTime + maxDuration`. Calendar and `.ics` use endTime (worst case); UI shows "runs X–Y h depending on attendance."

### Registration
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| eventId | FK → Event | |
| playerName | text | |
| createdAt | datetime | |

Constraints: **UNIQUE(eventId, playerName)** → distinct "already registered" error. Capacity enforced server-side in one atomic statement (insert-where-count-below-capacity or equivalent transaction) so concurrent last-seat registrations can't oversell — full event → distinct "event full" error.

## Duration derivation (pure function, in code)

```
duration(format, players):
  switch format.schedule.type:
    SWISS:  s = format.schedule.swiss
            rounds = swissRounds(players)          # bucket table below
            return s.preEventTime + rounds × (s.roundTimer + s.overtimeSlack) + s.breakTime
    CUSTOM: return format.schedule.custom.timeInMinutes
```

Swiss rounds bucket table (code constant — it's "the rules of Swiss", part of the SWISS interpreter, not per-format data): 4–8 → 3, 9–16 → 4, 17–32 → 5 (capacity ≤ 30 means higher buckets are unreachable but kept for completeness).

Adding a schedule type = add enum value + child table + one `case`. No Format/Event/Registration changes.

## Seed data (illustrative)

| GameSystem | Format | minPlayers | Schedule |
|---|---|---|---|
| Magic: The Gathering | Standard | 4 | Swiss: 50 timer / 10 slack / 15 pre / 0 break |
| Magic: The Gathering | Booster Draft | 6 | Swiss: 50 / 10 / 65 pre (draft+build) / 0 |
| Magic: The Gathering | Commander Night | 4 | Custom: 180 min |
| Pokémon TCG | Standard (League Challenge) | 4 | Swiss: 30 / 10 / 15 / 0 |
| Yu-Gi-Oh! | Advanced | 4 | Swiss: 50 / 10 / 15 / 0 |

## Known trade-offs (for the README write-up)

- Events reference Formats live: editing a Format later changes derived durations of existing events. Accepted for timebox.
- Schedule child rows are deduplicated shared value objects and therefore immutable by rule (see CustomSchedule note) — enforced by convention, not code, since no schedule-editing UI is in scope.
- Top cut, age divisions, player IDs, sanctioning bureaucracy: consciously out of scope (see `ccg_knowledge.md`).
- playerName uniqueness doubles as the identity model (no auth per brief); two real players with the same name collide — acceptable, noted.
