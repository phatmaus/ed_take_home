import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { MAX_CAPACITY } from 'shared'
import * as schema from './schema'

// DDL mirrors schema.ts; kept as hand-written SQL to avoid a drizzle-kit migration step
// in the timebox. This file is the source of truth for CHECK/collation constraints —
// schema.ts documents shape, not constraints. Capacity ceiling comes from the shared
// constant so the rule has one definition.
const DDL = `
CREATE TABLE IF NOT EXISTS game_systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('SWISS','CUSTOM'))
);
CREATE TABLE IF NOT EXISTS swiss_schedules (
  schedule_id INTEGER PRIMARY KEY REFERENCES schedules(id),
  round_timer_minutes INTEGER NOT NULL CHECK (round_timer_minutes > 0),
  overtime_slack_minutes INTEGER NOT NULL CHECK (overtime_slack_minutes >= 0),
  pre_event_time_minutes INTEGER NOT NULL CHECK (pre_event_time_minutes >= 0),
  break_time_minutes INTEGER NOT NULL CHECK (break_time_minutes >= 0)
);
CREATE TABLE IF NOT EXISTS custom_schedules (
  schedule_id INTEGER PRIMARY KEY REFERENCES schedules(id),
  time_in_minutes INTEGER NOT NULL UNIQUE CHECK (time_in_minutes > 0)
);
-- Schedule child rows are shared immutable value objects; back the SWISS dedup with
-- the same DB-level uniqueness CUSTOM already has.
CREATE UNIQUE INDEX IF NOT EXISTS ux_swiss_params ON swiss_schedules
  (round_timer_minutes, overtime_slack_minutes, pre_event_time_minutes, break_time_minutes);
CREATE TABLE IF NOT EXISTS formats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_system_id INTEGER NOT NULL REFERENCES game_systems(id),
  name TEXT NOT NULL,
  min_players INTEGER NOT NULL CHECK (min_players > 0),
  schedule_id INTEGER NOT NULL REFERENCES schedules(id)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  format_id INTEGER NOT NULL REFERENCES formats(id),
  start_time TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND ${MAX_CAPACITY})
);
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  player_name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  UNIQUE(event_id, player_name)
);
`

// Bump when the DDL changes shape/constraints. CREATE IF NOT EXISTS never alters
// existing tables, so a DB file from an older DDL must be refused loudly (REG-1/REG-2)
// rather than silently running without e.g. the NOCASE duplicate protection.
const SCHEMA_VERSION = 1

export function openDb(path: string = process.env.DB_PATH ?? 'data.db') {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const hasTables = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='events'`)
    .get()
  const version = sqlite.pragma('user_version', { simple: true }) as number
  if (hasTables && version !== SCHEMA_VERSION) {
    sqlite.close()
    throw new Error(
      `Database ${path} was created by an older schema (user_version ${version}, need ${SCHEMA_VERSION}). ` +
        `Delete the file and re-run the seed (rm ${path}* && npm run seed), or docker compose down && up.`,
    )
  }
  sqlite.exec(DDL)
  sqlite.pragma(`user_version = ${SCHEMA_VERSION}`)
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}

export type DbCtx = ReturnType<typeof openDb>
