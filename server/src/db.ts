import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

// DDL mirrors schema.ts; kept as hand-written SQL to avoid a drizzle-kit migration step
// in the timebox. CHECK on capacity duplicates the shared Zod ceiling as defense in depth.
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
  round_timer_minutes INTEGER NOT NULL,
  overtime_slack_minutes INTEGER NOT NULL,
  pre_event_time_minutes INTEGER NOT NULL,
  break_time_minutes INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_schedules (
  schedule_id INTEGER PRIMARY KEY REFERENCES schedules(id),
  time_in_minutes INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS formats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_system_id INTEGER NOT NULL REFERENCES game_systems(id),
  name TEXT NOT NULL,
  min_players INTEGER NOT NULL,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  format_id INTEGER NOT NULL REFERENCES formats(id),
  start_time TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 30)
);
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  player_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(event_id, player_name)
);
`

export function openDb(path: string = process.env.DB_PATH ?? 'data.db') {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(DDL)
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}

export type DbCtx = ReturnType<typeof openDb>
