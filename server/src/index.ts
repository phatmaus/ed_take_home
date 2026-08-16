import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApp } from './app'
import { openDb } from './db'

const ctx = openDb()
const app = createApp(ctx)

// Production/docker mode: serve the built client from the same origin, which also
// makes the QR registration URL (built from the request Host) inherently correct.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next()
      return
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`server listening on :${port}`)
})
