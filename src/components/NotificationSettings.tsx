'use client'

import { useState } from 'react'
import { TRIGGERS } from '@/lib/notifyEvents'
import type { NotificationTargetView } from '@/lib/notifySettings'
import { IconAdd, IconDelete, IconSend } from './icons'

const FIELD =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent'

type Résultat = { ok: true; transport: string } | { ok: false; error: string; hint?: string }

/** Les trois destinations, et ce qu'il faut savoir pour chacune. */
const TRANSPORTS = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'ntfy', label: 'ntfy' },
  { id: 'webhook', label: 'Discord, Slack…' },
] as const

/**
 * Où partent les notifications.
 *
 * Ces réglages vivaient dans des variables d'environnement, ce qui obligeait à
 * redéployer pour changer de destination — et le résultat observable, c'est qu'ils
 * n'ont jamais été renseignés. Les voici là où on les cherche, avec les
 * instructions à côté du champ concerné plutôt que dans un fichier d'exemple.
 *
 * Plusieurs destinations, parce qu'une seule obligeait deux personnes à partager
 * la même messagerie : celui qui posait son Discord privait l'autre du sien. Et
 * chacune a ses propres cases — on ne veut pas forcément le même niveau de détail
 * sur un salon partagé et sur son téléphone.
 */
export function NotificationSettings({ initial }: { initial: NotificationTargetView[] }) {
  const [targets, setTargets] = useState(initial)
  const [ajout, setAjout] = useState(false)

  async function ajouter() {
    setAjout(true)
    try {
      /*
       * La destination est créée tout de suite, à moitié vide. C'est ce qui donne
       * un identifiant, dont dépendent le bouton de test et l'enregistrement — et
       * une ligne sans adresse n'envoie rien, donc elle ne peut pas nuire.
       */
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Nouvelle destination', transport: 'webhook' }),
      })
      if (!res.ok) return
      const { target } = (await res.json()) as { target: NotificationTargetView }
      setTargets((liste) => [...liste, target])
    } finally {
      setAjout(false)
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="destinations">
      {targets.length === 0 && (
        <p className="text-xs text-muted" data-testid="aucune-destination">
          Aucune destination : l’application fonctionne, elle n’envoie simplement rien. Si des
          variables d’environnement sont posées sur l’hébergeur, ce sont elles qui servent.
        </p>
      )}

      {targets.map((target) => (
        <TargetCard
          key={target.id}
          target={target}
          onDelete={() => setTargets((liste) => liste.filter((t) => t.id !== target.id))}
        />
      ))}

      <button
        type="button"
        onClick={ajouter}
        disabled={ajout}
        data-testid="ajouter-destination"
        className="inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-lg border border-line px-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
      >
        <IconAdd size={15} aria-hidden />
        {ajout ? 'Ajout…' : 'Ajouter une destination'}
      </button>
    </div>
  )
}

