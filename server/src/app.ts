import express from 'express'
import { eq } from 'drizzle-orm'
import ical from 'ical-generator'
import QRCode from 'qrcode'
import {
  createEventSchema,
  deriveDurationMinutes,
  registrationSchema,
  type ScheduleInfo,
} from 'shared'
import type { DbCtx } from './db'
import * as t from './schema'

function scheduleInfo(ctx: DbCtx, scheduleId: number): ScheduleInfo {
  const row = ctx.sqlite
    .prepare(
      `SELECT s.type, sw.round_timer_minutes rt, sw.overtime_slack_minutes slack,
              sw.pre_event_time_minutes pre, sw.break_time_minutes brk, cu.time_in_minutes fixed
       FROM schedules s
       LEFT JOIN swiss_schedules sw ON sw.schedule_id = s.id
       LEFT JOIN custom_schedules cu ON cu.schedule_id = s.id
       WHERE s.id = ?`,
    )
    .get(scheduleId) as
    | { type: 'SWISS' | 'CUSTOM'; rt: number; slack: number; pre: number; brk: number; fixed: number }
    | undefined
  if (!row) throw new Error(`schedule ${scheduleId} missing`)
  return row.type === 'SWISS'
    ? {
        type: 'SWISS',
        swiss: {
          roundTimerMinutes: row.rt,
          overtimeSlackMinutes: row.slack,
          preEventTimeMinutes: row.pre,
          breakTimeMinutes: row.brk,
        },
      }
    : { type: 'CUSTOM', timeInMinutes: row.fixed }
}

interface EventRow {
  id: number
  name: string
  location: string
  formatId: number
  startTime: string
  capacity: number
}

function enrichEvent(ctx: DbCtx, event: EventRow) {
  const format = ctx.db.select().from(t.formats).where(eq(t.formats.id, event.formatId)).get()!
  const game = ctx.db
    .select()
    .from(t.gameSystems)
    .where(eq(t.gameSystems.id, format.gameSystemId))
    .get()!
  const sched = scheduleInfo(ctx, format.scheduleId)
  const registeredCount = (
    ctx.sqlite
      .prepare('SELECT COUNT(*) c FROM registrations WHERE event_id = ?')
      .get(event.id) as { c: number }
  ).c
  const minDurationMinutes = deriveDurationMinutes(sched, format.minPlayers)
  const maxDurationMinutes = deriveDurationMinutes(sched, event.capacity)
  const endTime = new Date(
    new Date(event.startTime).getTime() + maxDurationMinutes * 60_000,
  ).toISOString()
  return {
    ...event,
    formatName: format.name,
    gameSystemName: game.name,
    minPlayers: format.minPlayers,
    registeredCount,
    spotsLeft: event.capacity - registeredCount,
    minDurationMinutes,
    maxDurationMinutes,
    endTime,
  }
}

export function createApp(ctx: DbCtx) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/game-systems', (_req, res) => {
    res.json(ctx.db.select().from(t.gameSystems).all())
  })

  app.get('/api/formats', (req, res) => {
    const gameSystemId = Number(req.query.gameSystemId)
    const rows = Number.isInteger(gameSystemId)
      ? ctx.db.select().from(t.formats).where(eq(t.formats.gameSystemId, gameSystemId)).all()
      : ctx.db.select().from(t.formats).all()
    res.json(rows)
  })

  app.post('/api/events', (req, res) => {
    const parsed = createEventSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() })
      return
    }
    const input = parsed.data
    const format = ctx.db.select().from(t.formats).where(eq(t.formats.id, input.formatId)).get()
    if (!format) {
      res.status(400).json({ error: 'UNKNOWN_FORMAT', message: `format ${input.formatId} does not exist` })
      return
    }
    if (input.capacity < format.minPlayers) {
      res.status(400).json({
        error: 'CAPACITY_BELOW_MIN',
        message: `${format.name} needs at least ${format.minPlayers} players`,
      })
      return
    }
    const id = Number(ctx.db.insert(t.events).values(input).run().lastInsertRowid)
    const event = ctx.db.select().from(t.events).where(eq(t.events.id, id)).get()!
    res.status(201).json(enrichEvent(ctx, event))
  })

  app.get('/api/events', (req, res) => {
    let rows = ctx.db.select().from(t.events).all()
    const { from, to } = req.query
    if (typeof from === 'string' && from) rows = rows.filter((e) => e.startTime >= from)
    if (typeof to === 'string' && to) rows = rows.filter((e) => e.startTime <= to)
    res.json(rows.map((e) => enrichEvent(ctx, e)))
  })

  const loadEvent = (idParam: string) => {
    const id = Number(idParam)
    if (!Number.isInteger(id)) return undefined
    return ctx.db.select().from(t.events).where(eq(t.events.id, id)).get()
  }

  app.get('/api/events/:id', (req, res) => {
    const event = loadEvent(req.params.id)
    if (!event) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    res.json(enrichEvent(ctx, event))
  })

  app.get('/api/events/:id/invite.ics', (req, res) => {
    const event = loadEvent(req.params.id)
    if (!event) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    const enriched = enrichEvent(ctx, event)
    const cal = ical({ name: 'TCG Event Calendar' })
    cal.createEvent({
      id: `event-${event.id}@ed-take-home`,
      start: new Date(event.startTime),
      end: new Date(enriched.endTime),
      summary: event.name,
      location: event.location,
      description: `${enriched.gameSystemName} — ${enriched.formatName}. Runs ${enriched.minDurationMinutes}–${enriched.maxDurationMinutes} min depending on attendance.`,
    })
    res
      .type('text/calendar')
      .setHeader('Content-Disposition', `attachment; filename="event-${event.id}.ics"`)
      .send(cal.toString())
  })

  app.get('/api/events/:id/qr', async (req, res) => {
    const event = loadEvent(req.params.id)
    if (!event) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    // Origin from the request so a phone on the same network gets a reachable link
    // (in dev the Vite proxy forwards the client's Host header).
    const registrationUrl = `${req.protocol}://${req.get('host')}/events/${event.id}/register`
    const qrDataUrl = await QRCode.toDataURL(registrationUrl)
    res.json({ registrationUrl, qrDataUrl })
  })

  app.post('/api/events/:id/registrations', (req, res) => {
    const event = loadEvent(req.params.id)
    if (!event) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    const parsed = registrationSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() })
      return
    }
    // Atomic capacity check + insert in one statement: the WHERE re-counts inside the
    // same write, and better-sqlite3's synchronous single-writer model serializes
    // concurrent attempts, so the last seat can never be double-sold.
    try {
      const result = ctx.sqlite
        .prepare(
          `INSERT INTO registrations (event_id, player_name, created_at)
           SELECT @eventId, @playerName, @now
           WHERE (SELECT COUNT(*) FROM registrations WHERE event_id = @eventId)
                 < (SELECT capacity FROM events WHERE id = @eventId)`,
        )
        .run({ eventId: event.id, playerName: parsed.data.playerName, now: new Date().toISOString() })
      if (result.changes === 0) {
        res.status(409).json({
          error: 'EVENT_FULL',
          message: `${event.name} is full (${event.capacity} players)`,
        })
        return
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        res.status(409).json({
          error: 'ALREADY_REGISTERED',
          message: `"${parsed.data.playerName}" is already registered for this event`,
        })
        return
      }
      throw err
    }
    res.status(201).json(enrichEvent(ctx, ctx.db.select().from(t.events).where(eq(t.events.id, event.id)).get()!))
  })

  return app
}
