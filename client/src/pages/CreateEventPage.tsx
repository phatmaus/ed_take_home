import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Select } from '@fluentui/react-components'
import { createEventSchema } from 'shared'
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

  useEffect(() => {
    api<GameSystem[]>('/api/game-systems').then(setGameSystems).catch(console.error)
  }, [])

  useEffect(() => {
    setFormatId('')
    if (!gameSystemId) {
      setFormats([])
      return
    }
    api<Format[]>(`/api/formats?gameSystemId=${gameSystemId}`).then(setFormats).catch(console.error)
  }, [gameSystemId])

  const selectedFormat = useMemo(
    () => formats.find((f) => String(f.id) === formatId),
    [formats, formatId],
  )

  const submit = async () => {
    setError('')
    const candidate = {
      name,
      location,
      formatId: Number(formatId),
      // datetime-local is naive local time; convert to ISO UTC.
      startTime: startLocal ? new Date(startLocal).toISOString() : '',
      capacity: Number(capacity),
    }
    const parsed = createEventSchema.safeParse(candidate)
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
      return
    }
    if (selectedFormat && parsed.data.capacity < selectedFormat.minPlayers) {
      setError(`${selectedFormat.name} needs at least ${selectedFormat.minPlayers} players`)
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
