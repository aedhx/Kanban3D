'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { STATUSES, type Status } from '@/db/schema'
import { columnCards, resolveDrop, type BoardCard } from '@/lib/board'
import { positionBetween } from '@/lib/cards'
import { PEOPLE } from '@/lib/people'
import { useIdentity } from '@/lib/useIdentity'
import { AddCardForm, type NewCardInput } from './AddCardForm'
import { CardModal } from './CardModal'
import { CardPreview } from './CardTile'
import { IconIdentity, IconOffline } from './icons'
import { Column } from './Column'

const REFRESH_INTERVAL_MS = 10_000

export function Board({ initialCards }: { initialCards: BoardCard[] }) {
  const { identity, choose, loaded } = useIdentity()
  const [cards, setCards] = useState<BoardCard[]>(initialCards)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  // Le rafraîchissement périodique ne doit jamais écraser une modification en
  // cours : on le met en pause pendant un glisser ou un appel réseau.
  const busyRef = useRef(0)
  const draggingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (busyRef.current > 0 || draggingRef.current) return
    try {
      const res = await fetch('/api/cards', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { cards: BoardCard[] }
      if (busyRef.current > 0 || draggingRef.current) return
      setCards(data.cards)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS)
    const onFocus = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  /** Enveloppe un appel réseau : suspend le rafraîchissement, signale les pannes. */
  const withBusy = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    busyRef.current += 1
    try {
      const result = await work()
      setOffline(false)
      return result
    } catch (error) {
      setOffline(true)
      throw error
    } finally {
      busyRef.current -= 1
    }
  }, [])

  const createCard = useCallback(
    async (input: NewCardInput) => {
      await withBusy(async () => {
        const res = await fetch('/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, requestedBy: identity ?? PEOPLE[0] }),
        })
        if (!res.ok) throw new Error('création refusée')
        const { card } = (await res.json()) as { card: BoardCard }
        setCards((current) => [...current, card])
      })
    },
    [identity, withBusy],
  )

  /** Applique un changement localement d'abord, puis le confirme au serveur. */
  const patchCard = useCallback(
    async (id: string, changes: Record<string, unknown>, optimistic?: Partial<BoardCard>) => {
      const snapshot = cards
      if (optimistic) {
        setCards((current) =>
          current.map((card) => (card.id === id ? { ...card, ...optimistic } : card)),
        )
      }

      try {
        await withBusy(async () => {
          const res = await fetch(`/api/cards/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes),
          })
          if (!res.ok) throw new Error('mise à jour refusée')
          const { card } = (await res.json()) as { card: BoardCard }
          setCards((current) => current.map((item) => (item.id === id ? card : item)))
        })
      } catch (error) {
        setCards(snapshot) // on remet le tableau tel qu'il était
        throw error
      }
    },
    [cards, withBusy],
  )

  /** Le fil de discussion vient d'ajouter un message : on rafraîchit le badge. */
  const setCommentCount = useCallback((id: string, count: number) => {
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, commentCount: count } : card)),
    )
  }, [])

  const deleteCard = useCallback(
    async (card: BoardCard) => {
      const snapshot = cards
      setCards((current) => current.filter((item) => item.id !== card.id))
      try {
        await withBusy(async () => {
          const res = await fetch(`/api/cards/${card.id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('suppression refusée')
        })
      } catch {
        setCards(snapshot)
      }
    },
    [cards, withBusy],
  )

  /** Déplacement par les boutons ‹ › ou par la modale : la carte va en fin de colonne. */
  const moveCard = useCallback(
    (card: BoardCard, status: Status) => {
      if (card.status === status) return
      const target = columnCards(cards, status)
      const position = positionBetween(target[target.length - 1]?.position, undefined)
      const movedBy = identity ?? PEOPLE[0]

      void patchCard(
        card.id,
        { status, position, movedBy },
        { status, position, lastMovedBy: movedBy },
      ).catch(() => {})
    },
    [cards, identity, patchCard],
  )

  const sensors = useSensors(
    // Un petit seuil de déplacement : sans lui, le simple clic pour ouvrir une
    // carte serait interprété comme un début de glisser.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event: DragStartEvent) {
    draggingRef.current = true
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    draggingRef.current = false
    setActiveId(null)

    const { active, over } = event
    if (!over) return

    const drop = resolveDrop(cards, String(active.id), String(over.id))
    if (!drop) return

    const card = cards.find((item) => item.id === active.id)
    if (!card) return

    const movedBy = identity ?? PEOPLE[0]
    void patchCard(
      card.id,
      { ...drop, movedBy },
      {
        ...drop,
        lastMovedBy: drop.status !== card.status ? movedBy : card.lastMovedBy,
      },
    ).catch(() => {})
  }

  const editing = cards.find((card) => card.id === editingId) ?? null
  const activeCard = cards.find((card) => card.id === activeId) ?? null

  // Premier lancement : on demande qui utilise cet appareil.
  if (loaded && !identity) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-xs text-center">
          <h1 className="text-xl font-semibold tracking-tight">Qui êtes-vous ?</h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            Juste pour savoir qui demande quoi. Modifiable à tout moment.
          </p>
          <div className="flex flex-col gap-2">
            {PEOPLE.map((person) => (
              <button
                key={person}
                type="button"
                onClick={() => choose(person)}
                className="rounded-lg border border-line bg-surface px-4 py-3 font-medium transition-colors hover:border-accent hover:text-accent"
              >
                {person}
              </button>
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Kanban3D</h1>
        <div className="flex items-center gap-2 text-xs text-muted">
          {offline && (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <IconOffline size={14} aria-hidden />
              hors ligne
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const next = PEOPLE[(PEOPLE.indexOf(identity ?? PEOPLE[0]) + 1) % PEOPLE.length]
              choose(next)
            }}
            title="Changer d’utilisateur"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 transition-colors hover:border-accent hover:text-accent"
          >
            <IconIdentity size={14} aria-hidden />
            {identity ?? '—'}
          </button>
        </div>
      </header>

      <AddCardForm onCreate={createCard} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          draggingRef.current = false
          setActiveId(null)
        }}
      >
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:overflow-visible">
          {STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              cards={columnCards(cards, status)}
              onOpen={(card) => setEditingId(card.id)}
              onMove={moveCard}
            />
          ))}
        </div>

        <DragOverlay>{activeCard && <CardPreview card={activeCard} />}</DragOverlay>
      </DndContext>

      {editing && (
        <CardModal
          card={editing}
          identity={identity ?? PEOPLE[0]}
          onClose={() => setEditingId(null)}
          onSave={(id, changes) => patchCard(id, changes, changes as Partial<BoardCard>)}
          onMove={moveCard}
          onDelete={deleteCard}
          onCommentCount={setCommentCount}
        />
      )}
    </main>
  )
}