/** Une destination : son nom, où elle envoie, et ce qui la fait parler. */
function TargetCard({
  target,
  onDelete,
}: {
  target: NotificationTargetView
  onDelete: () => void
}) {
  const [label, setLabel] = useState(target.label)
  const [transport, setTransport] = useState(target.transport)
  const [telegramToken, setTelegramToken] = useState('')
  const [hasTelegramToken, setHasTelegramToken] = useState(target.hasTelegramToken)
  const [telegramChat, setTelegramChat] = useState(target.telegramChat ?? '')
  const [ntfyTopic, setNtfyTopic] = useState(target.ntfyTopic ?? '')
  const [webhookUrl, setWebhookUrl] = useState(target.webhookUrl ?? '')
  /*
   * `null` en base veut dire « tous » : on le déplie ici en une liste complète,
   * parce qu'une case ne sait pas afficher « pas encore choisi ». Ce qui repart
   * est donc toujours une liste explicite — et c'est très bien, à partir du moment
   * où quelqu'un a ouvert cet écran, le choix est fait.
   */
  const [events, setEvents] = useState<string[]>(target.events ?? TRIGGERS.map((t) => t.key))
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null)
  const [saved, setSaved] = useState(false)
  const [résultat, setRésultat] = useState<Résultat | null>(null)

  async function enregistrer(event: React.FormEvent) {
    event.preventDefault()
    setBusy('save')
    setRésultat(null)
    try {
      const res = await fetch(`/api/notifications/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          transport,
          events,
          telegramChat,
          ntfyTopic,
          webhookUrl,
          // Champ laissé vide : on ne touche pas au jeton déjà enregistré.
          ...(telegramToken ? { telegramToken } : {}),
        }),
      })
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string }
        setRésultat({ ok: false, error: error ?? 'Enregistrement refusé.' })
        return
      }
      const { target: à_jour } = (await res.json()) as { target: NotificationTargetView }
      setHasTelegramToken(à_jour.hasTelegramToken)
      setTelegramToken('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } finally {
      setBusy(null)
    }
  }

  async function tester() {
    setBusy('test')
    setRésultat(null)
    try {
      const res = await fetch(`/api/notifications/${target.id}/test`, { method: 'POST' })
      setRésultat((await res.json()) as Résultat)
    } catch (cause) {
      setRésultat({ ok: false, error: cause instanceof Error ? cause.message : 'Test impossible.' })
    } finally {
      setBusy(null)
    }
  }

  async function supprimer() {
    setBusy('delete')
    try {
      const res = await fetch(`/api/notifications/${target.id}`, { method: 'DELETE' })
      if (res.ok) onDelete()
    } finally {
      setBusy(null)
    }
  }

  return (
    <form
      onSubmit={enregistrer}
      data-testid="destination"
      data-destination={target.id}
      className="flex flex-col gap-3 rounded-xl border border-line p-3"
    >
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Nom de la destination"
          data-testid="destination-label"
          placeholder="Le Discord d’Alexandre"
          className={`${FIELD} font-medium`}
        />
        <button
          type="button"
          onClick={supprimer}
          disabled={busy !== null}
          data-testid="supprimer-destination"
          aria-label={`Supprimer « ${label} »`}
          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-amber-500 hover:text-amber-700 disabled:opacity-40 dark:hover:text-amber-400"
        >
          <IconDelete size={15} aria-hidden />
        </button>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">Où prévenir</span>
        <div className="flex gap-1.5">
          {TRANSPORTS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTransport(t.id)}
              aria-pressed={transport === t.id}
              data-testid={`transport-${t.id}`}
              className={[
                'min-h-10 flex-1 rounded-lg border px-2 text-xs transition-colors',
                transport === t.id
                  ? 'border-accent bg-accent/10 font-medium text-accent-deep'
                  : 'border-line text-muted hover:border-accent',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {transport === 'telegram' && (
        <section className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <p className="text-xs text-muted">
            Sur Telegram, écrivez à <strong>@BotFather</strong>, envoyez <code>/newbot</code> : il
            renvoie un jeton. Créez ensuite un groupe avec votre frère, ajoutez-y le bot, écrivez-y
            un message, puis ouvrez <code>api.telegram.org/bot&lt;jeton&gt;/getUpdates</code> pour
            relever l’identifiant du groupe — <strong>le signe moins en fait partie</strong>.
          </p>
          <div>
            <label
              htmlFor={`n-token-${target.id}`}
              className="mb-1 block text-xs font-medium text-muted"
            >
              Jeton du bot{' '}
              {hasTelegramToken && <span className="text-accent-deep">— configuré</span>}
            </label>
            <input
              id={`n-token-${target.id}`}
              type="password"
              autoComplete="off"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder={
                hasTelegramToken ? '••••••••  (laisser vide pour ne pas changer)' : '123456789:AAE…'
              }
              className={FIELD}
            />
          </div>
          <div>
            <label
              htmlFor={`n-chat-${target.id}`}
              className="mb-1 block text-xs font-medium text-muted"
            >
              Identifiant du groupe
            </label>
            <input
              id={`n-chat-${target.id}`}
              value={telegramChat}
              onChange={(e) => setTelegramChat(e.target.value)}
              placeholder="-100123456789"
              spellCheck={false}
              className={FIELD}
            />
          </div>
        </section>
      )}

      {transport === 'ntfy' && (
        <section className="rounded-lg border border-line p-3">
          <label
            htmlFor={`n-ntfy-${target.id}`}
            className="mb-1 block text-xs font-medium text-muted"
          >
            Sujet ntfy
          </label>
          <input
            id={`n-ntfy-${target.id}`}
            value={ntfyTopic}
            onChange={(e) => setNtfyTopic(e.target.value)}
            placeholder="kanban3d-quelque-chose-de-difficile-a-deviner"
            spellCheck={false}
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-muted">
            Aucun compte à créer : installez l’application ntfy et abonnez-vous à ce sujet.
            Choisissez un nom difficile à deviner —{' '}
            <strong>n’importe qui le connaissant lira vos notifications</strong>. Une URL complète
            est acceptée pour un serveur privé.
          </p>
        </section>
      )}

      {transport === 'webhook' && (
        <section className="rounded-lg border border-line p-3">
          <label
            htmlFor={`n-webhook-${target.id}`}
            className="mb-1 block text-xs font-medium text-muted"
          >
            Adresse du webhook
          </label>
          <input
            id={`n-webhook-${target.id}`}
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            spellCheck={false}
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-muted">
            Discord, Slack, n8n, Zapier — tout ce qui accepte un POST JSON. Pour Discord, copiez
            l’adresse depuis Paramètres du salon → Intégrations ; le <code>/slack</code> qu’elle
            réclame est ajouté tout seul.
          </p>
        </section>
      )}

      {/* Ce qui déclenche un envoi, pour cette destination-ci. */}
      <section className="rounded-lg border border-line p-3">
        <p className="mb-2 text-xs font-medium text-muted">Prévenir quand…</p>
        <div className="flex flex-col gap-1">
          {TRIGGERS.map((t) => (
            <label
              key={t.key}
              className="flex min-h-10 cursor-pointer items-center gap-2 text-sm sm:min-h-8"
            >
              <input
                type="checkbox"
                data-testid={`trigger-${t.key}`}
                checked={events.includes(t.key)}
                onChange={(e) =>
                  setEvents((actuels) =>
                    e.target.checked ? [...actuels, t.key] : actuels.filter((clé) => clé !== t.key),
                  )
                }
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              {t.label}
            </label>
          ))}
        </div>
        {events.length === 0 && (
          <p
            className="mt-2 text-xs text-amber-800 dark:text-amber-300"
            data-testid="aucun-evenement"
          >
            Aucun événement coché : cette destination ne recevra plus rien. Elle reste enregistrée,
            et le bouton de test continue de fonctionner.
          </p>
        )}
      </section>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy !== null}
          data-testid="enregistrer-destination"
          className="min-h-10 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          {busy === 'save' ? 'Enregistrement…' : saved ? 'Enregistré' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={tester}
          disabled={busy !== null}
          data-testid="test-notify"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-4 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          <IconSend size={15} aria-hidden />
          {busy === 'test' ? 'Envoi…' : 'Envoyer un test'}
        </button>
      </div>

      {résultat && (
        <div
          data-testid="notify-result"
          role="status"
          className={[
            'rounded-lg border px-3 py-2 text-sm',
            résultat.ok
              ? 'border-accent/40 bg-accent/5'
              : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300',
          ].join(' ')}
        >
          {résultat.ok ? (
            <p className="font-medium">Message envoyé via {résultat.transport}. Il est arrivé ?</p>
          ) : (
            <>
              <p className="font-medium">{résultat.error}</p>
              {résultat.hint && (
                <p className="mt-1 font-mono text-xs break-all opacity-80">{résultat.hint}</p>
              )}
            </>
          )}
        </div>
      )}
    </form>
  )
}
