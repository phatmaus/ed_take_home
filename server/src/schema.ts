// Documents table SHAPE for typed queries only. Constraints (CHECKs, NOCASE collation,
// value-object unique indexes, schema versioning) live in db.ts's DDL — that file is
// the source of truth; keep the two in sync when either changes.
import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const gameSystems = sqliteTable('game_systems', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

export const schedules = sqliteTable('schedules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['SWISS', 'CUSTOM'] }).notNull(),
})

export const swissSchedules = sqliteTable('swiss_schedules', {
  scheduleId: integer('schedule_id')
    .primaryKey()
    .references(() => schedules.id),
  roundTimerMinutes: integer('round_timer_minutes').notNull(),
  overtimeSlackMinutes: integer('overtime_slack_minutes').notNull(),
  preEventTimeMinutes: integer('pre_event_time_minutes').notNull(),
  breakTimeMinutes: integer('break_time_minutes').notNull(),
})

export const customSchedules = sqliteTable('custom_schedules', {
  scheduleId: integer('schedule_id')
    .primaryKey()
    .references(() => schedules.id),
  timeInMinutes: integer('time_in_minutes').notNull().unique(),
})

export const formats = sqliteTable('formats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameSystemId: integer('game_system_id')
    .notNull()
    .references(() => gameSystems.id),
  name: text('name').notNull(),
  minPlayers: integer('min_players').notNull(),
  scheduleId: integer('schedule_id')
    .notNull()
    .references(() => schedules.id),
})

export const locations = sqliteTable('locations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  openTime: text('open_time').notNull(), // 'HH:mm' wall clock
  closeTime: text('close_time').notNull(), // 'HH:mm', must be after openTime (no overnight)
  timeZone: text('time_zone').notNull(), // IANA, e.g. 'America/Los_Angeles'
})

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  locationId: integer('location_id')
    .notNull()
    .references(() => locations.id),
  formatId: integer('format_id')
    .notNull()
    .references(() => formats.id),
  startTime: text('start_time').notNull(), // UTC instant (converted from location wall time)
  capacity: integer('capacity').notNull(),
})

export const registrations = sqliteTable(
  'registrations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id),
    playerName: text('player_name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [unique().on(t.eventId, t.playerName)],
)
