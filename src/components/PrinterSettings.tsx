'use client'

import { useState } from 'react'
import type { PrinterView } from '@/lib/printerView'
import { IconPrinter } from './icons'

type Diagnostic =
  | { ok: true; url: string; stateLabel: string | null; detail: string }
  | { ok: false; url?: string; error: string; hint?: string }

const FIELD =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent'

/**
 * Réglages de l'imprimante.
 *
 * L'application tourne sur Netlify et l'imprimante est chez Alexandre : le seul
 * chemin possible passe par OctoEverywhere, qui sait parler à la Centauri Carbon
 * — ce qu'OctoPrint ne fait pas, la machine n'exposant pas de liaison série.
 *
 * La voie normale est le « Live Link » : une adresse publique en lecture seule,
 * créée en deux clics dans OctoEverywhere, révocable au même endroit. D'où le
 * ton de cette page : un champ, un bouton, et le reste replié.
 */
export function PrinterSettings({
  initial,
  // L'adresse arrive à part : elle ne fait plus partie de ce que l'API renvoie au
  // tableau, c'est un sésame et cette page est le seul endroit qui l'affiche.
  adresse,
  origin,
}: {
  initial: PrinterView
  adresse: string | null
  origin: string
}) {
  const [name, setName] = useState(initial.name)
  const [statusUrl, setStatusUrl] = useState(adresse ?? '')
  const [autoAdvance, setAutoAdvance] = useState(initial.autoAdvance)
  const [secret, setSecret] = useState('')
  const [webhookToken, setWebhookToken] = useState('')
  const [hasSecret, setHasSecret] = useState(initial.hasSecret)
  const [hasWebhookToken, setHasWebhookToken] = useState(initial.hasWebhookToken)
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [saved, setSaved] = useState(false)

  async function enregistrer(event: React.FormEvent) {
    event.preventDefault()
    setBusy('save')
    try {
      const res = await fetch('/api/printer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          autoAdvance,
          statusUrl: statusUrl.trim() || null,
          // Champ laissé vide : on ne touche pas au secret déjà enregistré.
          ...(secret ? { statusSecret: secret } : {}),
          ...(webhookToken ? { webhookToken } : {}),
        }),
      })
      if (!res.ok) throw new Error('refusé')
      const { printer } = (await res.json()) as { printer: PrinterView }
      setHasSecret(printer.hasSecret)
      setHasWebhookToken(printer.hasWebhookToken)
      setSecret('')
      setWebhookToken('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } finally {
      setBusy(null)
    }
  }

  async function tester() {
    setBusy('test')
    setDiagnostic(null)
    try {
      const res = await fetch('/api/printer/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusUrl, ...(secret ? { statusSecret: secret } : {}) }),
      })
      setDiagnostic((await res.json()) as Diagnostic)
    } catch (cause) {
      setDiagnostic({
        ok: false,
        error: cause instanceof Error ? cause.message : 'Test impossible.',
      })
    } finally {
      setBusy(null)
    }
  }

  const webhookUrl = `${origin}/api/printer/webhook?token=${
    hasWebhookToken && !webhookToken ? '<votre-jeton>' : webhookToken || '<votre-jeton>'
  }`

  return (
    <form onSubmit={enregistrer} className="flex flex-col gap-5">
      <section>
        <label htmlFor="p-name" className="mb-1 block text-xs font-medium text-muted">
          Nom de la machine
        </label>
        <input
          id="p-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD}
        />
      </section>

      <section>
        <label htmlFor="p-url" className="mb-1 block text-xs font-medium text-muted">
          Lien OctoEverywhere
        </label>
        <input
          id="p-url"
          value={statusUrl}
          onChange={(e) => setStatusUrl(e.target.value)}
          placeholder="https://octoeverywhere.com/live/xxxxxxxx"
          spellCheck={false}
          className={FIELD}
        />
        <p className="mt-1.5 text-xs text-muted">
          Dans OctoEverywhere, ouvrez l’imprimante, créez un <strong>Live Link</strong> et collez
          son adresse ici. Il donne l’état en lecture seule, sans rien ouvrir sur le réseau, et se
          révoque du même endroit. L’identifiant seul suffit aussi.
        </p>
        <p className="mt-1.5 text-xs text-muted">
          Une <strong>Shared Connection</strong> (<code>shared-….octoeverywhere.com</code>) marche
          également, et en dit même un peu plus : elle donne le numéro de couche, que le Live Link
          ne fournit pas. En revanche elle ne connaît ni l’image de fin d’impression, ni l’état en
          toutes lettres — les deux adresses ne racontent pas tout à fait la même chose.
        </p>
      </section>

      {/*
        L'avance automatique. Activée par défaut : c'est l'intérêt d'avoir branché
        la machine. L'interrupteur existe pour le jour où les noms de fichiers ne
        ressemblent plus aux titres des cartes.
      */}
      <label className="flex min-h-10 cursor-pointer items-start gap-2 text-sm">
        <input
          id="p-auto"
          type="checkbox"
          checked={autoAdvance}
          onChange={(e) => setAutoAdvance(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span>
          Faire avancer les cartes toute seule
          <span className="mt-0.5 block text-xs text-muted">
            Quand une impression démarre, la carte du même nom passe en « En impression » ; quand
            elle se termine, elle passe en « Fait » avec sa photo et le filament réellement
            consommé.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy !== null}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          {busy === 'save' ? 'Enregistrement…' : saved ? 'Enregistré' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={tester}
          disabled={busy !== null || !statusUrl.trim()}
          data-testid="test-printer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          <IconPrinter size={15} aria-hidden />
          {busy === 'test' ? 'Test…' : 'Tester la connexion'}
        </button>
      </div>

      {/*
        Le diagnostic est volontairement bavard. Les échecs se ressemblent tous vus
        d'ici — lien révoqué, identifiant tronqué au copier-coller, NAS éteint — et
        c'est la réponse brute qui les distingue.
      */}
      {diagnostic && (
        <div
          data-testid="printer-diagnostic"
          role="status"
          className={[
            'rounded-lg border px-3 py-2 text-sm',
            diagnostic.ok
              ? 'border-accent/40 bg-accent/5'
              : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300',
          ].join(' ')}
        >
          {diagnostic.ok ? (
            <>
              <p className="font-medium">L’imprimante répond : {diagnostic.stateLabel}</p>
              <p className="mt-0.5 text-xs opacity-80">{diagnostic.detail}</p>
            </>
          ) : (
            <>
              <p className="font-medium">{diagnostic.error}</p>
              {diagnostic.hint && (
                <p className="mt-1 font-mono text-xs break-all opacity-80">{diagnostic.hint}</p>
              )}
            </>
          )}
          {diagnostic.url && (
            <p className="mt-1 font-mono text-[11px] break-all opacity-60">{diagnostic.url}</p>
          )}
        </div>
      )}

      {/*
        Replié : avec un Live Link, rien de tout ceci ne sert. Ces deux réglages
        existent pour le jour où la lecture directe ne suffit pas — une « Shared
        Connection » qui demande une clé, ou un lien qu'on ne veut pas créer.
      */}
      <details className="rounded-lg border border-line px-3 pb-3">
        <summary className="-mx-3 flex min-h-10 cursor-pointer items-center px-3 text-xs font-medium text-muted">
          Cas particuliers : clé d’accès et webhook
        </summary>

        <label htmlFor="p-secret" className="mt-2 mb-1 block text-xs font-medium text-muted">
          Clé d’accès {hasSecret && <span className="text-accent-deep">— configurée</span>}
        </label>
        <input
          id="p-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={hasSecret ? '••••••••  (laisser vide pour ne pas changer)' : 'si nécessaire'}
          autoComplete="off"
          spellCheck={false}
          className={FIELD}
        />
        <p className="mt-1.5 text-xs text-muted">
          Inutile avec un Live Link. Elle ne ressort jamais de l’application : on ne peut que la
          remplacer.
        </p>

        <p className="mt-4 text-xs font-medium text-muted">
          Si la lecture directe ne passe pas : le webhook
        </p>
        <p className="mt-1.5 text-xs text-muted">
          Choisissez un jeton, enregistrez, puis collez l’adresse ci-dessous dans les notifications
          par webhook d’OctoEverywhere. C’est alors lui qui pousse l’état vers l’application, sans
          rien exposer de votre réseau.
        </p>
        <label htmlFor="p-webhook" className="mt-3 mb-1 block text-xs font-medium text-muted">
          Jeton du webhook{' '}
          {hasWebhookToken && <span className="text-accent-deep">— configuré</span>}
        </label>
        <input
          id="p-webhook"
          value={webhookToken}
          onChange={(e) => setWebhookToken(e.target.value)}
          placeholder={
            hasWebhookToken ? '••••••••  (laisser vide pour ne pas changer)' : 'au choix'
          }
          autoComplete="off"
          spellCheck={false}
          className={FIELD}
        />
        <p className="mt-2 font-mono text-[11px] break-all text-muted" data-testid="webhook-url">
          {webhookUrl}
        </p>
      </details>
    </form>
  )
}
