import { z } from 'zod'

// App-wide capacity ceiling per the brief ("up to 30 players").
export const MAX_CAPACITY = 30

const startTimeSchema = z
  .string()
  .datetime({ message: 'startTime must be an ISO 8601 datetime' })
  // RFC 5545 DATE-TIME needs a 4-digit year, and derived end times must not overflow it.
  .refine((s) => {
    const year = new Date(s).getUTCFullYear()
    return year >= 2000 && year <= 9000
  }, 'startTime year must be between 2000 and 9000')

export const createEventSchema = z.object({
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(200),
  formatId: z.number().int().positive(),
  startTime: startTimeSchema,
  capacity: z.number().int().min(1).max(MAX_CAPACITY),
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
