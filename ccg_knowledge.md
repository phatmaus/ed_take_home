# CCG Tournament Knowledge — MTG, Pokémon TCG, Yu-Gi-Oh!

Research notes for designing the game-template system. Focus: what a store organizer needs to know to **schedule** an in-store event, what is common across the three games (templatable), and what differs (per-game template data or out of scope).

---

## 1. Per-game essentials

### Magic: The Gathering (Wizards of the Coast)

- **Formats (in-store):** Constructed — Standard, Pioneer, Modern, Legacy, Vintage, Pauper, Commander (multiplayer, casual REL); Limited — Booster Draft, Sealed. Friday Night Magic is format-flexible; most common: Standard, Draft, Commander.
- **Structure:** Swiss pairings, best-of-3, **50-minute rounds**. Round count scales with players (4–8 → 3 rounds; 9–16 → 4–5; 17–32 → 5; …).
- **Minimum players:** **4** to sanction. Draft pods are ideally 8 (6 workable).
- **Capacity:** no hard rule cap — limited by table space; typical FNM 8–32.
- **Duration:** Constructed night ≈ 3–3.5 h; Draft ≈ 3.5–4 h (adds ~30–40 min draft + 25 min build); Sealed/Prerelease ≈ 4–4.5 h.
- **Organizer must-knows:** sanction via Wizards EventLink (WPN store); Regular REL in-store = no decklists; Limited needs product (3 boosters/player draft, 6 sealed); FNM convention: Friday ~6–7 PM.
- Sources: Magic Tournament Rules (Feb 2026), Appendix B/E; WPN FNM & EventLink guides.

### Pokémon TCG (Play! Pokémon)

- **Formats:** Standard (default for League Challenge/Cup), Expanded (rare), Limited/Sealed (Prereleases, 40-card decks). Weekly League is casual any-format.
- **Structure:** Swiss; League Challenge = **best-of-1, 30-min rounds, no top cut**; League Cup = Swiss (Bo1 30 min or Bo3 50 min) + best-of-3 top cut. Round count scales with players (4–8 → 3 rounds; up to 8 rounds + Top 8 at 129+).
- **Distinctive:** **age divisions** (Junior/Senior/Masters) with separate standings; players under 6 ineligible; all players need a Pokémon Player ID.
- **Minimum players:** **4**, and 3 full rounds must complete or the event is invalid.
- **Capacity:** Challenge ~8–30 typical; Cup capped by venue (commonly 32–128).
- **Duration:** League Challenge ≈ 2–3 h; League Cup ≈ 4–6 h.
- **Organizer must-knows:** certified Professor/Organizer + active League required; sanction ~2 weeks ahead; **written decklists required** at Cups/Challenges; TOM software, prize kits; Challenge ≈ once/month per store.
- Sources: Play! Pokémon Tournament Rules Handbook (2024) §4–5; League Challenge/Cup Guide; Pokémon Support sanctioning articles.

### Yu-Gi-Oh! TCG (Konami)

- **Formats:** **Advanced** (current Forbidden & Limited list — the default for virtually all locals), Traditional (rare), Sealed/Draft (Battle Pack), Special (Speed Duel, Time Wizard, etc.).
- **Structure:** Swiss, best-of-3, **50-minute rounds** (round count table nearly identical to MTG: 4–8 → 3; 9–16 → 4; 17–32 → 5; …). Optional top cut at 9+ players; round count and cut must be announced before start.
- **Minimum players:** **4** to sanction.
- **Capacity:** no stated max for locals; typical 8–32.
- **Duration:** ~1 h per round incl. turnover → typical locals 3–5 h; sealed adds ~30–45 min build.
- **Organizer must-knows:** store must be an Official Tournament Store (OTS); every player needs a 10-digit **Card Game ID** (Konami/NEURON app); decklists not required at Tier 1 locals; results reported to Konami within 5 business days.
- Sources: KDE-US Yu-Gi-Oh! Tournament Policy v2.5; OTS Championship FAQ.

---

## 2. What's common → templatable

All three games' in-store events share the same skeleton, which is exactly what an event-scheduling template needs:

| Concept | Common shape |
|---|---|
| **Play formats** | Every game has a named list of sanctioned formats (Constructed variants + Limited variants), with one "default" that locals actually run. |
| **Minimum players** | **4 in all three games** — an event below minimum can't be sanctioned/start. |
| **Practical capacity** | No official hard cap for locals; realistically 8–32, bounded by venue. A per-game default and max capacity is a natural template field. |
| **Structure** | Swiss rounds, round count derived from player count (tables are nearly identical across games). |
| **Round time → duration** | Rounds are timed (30 or 50 min), so **typical total event duration is predictable per game+format** — a default-duration template field lets the app compute the ICS end time. |
| **Scheduling conventions** | Evening/weekend slots, format and structure announced in advance, registration before round 1. |

