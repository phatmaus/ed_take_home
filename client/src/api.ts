export interface GameSystem {
  id: number
  name: string
}

export interface Format {
  id: number
  gameSystemId: number
  name: string
  minPlayers: number
  scheduleId: number
}

export interface EventDto {
  id: number
  name: string
  location: string
  formatId: number
  startTime: string
  capacity: number
  formatName: string
  gameSystemName: string
  minPlayers: number
  registeredCount: number
  spotsLeft: number
  minDurationMinutes: number
  maxDurationMinutes: number
  endTime: string
}

export interface ApiError {
  error: string
  message?: string
  details?: unknown
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  let body: { error?: string; message?: string } | null = null
  try {
    body = await res.json()
  } catch {
    // Non-JSON response (proxy error page, HTML 500) — fall through to generic error.
  }
  if (!res.ok) {
    const message =
      body?.message ??
      (body?.error === 'VALIDATION' ? 'Some fields are invalid.' : undefined) ??
      `Request failed (${res.status})`
    throw Object.assign(new Error(message), body ?? { error: `HTTP_${res.status}` })
  }
  return body as T
}

const fmtHours = (m: number) =>
  m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`

export function durationRange(e: EventDto): string {
  return e.minDurationMinutes === e.maxDurationMinutes
    ? `~${fmtHours(e.maxDurationMinutes)}`
    : `${fmtHours(e.minDurationMinutes)}–${fmtHours(e.maxDurationMinutes)}`
}

export function durationNote(e: EventDto): string {
  return e.minDurationMinutes === e.maxDurationMinutes
    ? `runs ${durationRange(e)}`
    : `runs ${durationRange(e)} depending on attendance`
}
