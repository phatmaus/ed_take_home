import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb } from './db'

describe('REG-1/REG-2: legacy database files are refused loudly, not silently mis-handled', () => {
  it('openDb throws a clear error on a pre-versioning DB instead of running with stale schema', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ed-db-')), 'legacy.db')
    const legacy = new Database(file)
    // Minimal legacy shape: tables exist, user_version is 0 (pre-fix DDL).
    legacy.exec('CREATE TABLE events (id INTEGER PRIMARY KEY)')
    legacy.close()
    expect(() => openDb(file)).toThrow(/older schema|delete/i)
  })

  it('openDb stamps and accepts fresh/current DBs', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ed-db-')), 'fresh.db')
    const ctx = openDb(file)
    expect(ctx.sqlite.pragma('user_version', { simple: true })).toBeGreaterThan(0)
    ctx.sqlite.close()
    expect(() => openDb(file)).not.toThrow()
  })
})
