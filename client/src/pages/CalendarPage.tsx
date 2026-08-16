import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import { api, durationNote, durationRange, type EventDto } from '../api'

export default function CalendarPage() {
  const [events, setEvents] = useState<EventDto[]>([])
  const [loadError, setLoadError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api<EventDto[]>('/api/events')
      .then(setEvents)
      .catch(() => setLoadError(true))
  }, [])

  return (
    <div data-testid="calendar-root">
      {loadError && (
        <div data-testid="calendar-load-error" role="alert" style={{ color: '#b10e1c' }}>
          Could not load events — is the server running?
        </div>
      )}
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        height="auto"
        events={events.map((e) => ({
          id: String(e.id),
          title: e.name,
          start: e.startTime,
          end: e.endTime,
          extendedProps: { event: e },
        }))}
        eventClick={(info) => navigate(`/events/${info.event.id}`)}
        eventContent={(arg) => {
          const e = arg.event.extendedProps.event as EventDto
          return (
            <div
              data-testid={`calendar-event-${e.id}`}
              style={{ cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
              title={`${e.name} — ${durationNote(e)}`}
            >
              {arg.timeText} {e.name} · {durationRange(e)}
            </div>
          )
        }}
      />
    </div>
  )
}
