import { openDb } from './db'
import { seedAll } from './seedData'

const ctx = openDb()
const ids = seedAll(ctx)
console.log('seeded:', JSON.stringify(ids))
