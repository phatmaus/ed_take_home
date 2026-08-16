import { defineConfig } from '@playwright/test'

// E2E runs against the real dev stack: seeded scratch DB + Express + Vite proxy.
const DB_PATH = process.env.E2E_DB_PATH ?? '/tmp/ed-take-home-e2e.db'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      command: `rm -f ${DB_PATH}* && DB_PATH=${DB_PATH} npm run seed && DB_PATH=${DB_PATH} npm run start -w server`,
      port: 3001,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -w client',
      port: 5173,
      reuseExistingServer: false,
    },
  ],
})
