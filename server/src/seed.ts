import { openDb } from './db'
import { seedAll, seedTemplates } from './seedData'

// EMPTY_DB=1: templates only (games/formats/schedules) — no sample events.
// The app can't create events without templates, so "empty" never means bare tables.
const ctx = openDb()
const ids = process.env.EMPTY_DB === '1' ? seedTemplates(ctx) : seedAll(ctx)
console.log('seeded:', JSON.stringify(ids))
