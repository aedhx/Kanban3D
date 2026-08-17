import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>

// Le client est mis en cache sur globalThis : en développement pour survivre au
// rechargement à chaud, en production pour être réutilisé entre deux invocations
// d'une même fonction Netlify restée chaude.
const globalForDb = globalThis as unknown as {
  __kanban3dClient?: ReturnType<typeof postgres>
  __kanban3dDb?: Db
}

/**
 * Connexion à la base. Volontairement paresseuse : `DATABASE_URL` n'existe pas
 * au moment du `next build`, seulement à l'exécution.
 */
export function getDb(): Db {
  if (globalForDb.__kanban3dDb) return globalForDb.__kanban3dDb

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL n'est pas définie. Copiez .env.example vers .env.local et renseignez-la.",
    )
  }

  const client =
    globalForDb.__kanban3dClient ??
    postgres(url, {
      // Une seule connexion par instance de fonction : en serverless, chaque
      // invocation est isolée et Neon limite le nombre de connexions.
      max: 1,
      // Neon passe par un pooler qui ne gère pas les requêtes préparées.
      prepare: false,
    })

  const db = drizzle(client, { schema })
  globalForDb.__kanban3dClient = client
  globalForDb.__kanban3dDb = db
  return db
}
