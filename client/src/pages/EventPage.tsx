import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Title3 } from '@fluentui/react-components'
import { api, durationRange, type EventDto } from '../api'

export default function EventPage() {
  const { id } = useParams()
  const [event, setEvent] = useState<EventDto | null>(null)
  const [qr, setQr] = useState<{ registrationUrl: string; qrDataUrl: string } | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    api<EventDto>(`/api/events/${id}`)
      .then(setEvent)
      .catch(() => setNotFound(true))
    api<{ registrationUrl: string; qrDataUrl: string }>(`/api/events/${id}/qr`)
      .then(setQr)
      .catch(() => {})
  }, [id])

  if (notFound) return <div data-testid="event-not-found">Event not found.</div>
  if (!event) return <div>Loading…</div>

  const start = new Date(event.startTime)
  return (
    <div data-testid="event-page" style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Title3 data-testid="event-name">{event.name}</Title3>
        <div data-testid="event-game">
          {event.gameSystemName} — {event.formatName}
        </div>
        <div data-testid="event-when">
          {start.toLocaleString()} · runs {durationRange(event)} depending on attendance
        </div>
        <div data-testid="event-location">{event.location}</div>
        <div>
          <Badge
            data-testid="event-spots"
            color={event.spotsLeft === 0 ? 'danger' : 'brand'}
          >
            {event.spotsLeft === 0
              ? 'Event full'
              : `${event.spotsLeft} of ${event.capacity} spots left`}
          </Badge>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <a href={`/api/events/${event.id}/invite.ics`} data-testid="event-ics-link">
            <Button>Add to calendar (.ics)</Button>
          </a>
          <Link to={`/events/${event.id}/register`}>
            <Button appearance="primary" data-testid="event-register-link">
              Register
            </Button>
          </Link>
        </div>
      </div>
      {qr && (
        <figure style={{ margin: 0, textAlign: 'center' }}>
          <img
            src={qr.qrDataUrl}
            alt="Registration QR code"
            data-testid="event-qr-img"
            width={180}
            height={180}
          />
          <figcaption style={{ fontSize: 12, maxWidth: 200, overflowWrap: 'anywhere' }}>
            Scan to register · <span data-testid="event-qr-url">{qr.registrationUrl}</span>
          </figcaption>
        </figure>
      )}
    </div>
  )
}
