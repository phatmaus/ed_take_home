import { describe, expect, it } from 'vitest'
import { createEventSchema, registrationSchema } from './validation'

const validEvent = {
  name: 'FNM Standard',
  location: 'Card Kingdom, Seattle',
  formatId: 1,
  startTime: '2026-08-21T18:00:00.000Z',
  capacity: 16,
}

describe('createEventSchema', () => {
  it('accepts a valid event', () => {
    expect(createEventSchema.parse(validEvent)).toMatchObject(validEvent)
  })

  it('rejects capacity over the app ceiling of 30', () => {
    expect(createEventSchema.safeParse({ ...validEvent, capacity: 31 }).success).toBe(false)
  })

  it('rejects capacity below 1, non-integers, non-numbers', () => {
    for (const capacity of [0, -1, 2.5, 'ten']) {
      expect(createEventSchema.safeParse({ ...validEvent, capacity }).success).toBe(false)
    }
  })

  it('rejects blank or whitespace-only name/location', () => {
    expect(createEventSchema.safeParse({ ...validEvent, name: '   ' }).success).toBe(false)
    expect(createEventSchema.safeParse({ ...validEvent, location: '' }).success).toBe(false)
  })

  it('rejects malformed startTime', () => {
    for (const startTime of ['tomorrow', '2026-13-40T99:00:00Z', '']) {
      expect(createEventSchema.safeParse({ ...validEvent, startTime }).success).toBe(false)
    }
  })

  it('rejects unknown-type formatId', () => {
    expect(createEventSchema.safeParse({ ...validEvent, formatId: 'mtg' }).success).toBe(false)
  })
})

describe('createEventSchemaFor (BE-12/FE-5: shared capacity floor)', () => {
  it('applies the format minPlayers as the capacity floor with a shared message', async () => {
    const { createEventSchemaFor } = await import('./validation')
    const schema = createEventSchemaFor(6)
    expect(schema.safeParse({ ...validEvent, capacity: 5 }).success).toBe(false)
    expect(schema.safeParse({ ...validEvent, capacity: 6 }).success).toBe(true)
    const failure = schema.safeParse({ ...validEvent, capacity: 5 })
    if (!failure.success) {
      expect(failure.error.issues[0].message).toContain('at least 6')
    }
  })
})

describe('startTime year bounds (BE-7)', () => {
  it('rejects years outside 2000–9000 (RFC 5545 DATE-TIME safety)', () => {
    for (const startTime of ['0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.000Z']) {
      expect(createEventSchema.safeParse({ ...validEvent, startTime }).success).toBe(false)
    }
  })
})

describe('registrationSchema', () => {
  it('accepts a simple name and trims it', () => {
    expect(registrationSchema.parse({ playerName: '  Jace Beleren ' })).toEqual({
      playerName: 'Jace Beleren',
    })
  })

  it('collapses inner whitespace so spacing variants are one identity (BE-15)', () => {
    expect(registrationSchema.parse({ playerName: 'Jace \n  Beleren' })).toEqual({
      playerName: 'Jace Beleren',
    })
  })

  it('rejects blank/whitespace-only names', () => {
    expect(registrationSchema.safeParse({ playerName: '   ' }).success).toBe(false)
    expect(registrationSchema.safeParse({ playerName: '' }).success).toBe(false)
  })

  it('rejects names over 60 chars', () => {
    expect(registrationSchema.safeParse({ playerName: 'x'.repeat(61) }).success).toBe(false)
  })
})
