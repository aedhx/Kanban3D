'use client'

import { useRef, useState } from 'react'
import { IconAdd } from './icons'

/**
 * Ajouter une demande, réduit au strict minimum : on colle le lien, la carte
 * apparaît dans « À imprimer ». Le serveur va chercher titre, image et auteur ;
 * quantité, couleur et remarque se règlent ensuite dans le panneau latéral, si
 * besoin — le plus souvent il n'y en a pas.
 *
 * Un texte qui n'est pas un lien devient le titre de la carte : pratique pour
 * une demande sans modèle en ligne (« refaire le support de casque »).
 */
export function AddUrlBar({
  onAdd,
}: {
  /** Reçoit soit des URLs, soit un titre libre. */
  onAdd: (entries: { urls: string[] } | { title: string }) => void
}) {
  const [value, setValue] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /** Repère les liens dans un texte collé, qui peut en contenir plusieurs. */
  function extractUrls(text: string): string[] {
    return text
      .split(/\s+/)
      .map((token) => token.trim().replace(/[),.;]+$/, ''))
      .filter((token) => /^https?:\/\/\S+$/i.test(token))
  }

  function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    const urls = extractUrls(trimmed)
    if (urls.length > 0) {
      onAdd({ urls })
      setHint(urls.length > 1 ? `${urls.length} liens ajoutés` : null)
    } else {
      onAdd({ title: trimmed.slice(0, 300) })
      setHint(null)
    }

    setValue('')
    inputRef.current?.focus()
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(value)
        }}
        className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-sm focus-within:border-accent"
      >
        <IconAdd size={18} className="shrink-0 text-muted" aria-hidden />
        <label htmlFor="add-url" className="sr-only">
          Lien du modèle à imprimer
        </label>
        <input
          id="add-url"
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setHint(null)
          }}
          // Le collage crée la carte sans autre geste : c'est tout l'intérêt.
          // On lit le presse-papiers directement, la valeur du champ n'étant pas
          // encore à jour à ce stade.
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text')
            if (extractUrls(pasted).length > 0) {
              event.preventDefault()
              submit(pasted)
            }
          }}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          // Court exprès : sur un écran de téléphone, une phrase plus longue se
          // fait couper en plein milieu. Les plateformes sont nommées juste
          // en dessous, où la place ne manque pas.
          placeholder="Collez le lien d’un modèle 3D"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted"
        />
        {value.trim() && (
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink"
          >
            Ajouter
          </button>
        )}
      </form>

      <p className="mt-1.5 px-1 text-xs text-muted" aria-live="polite">
        {hint ?? 'Printables, MakerWorld, Thingiverse, Thangs, Cults3D… ou un texte libre.'}
      </p>
    </div>
  )
}
