import type { DbCtx } from './db'
import * as t from './schema'

// Schedule child rows are shared, immutable value objects (data_model_plan.md):
// formats point at existing rows where params match; never mutate a row in place.
export function findOrCreateSwissSchedule(
  ctx: DbCtx,
  params: { roundTimer: number; overtimeSlack: number; preEventTime: number; breakTime: number },
): number {
  const existing = ctx.sqlite
    .prepare(
      `SELECT schedule_id id FROM swiss_schedules
       WHERE round_timer_minutes=? AND overtime_slack_minutes=? AND pre_event_time_minutes=? AND break_time_minutes=?`,
    )
    .get(params.roundTimer, params.overtimeSlack, params.preEventTime, params.breakTime) as
    | { id: number }
    | undefined
  if (existing) return existing.id
  const scheduleId = Number(
    ctx.db.insert(t.schedules).values({ type: 'SWISS' }).run().lastInsertRowid,
  )
  ctx.db
    .insert(t.swissSchedules)
    .values({
      scheduleId,
      roundTimerMinutes: params.roundTimer,
      overtimeSlackMinutes: params.overtimeSlack,
      preEventTimeMinutes: params.preEventTime,
      breakTimeMinutes: params.breakTime,
    })
    .run()
  return scheduleId
}

export function findOrCreateCustomSchedule(ctx: DbCtx, timeInMinutes: number): number {
  const existing = ctx.sqlite
    .prepare(`SELECT schedule_id id FROM custom_schedules WHERE time_in_minutes=?`)
    .get(timeInMinutes) as { id: number } | undefined
  if (existing) return existing.id
  const scheduleId = Number(
    ctx.db.insert(t.schedules).values({ type: 'CUSTOM' }).run().lastInsertRowid,
  )
  ctx.db.insert(t.customSchedules).values({ scheduleId, timeInMinutes }).run()
  return scheduleId
}

function daysFromNow(days: number, hourUtc: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hourUtc, 0, 0, 0)
  return d.toISOString()
}

// Templates only (game systems, schedules, formats) — the app is unusable without
// these (no admin UI exists), so even an "empty" deployment needs them (P3-3).
export function seedTemplates(ctx: DbCtx) {
  return seedTx(ctx, false)
}

export function seedAll(ctx: DbCtx) {
  return seedTx(ctx, true)
}

// Wrapped in a transaction so a mid-seed failure can't leave a half-wiped DB.
function seedTx(ctx: DbCtx, withSampleEvents: boolean) {
  return ctx.sqlite.transaction(() => seedInner(ctx, withSampleEvents))()
}

function seedInner(ctx: DbCtx, withSampleEvents: boolean) {
  // Wipe in FK order.
  for (const table of [
    'registrations',
    'events',
    'locations',
    'formats',
    'swiss_schedules',
    'custom_schedules',
    'schedules',
    'game_systems',
  ]) {
    ctx.sqlite.prepare(`DELETE FROM ${table}`).run()
  }

  const insertGame = (name: string) =>
    Number(ctx.db.insert(t.gameSystems).values({ name }).run().lastInsertRowid)
  const mtg = insertGame('Magic: The Gathering')
  const pokemon = insertGame('Pokémon TCG')
  const yugioh = insertGame('Yu-Gi-Oh!')

  // MTG Standard and Yu-Gi-Oh Advanced share identical Swiss params → same shared row.
  const swiss50 = findOrCreateSwissSchedule(ctx, { roundTimer: 50, overtimeSlack: 10, preEventTime: 15, breakTime: 0 })
  const swissDraft = findOrCreateSwissSchedule(ctx, { roundTimer: 50, overtimeSlack: 10, preEventTime: 65, breakTime: 0 })
  const swiss30 = findOrCreateSwissSchedule(ctx, { roundTimer: 30, overtimeSlack: 10, preEventTime: 15, breakTime: 0 })
  const custom180 = findOrCreateCustomSchedule(ctx, 180)

  const insertFormat = (gameSystemId: number, name: string, minPlayers: number, scheduleId: number) =>
    Number(
      ctx.db.insert(t.formats).values({ gameSystemId, name, minPlayers, scheduleId }).run()
        .lastInsertRowid,
    )
  const fmtStandard = insertFormat(mtg, 'Standard', 4, swiss50)
  const fmtDraft = insertFormat(mtg, 'Booster Draft', 6, swissDraft)
  const fmtCommander = insertFormat(mtg, 'Commander Night', 4, custom180)
  const fmtPokemon = insertFormat(pokemon, 'Standard (League Challenge)', 4, swiss30)
  const fmtAdvanced = insertFormat(yugioh, 'Advanced', 4, swiss50)

  const insertEvent = (
    name: string,
    locationId: number,
    formatId: number,
    startTime: string,
    capacity: number,
    players: string[],
  ) => {
    const eventId = Number(
      ctx.db.insert(t.events).values({ name, locationId, formatId, startTime, capacity }).run()
        .lastInsertRowid,
    )
    const now = new Date().toISOString()
    for (const playerName of players) {
      ctx.db.insert(t.registrations).values({ eventId, playerName, createdAt: now }).run()
    }
    return eventId
  }

  const insertLocation = (name: string, openTime: string, closeTime: string, timeZone: string) =>
    Number(
      ctx.db.insert(t.locations).values({ name, openTime, closeTime, timeZone }).run()
        .lastInsertRowid,
    )
  const locMox = insertLocation('Mox Boarding House', '10:00', '23:59', 'America/Los_Angeles')
  const locCK = insertLocation('Card Kingdom', '09:00', '22:00', 'America/Los_Angeles')
  const locUncles = insertLocation('Uncle’s Games', '11:00', '21:00', 'America/New_York')

  const templates = {
    gameSystems: { mtg, pokemon, yugioh },
    formats: { fmtStandard, fmtDraft, fmtCommander, fmtPokemon, fmtAdvanced },
    locations: { locMox, locCK, locUncles },
  }
  if (!withSampleEvents) {
    return { ...templates, events: {} as Record<string, number> }
  }

  const names = (n: number) =>
    ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace'].slice(0, n)

  // Dangerous presets per implementation_plan.md:
  // Stored UTC instants chosen to be sane local times at each location's tz.
  const lastSeat = insertEvent(
    'Draft Night', locMox, fmtDraft, daysFromNow(5, 1), 8, names(7), // 1 seat left; 18:00 PDT
  )
  const full = insertEvent(
    'League Challenge', locCK, fmtPokemon, daysFromNow(2, 17), 4, names(4), // at capacity; 10:00 PDT
  )
  const minBoundary = insertEvent(
    'Advanced Locals', locUncles, fmtAdvanced, daysFromNow(4, 18), 4, names(1), // capacity == minPlayers; 14:00 EDT
  )
  const normal = insertEvent('FNM Standard', locMox, fmtStandard, daysFromNow(3, 1), 16, [])
  const custom = insertEvent('Commander Night', locCK, fmtCommander, daysFromNow(7, 2), 8, names(2))

  return { ...templates, events: { lastSeat, full, minBoundary, normal, custom } }
}
