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
    // Segment-aware API check on a slash-collapsed path: '//api/x' is an API miss
    // (JSON 404 below), '/apix' is a client route (SPA's own 404 page). HEAD must
    // mirror GET per RFC 9110 — link checkers HEAD the QR/registration URLs.
    const p = req.path.replace(/\/{2,}/g, '/')
    const isApi = p === '/api' || p.startsWith('/api/')
    // Paths with a file extension (stale hashed bundles after a redeploy) must 404,
    // not silently receive index.html — a MIME-blocked module script means a blank page.
    const looksLikeAsset = /\.[a-z0-9]+$/i.test(p)
    if ((req.method !== 'GET' && req.method !== 'HEAD') || isApi || looksLikeAsset) {
      next()
      return
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
  console.log(`serving client from ${clientDist}`)
} else {
  console.log('client/dist not found — API-only mode (use the Vite dev server for the UI)')
}

// Catch-all after the SPA fallback: non-GET or slash-mangled API paths get JSON,
// never Express's HTML "Cannot GET/POST" page.
app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' })
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`server listening on :${port}`)
})
