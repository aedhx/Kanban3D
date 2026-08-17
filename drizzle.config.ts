import { defineConfig } from 'drizzle-kit'

// drizzle-kit tourne hors du bundle Next : pas d'alias « @ » ici, on relit donc
// les mêmes variables que src/lib/databaseUrl.ts, dans le même ordre.
const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.NETLIFY_DB_URL?.trim() ||
  process.env.NETLIFY_DATABASE_URL?.trim() ||
  ''

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
})
