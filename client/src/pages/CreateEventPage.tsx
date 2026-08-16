import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Combobox, Field, Input, Option, Select } from '@fluentui/react-components'
import { TimePicker } from '@fluentui/react-timepicker-compat'
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
  const [startDate, setStartDate] = useState('')
  const [startClock, setStartClock] = useState('')
  const [capacity, setCapacity] = useState('8')
  const [error, setError] = useState('')

  const [loadError, setLoadError] = useState(false)
  const [knownLocations, setKnownLocations] = useState<string[]>([])

  useEffect(() => {
    api<GameSystem[]>('/api/game-systems')
      .then(setGameSystems)
      .catch(() => setLoadError(true))
    // Distinct locations already in use, offered as dropdown options (freeform allows new).
    api<{ location: string }[]>('/api/events')
      .then((events) => setKnownLocations([...new Set(events.map((e) => e.location))].sort()))
      .catch(() => {})
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
    // Separate date + time inputs (a single datetime-local's segment editing confused
    // real users — you can't type minutes until every segment to its left is filled).
    if (!startDate || !startClock) {
      setError(!startDate ? 'Please choose a date.' : 'Please choose a start time.')
      return
    }
    const candidate = {
      name,
      location,
      formatId: Number(formatId),
      // date + time are naive local time; convert to ISO UTC.
      startTime: new Date(`${startDate}T${startClock}`).toISOString(),
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
        <Combobox
          data-testid="create-event-location"
          freeform
          placeholder={knownLocations.length ? 'Select or type a location…' : 'Type a location…'}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onOptionSelect={(_, d) => setLocation(d.optionText ?? '')}
        >
          {knownLocations.map((l) => (
            <Option key={l}>{l}</Option>
          ))}
        </Combobox>
      </Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label="Date" style={{ flex: 1 }}>
          <Input
            data-testid="create-event-date"
            type="date"
            value={startDate}
            onChange={(_, d) => setStartDate(d.value)}
          />
        </Field>
        <Field label="Start time" style={{ flex: 1 }}>
          <TimePicker
            data-testid="create-event-time"
            freeform
            hourCycle="h23"
            increment={15}
            startHour={0}
            endHour={24}
            placeholder="Select a time…"
            onTimeChange={(_, data) =>
              setStartClock(
                data.selectedTime
                  ? `${String(data.selectedTime.getHours()).padStart(2, '0')}:${String(
                      data.selectedTime.getMinutes(),
                    ).padStart(2, '0')}`
                  : '',
              )
            }
          />
        </Field>
      </div>
      <Field
        label={`Player capacity (max 30${selectedFormat ? `, min ${selectedFormat.minPlayers}` : ''})`}
      >
        <Input
          data-testid="create-event-capacity"
          type="number"
          min={selectedFormat?.minPlayers ?? 1}
          max={30}
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
