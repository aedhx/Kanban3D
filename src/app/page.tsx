import { redirect } from 'next/navigation'
import { listCards } from '@/db/queries'
import { isAuthenticated } from '@/lib/auth'
import { toBoardCard } from '@/lib/board'
import { Board } from '@/components/Board'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!(await isAuthenticated())) redirect('/login')

  // Le tableau est rendu côté serveur avec ses cartes : pas d'écran de
  // chargement au premier affichage.
  const rows = await listCards()

  return <Board initialCards={rows.map(toBoardCard)} />
}
