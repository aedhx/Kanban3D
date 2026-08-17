import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { printer } from '@/db/schema'
import { printerToView } from '@/lib/printerView'
import { listCards } from '@/db/queries'
import { isAuthenticated } from '@/lib/auth'
import { toBoardCard } from '@/lib/board'
import { filamentPricePerKg } from '@/lib/settings'
import { Board } from '@/components/Board'
import { SetupNeeded } from '@/components/SetupNeeded'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!(await isAuthenticated())) redirect('/login')

  // Le tableau est rendu côté serveur avec ses cartes : pas d'écran de
  // chargement au premier affichage.
  let rows
  try {
    rows = await listCards()
  } catch (error) {
    // Une base absente ou vide est une erreur de configuration, pas une panne :
    // laisser Next afficher son « Application error » obligerait à aller lire
    // les journaux du serveur pour quelque chose qui se corrige en un clic.
    console.error('[tableau] chargement impossible :', error)
    return <SetupNeeded error={error} />
  }

  /*
   * L'état de l'imprimante part avec le premier rendu : le bandeau est alors
   * peuplé d'emblée, sans le clignotement d'un chargement. Il se rafraîchira
   * ensuite de lui-même.
   */
  const [machine] = await getDb().select().from(printer).where(eq(printer.id, 1))

  // Le prix du filament est une variable d'environnement : elle n'existe que
  // côté serveur, d'où ce passage explicite au composant client.
  return (
    <Board
      initialCards={rows.map(toBoardCard)}
      filamentPricePerKg={filamentPricePerKg()}
      printer={machine ? printerToView(machine) : null}
    />
  )
}
