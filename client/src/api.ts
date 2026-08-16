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
  const body = await res.json()
  if (!res.ok) throw Object.assign(new Error(body.message ?? body.error ?? res.statusText), body)
  return body as T
}

export function durationRange(e: EventDto): string {
  const h = (m: number) => (m % 60 === 0 ? `${m / 60}` : (m / 60).toFixed(1))
  return e.minDurationMinutes === e.maxDurationMinutes
    ? `${h(e.maxDurationMinutes)}h`
    : `${h(e.minDurationMinutes)}–${h(e.maxDurationMinutes)}h`
}
