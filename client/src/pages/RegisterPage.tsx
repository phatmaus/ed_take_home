import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Field, Input, Title3 } from '@fluentui/react-components'
import { registrationSchema } from 'shared'
import { api, type ApiError, type EventDto } from '../api'

export default function RegisterPage() {
  const { id } = useParams()
  const [event, setEvent] = useState<EventDto | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)

  const refresh = () => api<EventDto>(`/api/events/${id}`).then(setEvent).catch(() => {})
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const submit = async () => {
    setError(null)
    const parsed = registrationSchema.safeParse({ playerName })
    if (!parsed.success) {
      setError({ code: 'VALIDATION', message: 'Please enter your name.' })
      return
    }
    try {
      await api(`/api/events/${id}/registrations`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      })
      setDone(true)
      refresh()
    } catch (e) {
      const err = e as ApiError & Error
      setError({ code: err.error ?? 'UNKNOWN', message: err.message })
      refresh()
    }
  }

  if (!event) return <div>Loading…</div>

  if (done) {
    return (
      <div data-testid="register-success">
        <Title3>You're in! 🎉</Title3>
        <p>
          {playerName.trim()} is registered for {event.name}.
        </p>
        <Link to={`/events/${event.id}`} data-testid="register-back-link">
          Back to event
        </Link>
      </div>
    )
  }

  const testIdForError: Record<string, string> = {
    EVENT_FULL: 'register-error-full',
    ALREADY_REGISTERED: 'register-error-duplicate',
    VALIDATION: 'register-error-validation',
  }

  return (
    <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Title3 data-testid="register-title">Register for {event.name}</Title3>
      <div data-testid="register-spots">
        {event.spotsLeft === 0
          ? 'This event is full.'
          : `${event.spotsLeft} of ${event.capacity} spots left`}
      </div>
      <Field label="Your name">
        <Input
          data-testid="register-name"
          value={playerName}
          onChange={(_, d) => setPlayerName(d.value)}
        />
      </Field>
      {error && (
        <div
          data-testid={testIdForError[error.code] ?? 'register-error'}
          role="alert"
          style={{ color: '#b10e1c' }}
        >
          {error.message}
        </div>
      )}
      <Button
        appearance="primary"
        data-testid="register-submit"
        onClick={submit}
        disabled={event.spotsLeft === 0}
      >
        Register
      </Button>
    </div>
  )
}
