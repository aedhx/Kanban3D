'use client'

import { useEffect, useRef, useState } from 'react'
import type { Person } from '@/lib/people'

/**
 * Le mot d'accueil, juste après le choix du prénom.
 *
 * Chacun a le sien : celui qui possède l'imprimante n'a pas la même chose à
 * entendre que celui qui demande. C'est le seul moment de l'application où elle
 * se permet de parler.
 */
const MESSAGES: Record<Person, string> = {
  Alexandre: 'Bonjour Alexandre, fais chauffer ton imprimante.',
  Antoine: 'Bonjour Antoine, qu’est-ce qu’on imprime aujourd’hui ?',
}

/** Millisecondes par caractère, et temps de lecture une fois la phrase écrite. */
const CADENCE_MS = 42
const LECTURE_MS = 1600

export function Greeting({ person, onDone }: { person: Person; onDone: () => void }) {
  const message = MESSAGES[person]
  const [écrit, setÉcrit] = useState('')
  const [fini, setFini] = useState(false)
  // `onDone` dans une ref : la fermeture ne doit pas relancer la frappe si le
  // parent se rend à nouveau pendant l'animation.
  const terminer = useRef(onDone)
  terminer.current = onDone

  useEffect(() => {
    // Respecte le réglage système : sans animation, la phrase s'affiche d'un coup.
    const sobre = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Array.from, et non un découpage par index : « qu’est-ce » contient une
    // apostrophe typographique, et les accents composés se casseraient.
    const lettres = Array.from(message)

    if (sobre) {
      setÉcrit(message)
      setFini(true)
      const sortie = window.setTimeout(() => terminer.current(), LECTURE_MS)
      return () => window.clearTimeout(sortie)
    }

    let index = 0
    const frappe = window.setInterval(() => {
      index += 1
      setÉcrit(lettres.slice(0, index).join(''))
      if (index >= lettres.length) {
        window.clearInterval(frappe)
        setFini(true)
      }
    }, CADENCE_MS)

    return () => window.clearInterval(frappe)
  }, [message])

  // La phrase écrite laisse un temps de lecture, puis l'écran s'effface.
  useEffect(() => {
    if (!fini) return
    const sortie = window.setTimeout(() => terminer.current(), LECTURE_MS)
    return () => window.clearTimeout(sortie)
  }, [fini])

  // On peut toujours couper court : un appui, une touche, et le tableau s'ouvre.
  useEffect(() => {
    const passer = () => terminer.current()
    window.addEventListener('keydown', passer)
    return () => window.removeEventListener('keydown', passer)
  }, [])

  return (
    <main
      onClick={() => terminer.current()}
      data-testid="greeting"
      className="flex min-h-dvh cursor-pointer items-center justify-center p-8"
      /* Le texte est lu d'un coup par un lecteur d'écran, plutôt que lettre à
         lettre au fil de la frappe. */
      role="status"
      aria-label={message}
    >
      {/*
        Le texte complet est posé en fantôme, invisible, dans la même cellule de
        grille que le texte qui s'écrit : le bloc a donc d'emblée sa largeur et sa
        hauteur définitives. Sans lui, la phrase se recentrerait à chaque lettre
        — elle glisserait sous l'œil, et sauterait d'une ligne au moment du
        passage à la ligne sur téléphone.
      */}
      <p
        aria-hidden="true"
        className="grid max-w-2xl text-2xl leading-snug font-medium sm:text-3xl"
      >
        <span className="invisible col-start-1 row-start-1">{message}</span>
        <span className="col-start-1 row-start-1">
          {écrit}
          {/* Le curseur clignote une fois la phrase écrite, et reste fixe pendant
              la frappe — c'est ce que fait un vrai curseur de saisie. */}
          <span
            className={`ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.14em] bg-accent ${
              fini ? 'animate-pulse' : ''
            }`}
          />
        </span>
      </p>
    </main>
  )
}
