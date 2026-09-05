'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Comment } from '@/db/schema'
import { commentPhotoUrl } from '@/lib/commentPhoto'
import { timeAgo } from '@/lib/dates'
import { preparePhoto } from '@/lib/photo'
import { IconClose, IconPhoto, IconSend } from './icons'

/** Un message tel que le reçoit le navigateur : dates sérialisées en chaînes. */
export type ThreadComment = Omit<Comment, 'createdAt' | 'photoAt'> & {
  createdAt: string
  photoAt: string | null
}

/**
 * Les échanges autour d'une demande. C'est ce qui restait sur la messagerie :
 * « quelle taille exactement ? », « plus de vert, du bleu ça ira ? ». Le champ
 * « Remarque » ne pouvait pas jouer ce rôle : il est unique et s'écrase.
 *
 * On peut y joindre une photo, et c'est souvent ce qui règle la question : la
 * pièce sortie du plateau, le coin qui a décollé, la couleur réelle du filament.
 * Sur téléphone, `capture` ouvre directement l'appareil photo.
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
  /** La photo choisie, avant envoi : ses octets et son aperçu local. */
  const [photo, setPhoto] = useState<{ blob: Blob; aperçu: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agrandie, setAgrandie] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fichierRef = useRef<HTMLInputElement>(null)
  const dialogue = useRef<HTMLDialogElement>(null)

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

  // L'aperçu local est une URL d'objet : la révoquer évite de retenir l'image
  // en mémoire une fois qu'elle est partie.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.aperçu)
    }
  }, [photo])

  useEffect(() => {
    const dlg = dialogue.current
    if (!dlg) return
    if (agrandie && !dlg.open) dlg.showModal()
    if (!agrandie && dlg.open) dlg.close()
  }, [agrandie])

  async function choisir(file: File) {
    setError(null)
    try {
      // Redimensionnée dans le navigateur : c'est le forfait de celui qui prend
      // la photo qu'on épargne, souvent au garage au bout du wifi.
      const { blob } = await preparePhoto(file)
      setPhoto((actuelle) => {
        if (actuelle) URL.revokeObjectURL(actuelle.aperçu)
        return { blob, aperçu: URL.createObjectURL(blob) }
      })
    } catch {
      setError('Cette image n’a pas pu être préparée.')
    } finally {
      // Permet de rechoisir le même fichier après une erreur.
      if (fichierRef.current) fichierRef.current.value = ''
    }
  }

  function retirerLaPhoto() {
    setPhoto((actuelle) => {
      if (actuelle) URL.revokeObjectURL(actuelle.aperçu)
      return null
    })
  }

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    // Une photo seule suffit : montrer, c'est déjà dire quelque chose.
    if ((!body && !photo) || sending) return

    setSending(true)
    setError(null)
    try {
      /*
       * Multipart dès qu'il y a une image, JSON sinon. Un seul aller-retour dans
       * les deux cas : découper en « crée le message » puis « attache la photo »
       * ferait partir la notification avant l'image.
       */
      const init: RequestInit = photo
        ? { method: 'POST', body: corpsMultipart(body, author, photo.blob) }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body, author }),
          }
      const res = await fetch(`/api/cards/${cardId}/comments`, init)
      if (!res.ok) {
        const { error: message } = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(message ?? 'envoi refusé')
      }
      const { comment } = (await res.json()) as { comment: ThreadComment }
      setComments((current) => {
        const next = [...current, comment]
        onCountChange?.(next.length)
        return next
      })
      setDraft('')
      retirerLaPhoto()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le message n'a pas pu être envoyé.")
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
          Aucun message. Posez une question, montrez une photo, ou précisez une contrainte.
        </p>
      ) : (
        <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg bg-canvas px-3 py-2">
              <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted">
                <span className="font-medium text-ink">{comment.author}</span>
                <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
              </div>
              {comment.body && <p className="mt-0.5 text-sm whitespace-pre-wrap">{comment.body}</p>}
              {comment.photoAt && (
                <button
                  type="button"
                  onClick={() => setAgrandie(commentPhotoUrl(cardId, comment.id, comment.photoAt!))}
                  data-testid="comment-photo"
                  aria-label={`Agrandir la photo de ${comment.author}`}
                  className="mt-1.5 block"
                >
                  {/* Servie par notre route, derrière le cookie de session :
                      next/image la ferait passer par son optimiseur, qui ne l'a pas. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={commentPhotoUrl(cardId, comment.id, comment.photoAt)}
                    alt=""
                    className="max-h-40 rounded-lg border border-line object-cover"
                  />
                </button>
              )}
            </li>
          ))}
          <div ref={endRef} />
        </ul>
      )}

      {photo && (
        <div className="mt-2 flex items-center gap-2" data-testid="photo-en-attente">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.aperçu}
            alt="Photo à envoyer"
            className="h-14 w-14 rounded-lg border border-line object-cover"
          />
          <span className="text-xs text-muted">Photo prête à partir</span>
          <button
            type="button"
            onClick={retirerLaPhoto}
            data-testid="retirer-photo"
            aria-label="Retirer la photo"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <IconClose size={15} aria-hidden />
          </button>
        </div>
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

        <input
          ref={fichierRef}
          type="file"
          accept="image/*"
          capture="environment"
          data-testid="comment-photo-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void choisir(file)
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fichierRef.current?.click()}
          disabled={sending}
          data-testid="joindre-photo"
          aria-label="Joindre une photo"
          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          <IconPhoto size={15} aria-hidden />
        </button>

        <button
          type="submit"
          disabled={sending || (!draft.trim() && !photo)}
          aria-label="Envoyer le message"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
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

      <dialog
        ref={dialogue}
        onClose={() => setAgrandie(null)}
        onClick={() => setAgrandie(null)}
        className="m-auto max-w-[90vw] rounded-xl border border-line bg-surface p-2 backdrop:bg-black/60"
      >
        {agrandie && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={agrandie} alt="Photo du message" className="max-h-[80vh] w-auto rounded-lg" />
        )}
      </dialog>
    </section>
  )
}

/** Le corps multipart d'un message avec photo. */
function corpsMultipart(body: string, author: string, photo: Blob): FormData {
  const formulaire = new FormData()
  formulaire.set('body', body)
  formulaire.set('author', author)
  formulaire.set('photo', photo, 'photo.jpg')
  return formulaire
}
