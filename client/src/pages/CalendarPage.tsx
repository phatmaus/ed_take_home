import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import { api, durationRange, type EventDto } from '../api'

export default function CalendarPage() {
  const [events, setEvents] = useState<EventDto[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    api<EventDto[]>('/api/events').then(setEvents).catch(console.error)
  }, [])

  return (
    <div data-testid="calendar-root">
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
              title={`${e.name} — runs ${durationRange(e)} depending on attendance`}
            >
              {arg.timeText} {e.name} · {durationRange(e)}
            </div>
          )
        }}
      />
    </div>
  )
}
