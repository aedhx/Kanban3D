'use client'

import { useEffect, useRef, useState } from 'react'
import type { ModelMetadata } from '@/lib/metadata'
import { Thumbnail } from './Thumbnail'

export type NewCardInput = {
  url: string | null
  title: string
  imageUrl: string | null
  author: string | null
  source: string | null
  quantity: number
  color: string | null
  notes: string | null
}

const COMMON_COLORS = ['Noir', 'Blanc', 'Gris', 'Rouge', 'Orange', 'Jaune', 'Vert', 'Bleu']

export function AddCardForm({ onCreate }: { onCreate: (input: NewCardInput) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [color, setColor] = useState('')
  const [notes, setNotes] = useState('')

  const [preview, setPreview] = useState<ModelMetadata | null>(null)
  const [looking, setLooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Le titre est pré-rempli depuis l'URL, mais on cesse de l'écraser dès que
  // l'utilisateur l'a modifié lui-même.
  const titleTouched = useRef(false)
  const requestId = useRef(0)

  useEffect(() => {
    const trimmed = url.trim()
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
      setPreview(null)
      return
    }

    const id = ++requestId.current
    const timer = setTimeout(async () => {
      setLooking(true)
      try {
        const res = await fetch('/api/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        })
        if (!res.ok) throw new Error('lookup failed')
        const data = (await res.json()) as ModelMetadata

        // Une frappe plus récente a relancé une recherche : on ignore ce résultat.
        if (id !== requestId.current) return

        setPreview(data)
        if (!titleTouched.current) setTitle(data.title)
      } catch {
        if (id === requestId.current) setPreview(null)
      } finally {
        if (id === requestId.current) setLooking(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [url])

  function reset() {
    setUrl('')
    setTitle('')
    setQuantity(1)
    setColor('')
    setNotes('')
    setPreview(null)
    setError(null)
    titleTouched.current = false
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return

    const finalTitle = title.trim() || preview?.title?.trim() || ''
    if (!finalTitle) {
      setError('Donnez un titre, ou collez une URL de modèle.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onCreate({
        url: url.trim() || null,
        title: finalTitle,
        imageUrl: preview?.imageUrl ?? null,
        author: preview?.author ?? null,
        source: preview?.source ?? null,
        quantity,
        color: color.trim() || null,
        notes: notes.trim() || null,
      })
      reset()
      setOpen(false)
    } catch {
      setError("L'ajout a échoué. Réessayez.")
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-line bg-surface/60 px-4 py-3 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        + Demander une impression
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-line bg-surface p-4 shadow-sm"
    >
      <label htmlFor="url" className="mb-1 block text-xs font-medium text-muted">
        Lien du modèle (Printables, MakerWorld, Thingiverse, Cults3D…)
      </label>
      <input
        id="url"
        type="url"
        inputMode="url"
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.printables.com/model/…"
        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {looking && <p className="mt-2 text-xs text-muted">Recherche des informations…</p>}

      {preview && !looking && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-canvas p-2">
          {preview.imageUrl ? (
            <Thumbnail
              src={preview.imageUrl}
              size={128}
              className="h-12 w-12 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-line text-lg">
              🧩
            </div>
          )}
          <div className="min-w-0 text-xs">
            <p className="truncate font-medium text-ink">{preview.title}</p>
            <p className="truncate text-muted">
              {preview.resolved
                ? [preview.author, preview.source].filter(Boolean).join(' · ') || 'Trouvé'
                : 'Informations non trouvées — complétez à la main'}
            </p>
          </div>
        </div>
      )}

      <label htmlFor="title" className="mt-4 mb-1 block text-xs font-medium text-muted">
        Titre
      </label>
      <input
        id="title"
        value={title}
        onChange={(e) => {
          titleTouched.current = true
          setTitle(e.target.value)
        }}
        placeholder="Ce que vous voulez faire imprimer"
        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <div className="mt-3 flex gap-3">
        <div className="w-24">
          <label htmlFor="quantity" className="mb-1 block text-xs font-medium text-muted">
            Quantité
          </label>
          <input
            id="quantity"
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="color" className="mb-1 block text-xs font-medium text-muted">
            Couleur
          </label>
          <input
            id="color"
            list="couleurs-courantes"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="Peu importe"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <datalist id="couleurs-courantes">
            {COMMON_COLORS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <label htmlFor="notes" className="mt-3 mb-1 block text-xs font-medium text-muted">
        Remarque
      </label>
      <textarea
        id="notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Taille, usage, délai…"
        className="w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? 'Ajout…' : 'Ajouter au tableau'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
