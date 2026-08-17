'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Comment } from '@/db/schema'
import { timeAgo } from '@/lib/dates'
import { IconSend } from './icons'

/** Un message tel que le reçoit le navigateur : date sérialisée en chaîne. */
export type ThreadComment = Omit<Comment, 'createdAt'> & { createdAt: string }

/**
 * Les échanges autour d'une demande. C'est ce qui restait sur la messagerie :
 * « quelle taille exactement ? », « plus de vert, du bleu ça ira ? ». Le champ
 * « Remarque » ne pouvait pas jouer ce rôle : il est unique et s'écrase.
 */
export function CommentThread({
  cardId,
  author,
  onCountChange,
}: {
  cardId: string
  author: string
  onCountChange?: (count: number) => void
}) {
  const [comments, setComments] = useState<ThreadComment[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, { cache: 'no-store' })
      if (!res.ok) throw new Error('chargement impossible')
      const data = (await res.json()) as { comments: ThreadComment[] }
      setComments(data.comments)
      setError(null)
    } catch {
      setError('Impossible de charger les messages.')
    } finally {
      setLoading(false)
    }
  }, [cardId])

  useEffect(() => {
    void load()
  }, [load])

  // On garde le dernier message en vue quand le fil s'allonge.
  useEffect(() => {
    if (comments.length) endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [comments.length])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return

    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, author }),
      })
      if (!res.ok) throw new Error('envoi refusé')
      const { comment } = (await res.json()) as { comment: ThreadComment }
      setComments((current) => {
        const next = [...current, comment]
        onCountChange?.(next.length)
        return next
      })
      setDraft('')
    } catch {
      setError("Le message n'a pas pu être envoyé.")
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="mt-5 border-t border-line pt-4">
      <h3 className="mb-2 text-xs font-medium text-muted">
        Discussion
        {comments.length > 0 && <span className="ml-1 font-normal">({comments.length})</span>}
      </h3>

      {loading ? (
        <p className="text-xs text-muted">Chargement…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted">
          Aucun message. Posez une question, ou précisez une contrainte.
        </p>
      ) : (
        <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg bg-canvas px-3 py-2">
              <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted">
                <span className="font-medium text-ink">{comment.author}</span>
                <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
              </div>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{comment.body}</p>
            </li>
          ))}
          <div ref={endRef} />
        </ul>
      )}

      <form onSubmit={send} className="mt-2 flex gap-2">
        <label htmlFor="comment-draft" className="sr-only">
          Votre message
        </label>
        <input
          id="comment-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message de ${author}…`}
          maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Envoyer le message"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          <IconSend size={15} aria-hidden />
          {sending ? '…' : 'Envoyer'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
