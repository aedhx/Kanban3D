'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LoginForm() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Code incorrect.')
        setPin('')
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('Connexion impossible. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-2xl border border-line bg-surface p-7 shadow-sm"
      >
        <h1 className="text-xl font-semibold tracking-tight">Kanban3D</h1>
        <p className="mt-1 mb-6 text-sm text-muted">
          Entrez le code partagé pour ouvrir le tableau.
        </p>

        <label htmlFor="pin" className="sr-only">
          Code d’accès
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••••"
          // Déjà à 18 px : au-dessus du seuil de zoom d'iOS, on garde sa taille.
          data-keep-size=""
          className="w-full rounded-lg border border-line bg-canvas px-4 py-3 text-center text-lg tracking-[0.4em] outline-none focus:border-accent"
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !pin}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-ink transition-opacity disabled:opacity-40"
        >
          {busy ? 'Vérification…' : 'Entrer'}
        </button>
      </form>
    </main>
  )
}
