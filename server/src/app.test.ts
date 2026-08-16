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

  it('duplicate name on a FULL event answers ALREADY_REGISTERED, not EVENT_FULL (BE-1)', async () => {
    const res = await request(app)
      .post(`/api/events/${ids.events.full}/registrations`)
      .send({ playerName: 'Alice' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_REGISTERED')
  })

  it('case-variant duplicate is rejected: one Shift key must not buy a second seat (BE-15)', async () => {
    const res = await request(app)
      .post(`/api/events/${ids.events.lastSeat}/registrations`)
      .send({ playerName: 'aLiCe' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_REGISTERED')
  })

  it('inner-whitespace variant is the same identity (BE-15)', async () => {
    await request(app)
      .post(`/api/events/${ids.events.normal}/registrations`)
      .send({ playerName: 'Jace Beleren' })
    const res = await request(app)
      .post(`/api/events/${ids.events.normal}/registrations`)
      .send({ playerName: 'Jace   Beleren' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_REGISTERED')
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

describe('error contract hardening (BE-3, BE-4, BE-9, BE-10, BE-6, BE-16)', () => {
  it('malformed JSON body gets a JSON 400, not an HTML stack trace (BE-3)', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Content-Type', 'application/json')
      .send('{"name":')
    expect(res.status).toBe(400)
    expect(res.headers['content-type']).toContain('application/json')
    expect(res.body.error).toBe('INVALID_JSON')
  })

  it('unknown /api routes get a JSON 404 (BE-3)', async () => {
    const res = await request(app).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('NOT_FOUND')
  })

  it('server VALIDATION errors carry a human message (FE-4 server half)', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({ name: '', location: 'X', formatId: ids.formats.fmtStandard, startTime: '2026-09-01T18:00:00.000Z', capacity: 8 })
    expect(res.status).toBe(400)
    expect(typeof res.body.message).toBe('string')
    expect(res.body.message.length).toBeGreaterThan(0)
  })

  it('garbage from/to bounds are rejected, not silently misfiltered (BE-4)', async () => {
    const res = await request(app).get('/api/events?from=banana')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
  })

  it('from/to filtering compares instants, immune to ms-precision formatting (BE-4)', async () => {
    const created = await request(app).post('/api/events').send({
      name: 'Precision', location: 'X', formatId: ids.formats.fmtStandard,
      startTime: '2026-09-05T18:00:00Z', capacity: 8,
    })
    expect(created.status).toBe(201)
    const res = await request(app).get(
      '/api/events?from=2026-09-05T18:00:00.000Z&to=2026-09-05T18:00:00.999Z',
    )
    expect(res.status).toBe(200)
    expect(res.body.map((e: { name: string }) => e.name)).toContain('Precision')
  })

  it('non-integer gameSystemId is a 400, never fail-open to all formats (BE-9)', async () => {
    const res = await request(app).get('/api/formats?gameSystemId=abc')
    expect(res.status).toBe(400)
  })

  it('non-canonical event ids are 400 INVALID_ID, not aliases (BE-10)', async () => {
    for (const bad of ['04', '0x4', '1e0', '4.0', 'abc']) {
      const res = await request(app).get(`/api/events/${bad}`)
      expect(res.status, bad).toBe(400)
      expect(res.body.error, bad).toBe('INVALID_ID')
    }
  })

  it('.ics ends with CRLF and UID carries a domain (BE-6, BE-16)', async () => {
    const res = await request(app).get(`/api/events/${ids.events.normal}/invite.ics`)
    expect(res.text.endsWith('\r\n')).toBe(true)
    expect(res.text).toMatch(/UID:event-\d+@[a-z0-9.-]+\.[a-z]+/i)
  })
})

describe('data-integrity guards (BE-2, BE-5, BE-17)', () => {
  it('a sub-4 minPlayers format (data-only 4th game) derives instead of crashing the feed (BE-2)', async () => {
    ctx.sqlite.prepare(`INSERT INTO game_systems (name) VALUES ('Board Games')`).run()
    const gs = ctx.sqlite.prepare(`SELECT id FROM game_systems WHERE name='Board Games'`).get() as { id: number }
    const sched = ctx.sqlite.prepare(`SELECT schedule_id id FROM swiss_schedules LIMIT 1`).get() as { id: number }
    ctx.sqlite
      .prepare(`INSERT INTO formats (game_system_id, name, min_players, schedule_id) VALUES (?, 'Catan League', 2, ?)`)
      .run(gs.id, sched.id)
    const fmt = ctx.sqlite.prepare(`SELECT id FROM formats WHERE name='Catan League'`).get() as { id: number }
    const created = await request(app).post('/api/events').send({
      name: 'Catan Night', location: 'Store', formatId: fmt.id,
      startTime: '2026-10-01T18:00:00.000Z', capacity: 8,
    })
    expect(created.status).toBe(201)
    expect(created.body.minDurationMinutes).toBeGreaterThan(0)
    const list = await request(app).get('/api/events')
    expect(list.status).toBe(200)
    expect(list.body.map((e: { name: string }) => e.name)).toContain('Catan Night')
  })

  it('an orphan schedule row cannot silently produce 0-minute events (BE-5) and does not blank the rest of the feed (BE-17)', async () => {
    ctx.sqlite.prepare(`INSERT INTO schedules (type) VALUES ('SWISS')`).run()
    const orphan = ctx.sqlite.prepare(`SELECT MAX(id) id FROM schedules`).get() as { id: number }
    ctx.sqlite
      .prepare(`INSERT INTO formats (game_system_id, name, min_players, schedule_id) VALUES (1, 'Broken', 4, ?)`)
      .run(orphan.id)
    const fmt = ctx.sqlite.prepare(`SELECT id FROM formats WHERE name='Broken'`).get() as { id: number }
    ctx.sqlite
      .prepare(`INSERT INTO events (name, location, format_id, start_time, capacity) VALUES ('Broken Event','X',?,'2026-10-02T18:00:00.000Z',8)`)
      .run(fmt.id)
    const list = await request(app).get('/api/events')
    expect(list.status).toBe(200)
    const names = list.body.map((e: { name: string }) => e.name)
    expect(names).not.toContain('Broken Event') // skipped, not rendered as 0-minute
    expect(names).toContain('FNM Standard') // rest of the feed survives
  })
})

describe('re-review regressions (REG-*)', () => {
  it('REG-3: oversized JSON body is a 413 client error, not a 500', async () => {
    const res = await request(app)
      .post(`/api/events/${ids.events.normal}/registrations`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ playerName: 'x'.repeat(200_000) }))
    expect(res.status).toBe(413)
    expect(res.headers['content-type']).toContain('application/json')
  })

  it('REG-4: empty APP_DOMAIN falls back to the default UID domain', async () => {
    process.env.APP_DOMAIN = ''
    try {
      const res = await request(app).get(`/api/events/${ids.events.normal}/invite.ics`)
      expect(res.text).toContain('@ed-take-home.example')
    } finally {
      delete process.env.APP_DOMAIN
    }
  })

  it('REG-6: offset-form from/to bounds are usable; empty means omitted (date-only stays rejected)', async () => {
    for (const q of ['?from=2020-01-01T00:00:00%2B02:00', '?from=&to=']) {
      const res = await request(app).get(`/api/events${q}`)
      expect(res.status, q).toBe(200)
    }
  })

  it('REG-5: a zero min_players format is impossible at the DB layer', () => {
    expect(() =>
      ctx.sqlite
        .prepare(`INSERT INTO formats (game_system_id, name, min_players, schedule_id) VALUES (1,'Zero',0,1)`)
        .run(),
    ).toThrow(/CHECK/)
  })
})
