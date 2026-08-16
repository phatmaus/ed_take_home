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

describe('registrationSchema', () => {
  it('accepts a simple name and trims it', () => {
    expect(registrationSchema.parse({ playerName: '  Jace Beleren ' })).toEqual({
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
