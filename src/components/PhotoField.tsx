'use client'

import { useRef, useState } from 'react'
import { photoUrl, preparePhoto } from '@/lib/photo'
import { IconDelete, IconPhoto } from './icons'

type Props = {
  cardId: string
  /** Date de la photo actuelle, ou `null` s'il n'y en a pas. */
  photoAt: string | null
  /** Remonte la nouvelle date au tableau, pour rafraîchir la vignette. */
  onChange: (photoAt: string | null) => void
}

/**
 * La photo de ce qui est sorti de l'imprimante.
 *
 * C'est la seule pièce du cycle que le tableau ne montrait pas : « Fait » disait
 * que c'était imprimé, sans dire ce que ça donnait. Sur téléphone, `capture`
 * ouvre directement l'appareil photo — le geste est donc : la pièce dans la main,
 * deux touches, c'est envoyé.
 */
export function PhotoField({ cardId, photoAt, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function envoyer(file: File) {
    setError(null)
    setBusy(true)
    try {
      const { blob } = await preparePhoto(file)
      const res = await fetch(`/api/cards/${cardId}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      })
      if (!res.ok) {
        const { error: message } = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(message ?? 'envoi refusé')
      }
      const { photoAt: date } = (await res.json()) as { photoAt: string }
      onChange(date)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La photo n'a pas pu être envoyée.")
    } finally {
      setBusy(false)
      // Permet de rechoisir le même fichier après une erreur.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function supprimer() {
    setBusy(true)
    try {
      const res = await fetch(`/api/cards/${cardId}/photo`, { method: 'DELETE' })
      if (!res.ok) throw new Error('suppression refusée')
      onChange(null)
    } catch {
      setError("La photo n'a pas pu être supprimée.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-4">
      <p className="mb-1.5 text-xs font-medium text-muted">Photo du résultat</p>

      {photoAt && (
        /*
         * Image servie par notre propre route, derrière le cookie de session :
         * next/image la ferait passer par son optimiseur, qui n'a pas ce cookie.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl(cardId, photoAt)}
          alt="Photo de l’impression terminée"
          className="mb-2 max-h-56 w-full rounded-lg border border-line object-cover"
        />
      )}

      <div className="flex items-center gap-2">
        <label
          className={[
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm transition-colors',
            busy ? 'text-muted opacity-60' : 'cursor-pointer text-muted hover:border-accent',
          ].join(' ')}
        >
          <IconPhoto size={15} aria-hidden />
          {busy ? 'Envoi…' : photoAt ? 'Remplacer la photo' : 'Ajouter une photo'}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            // Ouvre l'appareil photo arrière sur mobile, un sélecteur de fichier
            // ailleurs — les navigateurs de bureau ignorent l'attribut.
            capture="environment"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void envoyer(file)
            }}
            className="hidden"
          />
        </label>

        {photoAt && (
          <button
            type="button"
            onClick={supprimer}
            disabled={busy}
            aria-label="Supprimer la photo"
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-40"
          >
            <IconDelete size={15} aria-hidden />
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
