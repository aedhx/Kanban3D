/**
 * Écran affiché quand le tableau ne peut pas être chargé faute de base de
 * données utilisable.
 *
 * Sans lui, Next.js montre « Application error: a server-side exception has
 * occurred » et renvoie le motif réel dans les journaux du serveur — inutilisable
 * pour quelqu'un qui vient de configurer son site. Les trois causes possibles
 * sont pourtant reconnaissables et se corrigent chacune en un geste.
 */

type Diagnostic = {
  titre: string
  cause: string
  gestes: string[]
  code?: string
}

/** Codes d'erreur Postgres utiles : table absente, schéma absent. */
const TABLE_ABSENTE = new Set(['42P01', '3F000'])

function diagnostiquer(error: unknown): Diagnostic {
  const message = error instanceof Error ? error.message : String(error)
  // postgres.js expose le code SQLSTATE sur l'erreur, ou sur sa cause.
  const cause = (error as { cause?: unknown })?.cause
  const code = (error as { code?: string })?.code ?? (cause as { code?: string } | undefined)?.code
  const causeMessage = cause instanceof Error ? cause.message : ''
  const tout = `${message} ${causeMessage}`

  if (tout.includes('DATABASE_URL')) {
    return {
      titre: 'La base de données n’est pas branchée',
      cause: 'La variable DATABASE_URL est absente.',
      gestes: [
        'Dans Netlify : Project configuration → Database → Netlify DB.',
        'Cliquez sur « Claim database » pour la conserver définitivement.',
        'Vérifiez que DATABASE_URL apparaît bien dans les variables d’environnement — ne la supprimez pas, c’est l’extension qui la gère.',
        'Puis Deploys → Trigger deploy.',
      ],
    }
  }

  if ((code && TABLE_ABSENTE.has(code)) || /relation .* does not exist/i.test(tout)) {
    return {
      titre: 'Les tables n’ont pas encore été créées',
      cause: 'La base répond, mais elle est vide.',
      code,
      gestes: [
        'Les migrations tournent au moment de la construction du site.',
        'Dans Netlify : Deploys → Trigger deploy → Clear cache and deploy site.',
        'Dans le journal de construction, cherchez la ligne « [migrate] ». Si elle indique « DATABASE_URL absente », c’est la base qui n’est pas branchée.',
      ],
    }
  }

  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|terminated/i.test(tout)) {
    return {
      titre: 'La base de données est injoignable',
      cause: 'La connexion a échoué ou a expiré.',
      code,
      gestes: [
        'La base a peut-être expiré : une base Netlify DB non « claimed » disparaît au bout de sept jours.',
        'Vérifiez son état dans Project configuration → Database.',
        'Si elle a expiré, provisionnez-en une nouvelle puis relancez un déploiement — les tables seront recréées.',
      ],
    }
  }

  return {
    titre: 'Le tableau n’a pas pu être chargé',
    cause: 'La base de données a renvoyé une erreur inattendue.',
    code,
    gestes: [
      'Consultez les journaux des fonctions dans Netlify pour le détail.',
      'Vérifiez que DATABASE_URL est présente et que la base est active.',
    ],
  }
}

export function SetupNeeded({ error }: { error: unknown }) {
  const { titre, cause, gestes, code } = diagnostiquer(error)

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-7 shadow-sm">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          Configuration à terminer
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{titre}</h1>
        <p className="mt-2 text-sm text-muted">{cause}</p>

        <ol className="mt-5 space-y-2.5 text-sm">
          {gestes.map((geste, index) => (
            <li key={index} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                {index + 1}
              </span>
              <span>{geste}</span>
            </li>
          ))}
        </ol>

        {code && (
          <p className="mt-5 border-t border-line pt-3 text-xs text-muted">
            Code renvoyé par Postgres : <code className="font-mono">{code}</code>
          </p>
        )}
      </div>
    </main>
  )
}
