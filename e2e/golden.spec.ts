import { expect, test } from '@playwright/test'

// Golden path per the brief: create event → see it on calendar → QR/event page →
// register → event fills up. Edge cases live in the unit suite + adversarial review.
// Seed ids (seedData.ts): 1 = Draft Night (1 seat left), 4 = FNM Standard (empty).

test('organizer creates an event and it appears on the calendar', async ({ page }) => {
  await page.goto('/events/new')
  await page.getByTestId('create-event-game').selectOption({ label: 'Magic: The Gathering' })
  await page.getByTestId('create-event-format').selectOption({ label: 'Standard (min 4 players)' })
  await page.getByTestId('create-event-name').fill('E2E Standard Night')
  await page.getByTestId('create-event-location').fill('E2E Test Store')
  const start = new Date()
  start.setDate(start.getDate() + 1)
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
    start.getDate(),
  ).padStart(2, '0')}`
  await page.getByTestId('create-event-date').fill(date)
  await page.getByTestId('create-event-time').fill('19:00')
  await page.getByTestId('create-event-capacity').fill('12')
  await page.getByTestId('create-event-submit').click()

  await expect(page.getByTestId('event-name')).toHaveText('E2E Standard Night')
  await expect(page.getByTestId('event-qr-img')).toBeVisible()

  // The .ics link serves a real calendar file.
  const icsHref = await page.getByTestId('event-ics-link').getAttribute('href')
  const ics = await page.request.get(icsHref!)
  expect(ics.status()).toBe(200)
  expect(await ics.text()).toContain('SUMMARY:E2E Standard Night')

  // Visible on the month grid (event may be next month if today is month-end).
  await page.getByTestId('nav-home').click()
  const cell = page.getByTestId(/calendar-event-\d+/).filter({ hasText: 'E2E Standard Night' })
  // Wait for the async events fetch to paint the grid before deciding which month to look at.
  await page.getByTestId(/calendar-event-\d+/).first().waitFor()
  try {
    await expect(cell.first()).toBeVisible({ timeout: 2_000 })
  } catch {
    await page.locator('.fc-next-button').click()
    await expect(cell.first()).toBeVisible()
  }
})

test('player registers via the QR link; the event fills up and rejects the next player', async ({
  page,
}) => {
  // Draft Night is seeded with exactly one seat left.
  await page.goto('/events/1/register')
  await page.getByTestId('register-name').fill('Last Seat Larry')
  await page.getByTestId('register-submit').click()
  await expect(page.getByTestId('register-success')).toBeVisible()

  // Next player hits the server-enforced capacity wall with the distinct full error.
  await page.goto('/events/1/register')
  await expect(page.getByTestId('register-spots')).toHaveText('This event is full.')
  await page.getByTestId('register-name').fill('Too Late Tina')
  await page.getByTestId('register-submit').click()
  await expect(page.getByTestId('register-error-full')).toBeVisible()
})
