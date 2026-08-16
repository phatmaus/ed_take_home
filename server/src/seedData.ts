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

export function seedAll(ctx: DbCtx) {
  // Wipe in FK order.
  for (const table of [
    'registrations',
    'events',
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
    location: string,
    formatId: number,
    startTime: string,
    capacity: number,
    players: string[],
  ) => {
    const eventId = Number(
      ctx.db.insert(t.events).values({ name, location, formatId, startTime, capacity }).run()
        .lastInsertRowid,
    )
    const now = new Date().toISOString()
    for (const playerName of players) {
      ctx.db.insert(t.registrations).values({ eventId, playerName, createdAt: now }).run()
    }
    return eventId
  }

  const names = (n: number) =>
    ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace'].slice(0, n)

  // Dangerous presets per implementation_plan.md:
  const lastSeat = insertEvent(
    'Draft Night', 'Mox Boarding House', fmtDraft, daysFromNow(5, 1), 8, names(7), // 1 seat left
  )
  const full = insertEvent(
    'League Challenge', 'Card Kingdom', fmtPokemon, daysFromNow(2, 17), 4, names(4), // at capacity
  )
  const minBoundary = insertEvent(
    'Advanced Locals', 'Uncle’s Games', fmtAdvanced, daysFromNow(4, 18), 4, names(1), // capacity == minPlayers
  )
  const normal = insertEvent('FNM Standard', 'Mox Boarding House', fmtStandard, daysFromNow(3, 1), 16, [])
  const custom = insertEvent('Commander Night', 'Card Kingdom', fmtCommander, daysFromNow(7, 2), 8, names(2))

  return {
    gameSystems: { mtg, pokemon, yugioh },
    formats: { fmtStandard, fmtDraft, fmtCommander, fmtPokemon, fmtAdvanced },
    events: { lastSeat, full, minBoundary, normal, custom },
  }
}