**Lowest-common-denominator template** — fields every game can fill in, and that drive event behavior without game-specific code:

- `name` / `id` of the game
- `formats: string[]` — selectable play formats (with a default)
- `defaultDurationMinutes` — per game (optionally per format) to compute event end time for the calendar and `.ics`
- `minPlayers` — sanctioning minimum (4 for all three, but a template field, not a constant)
- `defaultCapacity` / `maxCapacity` — pre-fills the capacity input and bounds it (app-wide ceiling 30 per the brief)

This satisfies the brief's "each template drives at least two event properties" and stays honest to real organized play.

## 3. What differs → per-game data or deliberately out of scope

- **Format lists differ entirely** (Standard/Modern/Commander vs Standard/Expanded vs Advanced/Traditional) — handled as template *data*, not code.
- **Round/match conventions differ in detail:** Pokémon runs Bo1 30-min rounds at Challenges; MTG and Yu-Gi-Oh! run Bo3 50-min. Folded into the per-game default duration rather than modeled explicitly.
- **Pokémon age divisions** (Junior/Senior/Masters, separate standings) have no equivalent in MTG/Yu-Gi-Oh!. Out of scope for a scheduling app; would fit as an optional template extension field if ever needed.
- **Player identity systems** (Wizards account, Pokémon Player ID, Konami Card Game ID) and **sanctioning bureaucracy** (EventLink/WPN, Professor certification, OTS + KCGN reporting) are organizer back-office concerns, not scheduling/registration concerns — out of scope; the brief says players are anonymous until they register with a name.
- **Limited-format logistics** (booster product, build time) affect duration only — covered by per-format duration defaults if desired.

**Design implication (v1):** since the three games differ only in *data* (format names, durations, capacities, minimums), the template system can be a pure data registry — adding a 4th game (or a non-card game like a board-game night) means adding one template entry, with zero changes to event/registration logic.

---

## 4. Extensibility check: next two popular CCGs (One Piece, Lorcana)

Market check (TCGplayer Q3/Q4 2025, ICv2): after MTG/Pokémon/Yu-Gi-Oh!, the next tier is **One Piece Card Game** (#3–4, trading places with Yu-Gi-Oh!) then Gundam/**Lorcana** (#5–6). Both researched against the final data model (`data_model_plan.md`).

### One Piece Card Game (Bandai)
- Swiss, **best-of-1, 30–35 min rounds + 5 min extra time**; same rounds-vs-players bucket table (4–8 → 3, 9–16 → 4, 17–32 → 5); minimum 4 players; locals 8–32; no decklists at locals; sealed (6 packs)/draft (pods of 4) exist.
- **Model fit: pure data.** GameSystem row + Format rows + SwissSchedule rows (e.g. roundTimer 35, slack 10, preEvent 15). Draft/sealed build time → `preEventTimeMinutes`. Nothing structural.
- Source: Bandai Official Tournament Rules Manual (en.onepiece-cardgame.com).

### Disney Lorcana (Ravensburger)
- Swiss with a twist: matches are a **fixed 2-game format** (both games always played, 3 pts/game + bonus, 1–1 draws normal), not Bo3. Rounds 45–50 min. Sealed 30 min build + 20 min registration; draft 25 min.
- **Minimum 8 players AND 3 completed rounds to sanction** — validates keeping `minPlayers` per-Format data instead of a constant 4.
- **Model fit: pure data.** The 2-game match structure affects *scoring*, not *time* — and our schema only models time. A SwissSchedule row (roundTimer 50, slack 10) captures it fully.
- Source: Disney Lorcana Tournament Rules (files.disneylorcana.com, 05/2024 + 2025 updates).

### Conclusion
Both games onboard as seed rows: `GameSystem` + `Format`s + shared/new `SwissSchedule` rows. No schema or code change — the class-table-inheritance schedule design holds. Two observations:
1. **Vindicated:** `minPlayers` as Format data (Lorcana needs 8, everyone else 4); duration-only schedule modeling (Lorcana's exotic match scoring is invisible to scheduling).
2. **Soft spot (known, accepted):** the Swiss rounds-vs-players bucket table is a single code constant; per-game bucket variations (Pokémon 13–20 → 5) are approximated. If exact per-game tables ever matter, promote the bucket table from code constant to SwissSchedule data — a contained change to one entity + one function, still no Format/Event impact.
