import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from './app'
import { openDb, type DbCtx } from './db'
import { seedAll } from './seedData'

let ctx: DbCtx
let app: ReturnType<typeof createApp>
let ids: ReturnType<typeof seedAll>

beforeEach(() => {
  ctx = openDb(':memory:')
  ids = seedAll(ctx)
  app = createApp(ctx)
})

describe('reference data', () => {
  it('lists the 3 seeded game systems', async () => {
    const res = await request(app).get('/api/game-systems')
    expect(res.status).toBe(200)
    expect(res.body.map((g: { name: string }) => g.name)).toContain('Magic: The Gathering')
    expect(res.body).toHaveLength(3)
  })

  it('filters formats by game system', async () => {
    const res = await request(app).get(`/api/formats?gameSystemId=${ids.gameSystems.mtg}`)
    expect(res.status).toBe(200)
    expect(res.body.map((f: { name: string }) => f.name).sort()).toEqual(
      ['Booster Draft', 'Commander Night', 'Standard'],
    )
  })
})

describe('POST /api/events', () => {
  const valid = () => ({
    name: 'Test Event',
    location: 'Test Store',
    formatId: ids.formats.fmtStandard,
    startTime: '2026-09-01T18:00:00.000Z',
    capacity: 16,
  })

  it('creates an event and returns derived duration fields', async () => {
    const res = await request(app).post('/api/events').send(valid())
    expect(res.status).toBe(201)
    // Standard: swiss(50,10,15,0); cap 16 → 4 rounds → 15+240=255; min 4 players → 3 rounds → 195
    expect(res.body.maxDurationMinutes).toBe(255)
    expect(res.body.minDurationMinutes).toBe(195)
    expect(res.body.endTime).toBe('2026-09-01T22:15:00.000Z')
  })

  it('rejects capacity above the 30 ceiling', async () => {
    const res = await request(app).post('/api/events').send({ ...valid(), capacity: 31 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
  })

  it('rejects capacity below the format minPlayers (draft needs 6)', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({ ...valid(), formatId: ids.formats.fmtDraft, capacity: 4 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('CAPACITY_BELOW_MIN')
  })

  it('rejects an unknown formatId', async () => {
    const res = await request(app).post('/api/events').send({ ...valid(), formatId: 99999 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('UNKNOWN_FORMAT')
  })

  it('rejects malformed startTime', async () => {
    const res = await request(app).post('/api/events').send({ ...valid(), startTime: 'tomorrow' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/events', () => {
  it('lists seeded events with derived fields and registration counts', async () => {
    const res = await request(app).get('/api/events')
    expect(res.status).toBe(200)
    const lastSeat = res.body.find((e: { id: number }) => e.id === ids.events.lastSeat)
    expect(lastSeat.registeredCount).toBe(7)
    expect(lastSeat.capacity).toBe(8)
    // Draft swiss(50,10,65,0), cap 8 → 3 rounds → 65+180=245
    expect(lastSeat.maxDurationMinutes).toBe(245)
    const custom = res.body.find((e: { id: number }) => e.id === ids.events.custom)
    expect(custom.maxDurationMinutes).toBe(180)
    expect(custom.minDurationMinutes).toBe(180)
  })

  it('404s an unknown event id', async () => {
    const res = await request(app).get('/api/events/99999')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/events/:id/invite.ics', () => {
  it('serves a calendar invite with title, times, and location', async () => {
    const res = await request(app).get(`/api/events/${ids.events.normal}/invite.ics`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/calendar')
    expect(res.text).toContain('SUMMARY:FNM Standard')
    expect(res.text).toContain('LOCATION:Mox Boarding House')
    expect(res.text).toContain('DTSTART')
    expect(res.text).toContain('DTEND')
    expect(res.text).toMatch(/UID:.+/)
  })
})

describe('GET /api/events/:id/qr', () => {
  it('returns a QR data URL encoding the request-origin registration link', async () => {
    const res = await request(app)
      .get(`/api/events/${ids.events.normal}/qr`)
      .set('Host', 'store-laptop.local:5173')
    expect(res.status).toBe(200)
    expect(res.body.registrationUrl).toBe(
      `http://store-laptop.local:5173/events/${ids.events.normal}/register`,
    )
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/)
  })
})

describe('POST /api/events/:id/registrations', () => {
  it('registers a player on an open event', async () => {
    const res = await request(app)
      .post(`/api/events/${ids.events.normal}/registrations`)
      .send({ playerName: 'Nissa Revane' })
    expect(res.status).toBe(201)
    expect(res.body.spotsLeft).toBe(15)
  })

  it('rejects a full event with EVENT_FULL', async () => {
    const res = await request(app)
      .post(`/api/events/${ids.events.full}/registrations`)
      .send({ playerName: 'Latecomer' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('EVENT_FULL')
  })

  it('rejects a duplicate name with ALREADY_REGISTERED (not EVENT_FULL)', async () => {
    const res = await request(app)
      .post(`/api/events/${ids.events.lastSeat}/registrations`)
      .send({ playerName: 'Alice' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_REGISTERED')
  })

  it('rejects blank names', async () => {
    const res = await request(app)
      .post(`/api/events/${ids.events.normal}/registrations`)
      .send({ playerName: '   ' })
    expect(res.status).toBe(400)
  })

  it('404s an unknown event', async () => {
    const res = await request(app)
      .post('/api/events/99999/registrations')
      .send({ playerName: 'Ghost' })
    expect(res.status).toBe(404)
  })

  it('concurrent registrations for the last seat: exactly one succeeds', async () => {
    const attempts = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((playerName) =>
      request(app)
        .post(`/api/events/${ids.events.lastSeat}/registrations`)
        .send({ playerName }),
    )
    const results = await Promise.all(attempts)
    const created = results.filter((r) => r.status === 201)
    const full = results.filter((r) => r.status === 409 && r.body.error === 'EVENT_FULL')
    expect(created).toHaveLength(1)
    expect(full).toHaveLength(5)
    // And the event is now exactly at capacity, never over.
    const event = await request(app).get(`/api/events/${ids.events.lastSeat}`)
    expect(event.body.registeredCount).toBe(8)
    expect(event.body.spotsLeft).toBe(0)
  })
})
