'use client'

import { useCallback, useEffect, useState } from 'react'
import { IDENTITY_STORAGE_KEY, PEOPLE, type Person } from './people'

/**
 * Qui utilise cet appareil. Stocké en localStorage, donc le choix se fait une
 * seule fois. `null` tant qu'on ne sait pas encore (rendu serveur, ou premier
 * lancement) — le tableau affiche alors l'écran de choix.
 */
export function useIdentity() {
  const [identity, setIdentity] = useState<Person | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(IDENTITY_STORAGE_KEY)
      if (stored && (PEOPLE as readonly string[]).includes(stored)) {
        setIdentity(stored as Person)
      }
    } catch {
      // localStorage indisponible (navigation privée stricte) : on redemandera.
    }
    setLoaded(true)
  }, [])

  const choose = useCallback((person: Person) => {
    setIdentity(person)
    try {
      window.localStorage.setItem(IDENTITY_STORAGE_KEY, person)
    } catch {
      // Tant pis, le choix ne sera pas mémorisé.
    }
  }, [])

  return { identity, choose, loaded }
}
