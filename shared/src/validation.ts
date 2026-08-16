import { z } from 'zod'

// App-wide capacity ceiling per the brief ("up to 30 players").
export const MAX_CAPACITY = 30

// Wall-clock time at the event's location ('YYYY-MM-DDTHH:mm'); the server converts
// to UTC using the location's IANA time zone. No 'Z'/offset — the location decides.
const startTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
    'startTime must be local wall-clock time, YYYY-MM-DDTHH:mm',
  )
  .refine((s) => !Number.isNaN(Date.parse(s + (s.length === 16 ? ':00Z' : 'Z'))), 'startTime is not a real date/time')
  // RFC 5545 DATE-TIME needs a 4-digit year, and derived end times must not overflow it.
  .refine((s) => {
    const year = Number(s.slice(0, 4))
    return year >= 2000 && year <= 9000
  }, 'please double-check the year on the start date (must be 2000–9000)')

export const createEventSchema = z.object({
  name: z.string().trim().min(1, 'please enter an event name').max(100, 'event name is too long (max 100 characters)'),
  locationId: z
    .number({ invalid_type_error: 'please select a location' })
    .int()
    .positive('please select a location'),
  formatId: z
    .number({ invalid_type_error: 'please select a game and format' })
    .int()
    .positive('please select a game and format'),
  startTime: startTimeSchema,
  capacity: z.number({ invalid_type_error: 'capacity must be a number' }).int().min(1).max(MAX_CAPACITY, `capacity can be at most ${MAX_CAPACITY} players`),
})

// The real capacity floor is per-format data; both the React form and the API build
// the same schema from the format's minPlayers so message and rule have one source.
export function createEventSchemaFor(minPlayers: number) {
  return createEventSchema.extend({
    capacity: z
      .number()
      .int()
      .min(minPlayers, `this format needs at least ${minPlayers} players`)
      .max(MAX_CAPACITY),
  })
}

export const registrationSchema = z.object({
  // Trim + collapse inner whitespace so spacing variants map to one identity;
  // case-insensitivity is enforced by the DB collation on the unique index.
  playerName: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .transform((s) => s.replace(/\s+/g, ' ')),
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type RegistrationInput = z.infer<typeof registrationSchema>
