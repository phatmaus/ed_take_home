import { z } from 'zod'

// App-wide capacity ceiling per the brief ("up to 30 players").
export const MAX_CAPACITY = 30

export const createEventSchema = z.object({
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(200),
  formatId: z.number().int().positive(),
  startTime: z.string().datetime({ message: 'startTime must be an ISO 8601 datetime' }),
  capacity: z.number().int().min(1).max(MAX_CAPACITY),
})

export const registrationSchema = z.object({
  playerName: z.string().trim().min(1).max(60),
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type RegistrationInput = z.infer<typeof registrationSchema>
