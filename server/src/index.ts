import { createApp } from './app'
import { openDb } from './db'

const ctx = openDb()
const app = createApp(ctx)

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`server listening on :${port}`)
})
