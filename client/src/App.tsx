import { Link, Route, Routes } from 'react-router-dom'
import { Button, Title2 } from '@fluentui/react-components'
import CalendarPage from './pages/CalendarPage'
import CreateEventPage from './pages/CreateEventPage'
import EventPage from './pages/EventPage'
import RegisterPage from './pages/RegisterPage'

function App() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="nav-home">
          <Title2>TCG Event Calendar</Title2>
        </Link>
        <Link to="/events/new">
          <Button appearance="primary" data-testid="nav-create-event">
            Create event
          </Button>
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<CalendarPage />} />
        <Route path="/events/new" element={<CreateEventPage />} />
        <Route path="/events/:id" element={<EventPage />} />
        <Route path="/events/:id/register" element={<RegisterPage />} />
        <Route path="*" element={<div data-testid="page-not-found">Page not found.</div>} />
      </Routes>
    </div>
  )
}

export default App
