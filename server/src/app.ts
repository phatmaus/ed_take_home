import express, { type NextFunction, type Request, type Response } from 'express'
import { eq } from 'drizzle-orm'
import ical from 'ical-generator'
import QRCode from 'qrcode'
import { z } from 'zod'
import {
  createEventSchema,
  createEventSchemaFor,
  deriveDurationMinutes,
  registrationSchema,
  type ScheduleInfo,
} from 'shared'
import type { DbCtx } from './db'
import * as t from './schema'

const firstIssue = (err: z.ZodError) =>
  err.issues[0] ? `${err.issues[0].path.join('.')}: ${err.issues[0].message}` : 'invalid input'

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
    | { type: 'SWISS' | 'CUSTOM'; rt: number | null; slack: number | null; pre: number | null; brk: number | null; fixed: number | null }
    | undefined
  if (!row) throw new Error(`schedule ${scheduleId} missing`)
  // Fail loudly on an orphan parent row — silent nulls would coerce to 0-minute events.
  if (row.type === 'SWISS' && row.rt == null)
    throw new Error(`SWISS schedule ${scheduleId} has no swiss_schedules child row`)
  if (row.type === 'CUSTOM' && row.fixed == null)
    throw new Error(`CUSTOM schedule ${scheduleId} has no custom_schedules child row`)
  return row.type === 'SWISS'
    ? {
        type: 'SWISS',
        swiss: {
          roundTimerMinutes: row.rt!,
          overtimeSlackMinutes: row.slack!,
          preEventTimeMinutes: row.pre!,
          breakTimeMinutes: row.brk!,
        },
      }
    : { type: 'CUSTOM', timeInMinutes: row.fixed! }
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
    const raw = req.query.gameSystemId
    if (raw === undefined) {
      res.json(ctx.db.select().from(t.formats).all())
      return
    }
    // Fail closed: a malformed filter must never silently return other games' formats.
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
      res.status(400).json({ error: 'VALIDATION', message: 'gameSystemId must be a positive integer' })
      return
    }
    res.json(ctx.db.select().from(t.formats).where(eq(t.formats.gameSystemId, Number(raw))).all())
  })

  app.post('/api/events', (req, res) => {
    const parsed = createEventSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'VALIDATION', message: firstIssue(parsed.error), details: parsed.error.flatten() })
      return
    }
    const format = ctx.db.select().from(t.formats).where(eq(t.formats.id, parsed.data.formatId)).get()
    if (!format) {
      res.status(400).json({ error: 'UNKNOWN_FORMAT', message: `format ${parsed.data.formatId} does not exist` })
      return
    }
    // The true capacity floor is the format's minPlayers — same shared schema the client uses.
    const withFloor = createEventSchemaFor(format.minPlayers).safeParse(req.body)
    if (!withFloor.success) {
      res.status(400).json({ error: 'CAPACITY_BELOW_MIN', message: firstIssue(withFloor.error) })
      return
    }
    // Normalize startTime so stored values have one canonical ISO form (instant-safe filtering).
    const input = { ...withFloor.data, startTime: new Date(withFloor.data.startTime).toISOString() }
    const id = Number(ctx.db.insert(t.events).values(input).run().lastInsertRowid)
    const event = ctx.db.select().from(t.events).where(eq(t.events.id, id)).get()!
    res.status(201).json(enrichEvent(ctx, event))
  })

  const rangeSchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })

  app.get('/api/events', (req, res) => {
    const range = rangeSchema.safeParse({ from: req.query.from, to: req.query.to })
    if (!range.success) {
      res.status(400).json({ error: 'VALIDATION', message: firstIssue(range.error) })
      return
    }
    let rows = ctx.db.select().from(t.events).all()
    const from = range.data.from ? Date.parse(range.data.from) : undefined
    const to = range.data.to ? Date.parse(range.data.to) : undefined
    if (from !== undefined) rows = rows.filter((e) => Date.parse(e.startTime) >= from)
    if (to !== undefined) rows = rows.filter((e) => Date.parse(e.startTime) <= to)
    // Per-row isolation: one row with broken schedule data must not blank the calendar.
    const enriched = []
    for (const e of rows) {
      try {
        enriched.push(enrichEvent(ctx, e))
      } catch (err) {
        console.error(`skipping event ${e.id} in feed:`, err)
      }
    }
    res.json(enriched)
  })

  // Canonical decimal ids only — '04', '0x4', '1e0' are rejected, not aliased.
  const loadEvent = (idParam: string) => {
    if (!/^[1-9]\d*$/.test(idParam)) return 'invalid' as const
    return ctx.db.select().from(t.events).where(eq(t.events.id, Number(idParam))).get()
  }

  const sendLoadFailure = (res: Response, event: 'invalid' | undefined) => {
    if (event === 'invalid') res.status(400).json({ error: 'INVALID_ID', message: 'event id must be a positive integer' })
    else res.status(404).json({ error: 'NOT_FOUND' })
  }

  app.get('/api/events/:id', (req, res) => {
    const event = loadEvent(req.params.id)
    if (!event || event === 'invalid') {
      sendLoadFailure(res, event)
      return
    }
    res.json(enrichEvent(ctx, event))
  })

  app.get('/api/events/:id/invite.ics', (req, res) => {
    const event = loadEvent(req.params.id)
    if (!event || event === 'invalid') {
      sendLoadFailure(res, event)
      return
    }
    const enriched = enrichEvent(ctx, event)
    const cal = ical({ name: 'TCG Event Calendar' })
    cal.createEvent({
      // RFC 5545 wants globally unique UIDs — domain half is deployment-configurable.
      id: `event-${event.id}@${process.env.APP_DOMAIN ?? 'ed-take-home.example'}`,
      start: new Date(event.startTime),
      end: new Date(enriched.endTime),
      summary: event.name,
      location: event.location,
      description: `${enriched.gameSystemName} — ${enriched.formatName}. Runs ${enriched.minDurationMinutes}–${enriched.maxDurationMinutes} min depending on attendance.`,
    })
    res
      .type('text/calendar')
      .setHeader('Content-Disposition', `attachment; filename="event-${event.id}.ics"`)
      // RFC 5545 §3.1: every content line, including the last, is CRLF-terminated.
      .send(cal.toString() + '\r\n')
  })

  app.get('/api/events/:id/qr', async (req, res) => {
    const event = loadEvent(req.params.id)
    if (!event || event === 'invalid') {
      sendLoadFailure(res, event)
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
    if (!event || event === 'invalid') {
      sendLoadFailure(res, event)
      return
    }
    const parsed = registrationSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'VALIDATION', message: firstIssue(parsed.error), details: parsed.error.flatten() })
      return
    }
    // Duplicate check first (NOCASE collation makes it case-insensitive): a player who
    // already holds a seat must hear "already registered", even when the event is full.
    const existing = ctx.sqlite
      .prepare('SELECT 1 FROM registrations WHERE event_id = ? AND player_name = ?')
      .get(event.id, parsed.data.playerName)
    if (existing) {
      res.status(409).json({
        error: 'ALREADY_REGISTERED',
        message: `"${parsed.data.playerName}" is already registered for this event`,
      })
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
      // Race fallback (the probe above wins in-process; this guards cross-process writers).
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
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

  // Unknown API routes: JSON, not Express's HTML "Cannot GET".
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'no such endpoint' })
  })

  // Error contract of last resort: JSON body-parse 400s, JSON 500s, no stack disclosure.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err)
      return
    }
    const e = err as { type?: string; status?: number }
    if (e.type === 'entity.parse.failed' || (err instanceof SyntaxError && e.status === 400)) {
      res.status(400).json({ error: 'INVALID_JSON', message: 'request body is not valid JSON' })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'INTERNAL', message: 'internal server error' })
  })

  return app
}
