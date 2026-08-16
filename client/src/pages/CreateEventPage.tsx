import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Select } from '@fluentui/react-components'
import { createEventSchema, createEventSchemaFor } from 'shared'
import { api, type EventDto, type Format, type GameSystem } from '../api'

export default function CreateEventPage() {
  const navigate = useNavigate()
  const [gameSystems, setGameSystems] = useState<GameSystem[]>([])
  const [formats, setFormats] = useState<Format[]>([])
  const [gameSystemId, setGameSystemId] = useState('')
  const [formatId, setFormatId] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [startLocal, setStartLocal] = useState('')
  const [capacity, setCapacity] = useState('8')
  const [error, setError] = useState('')

  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    api<GameSystem[]>('/api/game-systems')
      .then(setGameSystems)
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => {
    setFormatId('')
    if (!gameSystemId) {
      setFormats([])
      return
    }
    // Staleness guard: a slow response for a previously selected game must not
    // overwrite the list for the currently selected one.
    let stale = false
    api<Format[]>(`/api/formats?gameSystemId=${gameSystemId}`)
      .then((f) => {
        if (!stale) setFormats(f)
      })
      .catch(() => {
        if (!stale) setLoadError(true)
      })
    return () => {
      stale = true
    }
  }, [gameSystemId])

  const selectedFormat = useMemo(
    () => formats.find((f) => String(f.id) === formatId),
    [formats, formatId],
  )

  const submit = async () => {
    setError('')
    // datetime-local reports '' until BOTH date and time are filled — catch it before
    // Zod so the user gets one human sentence, not ISO-8601 jargon.
    if (!startLocal) {
      setError('Please choose a date and start time.')
      return
    }
    const candidate = {
      name,
      location,
      formatId: Number(formatId),
      // datetime-local is naive local time; convert to ISO UTC.
      startTime: startLocal ? new Date(startLocal).toISOString() : '',
      capacity: Number(capacity),
    }
    // Same shared schema the server enforces — incl. the per-format capacity floor.
    const schema = selectedFormat ? createEventSchemaFor(selectedFormat.minPlayers) : createEventSchema
    const parsed = schema.safeParse(candidate)
    if (!parsed.success) {
      // One issue at a time; a single bad field can produce several overlapping issues.
      const issue = parsed.error.issues[0]
      setError(issue.message.toLowerCase().includes(String(issue.path[0]).toLowerCase())
        ? issue.message
        : `${issue.path.join('.')}: ${issue.message}`)
      return
    }
    try {
      const created = await api<EventDto>('/api/events', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      })
      navigate(`/events/${created.id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {loadError && (
        <div data-testid="create-event-load-error" role="alert" style={{ color: '#b10e1c' }}>
          Could not load games/formats — is the server running?
        </div>
      )}
      <Field label="Game">
        <Select
          data-testid="create-event-game"
          value={gameSystemId}
          onChange={(_, d) => setGameSystemId(d.value)}
        >
          <option value="">Select a game…</option>
          {gameSystems.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Format">
        <Select
          data-testid="create-event-format"
          value={formatId}
          onChange={(_, d) => setFormatId(d.value)}
          disabled={!gameSystemId}
        >
          <option value="">Select a format…</option>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} (min {f.minPlayers} players)
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Event name">
        <Input data-testid="create-event-name" value={name} onChange={(_, d) => setName(d.value)} />
      </Field>
      <Field label="Location">
        <Input
          data-testid="create-event-location"
          value={location}
          onChange={(_, d) => setLocation(d.value)}
        />
      </Field>
      <Field label="Date & start time">
        <Input
          data-testid="create-event-start"
          type="datetime-local"
          value={startLocal}
          onChange={(_, d) => setStartLocal(d.value)}
        />
      </Field>
      <Field
        label={`Player capacity (max 30${selectedFormat ? `, min ${selectedFormat.minPlayers}` : ''})`}
      >
        <Input
          data-testid="create-event-capacity"
          type="number"
          value={capacity}
          onChange={(_, d) => setCapacity(d.value)}
        />
      </Field>
      {error && (
        <div data-testid="create-event-error" role="alert" style={{ color: '#b10e1c' }}>
          {error}
        </div>
      )}
      <Button appearance="primary" data-testid="create-event-submit" onClick={submit}>
        Create event
      </Button>
    </div>
  )
}
