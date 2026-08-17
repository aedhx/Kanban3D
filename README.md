# Kanban3D

Un tableau d'impressions 3D partagé à deux. **On colle le lien d'un modèle**
(Printables, MakerWorld, Thingiverse, Cults3D…) **et la carte se crée toute
seule** dans « À imprimer », titre, image et auteur compris. Il ne reste plus
qu'à la faire avancer de colonne au fil de l'impression.

**À imprimer → En impression → Fait.** Pas de compte, pas de collection, pas
d'export : un seul écran, un code partagé.

Quantité, couleur, remarque et échéance se règlent ensuite dans le panneau
latéral, si besoin — le plus souvent il n'y en a pas. Chaque carte a aussi son
fil de discussion, et une notification part sur vos téléphones à chaque demande,
chaque déplacement et chaque message.

---

## Mise en ligne sur Netlify

### 1. Créer le site

Sur [app.netlify.com](https://app.netlify.com) : **Add new site → Import an
existing project**, choisir ce dépôt et la branche
`claude/3d-print-sharing-app-wk06k6`.

La commande de build et le dossier publié sont déjà décrits dans `netlify.toml`,
il n'y a rien à saisir.

### 2. Brancher la base de données

Dans le site : **Project configuration → Database → Netlify DB**, puis *Claim
database* pour la conserver au-delà de la période d'essai (le niveau gratuit
suffit très largement ici).

Netlify crée une base Postgres (Neon) et injecte tout seul la variable
`DATABASE_URL`.

### 3. Ajouter les deux variables restantes

Dans **Project configuration → Environment variables** :

| Variable | Valeur |
| --- | --- |
| `APP_PIN` | le code que vous partagez avec votre frère, par ex. `4271` |
| `APP_SECRET` | une chaîne aléatoire, obtenue avec `openssl rand -hex 32` |

`APP_SECRET` sert à signer le cookie de session. Changer `APP_PIN` déconnecte
automatiquement tout le monde.

Ajoutez-y aussi, si vous voulez les notifications, les variables d'un des trois
canaux décrits dans `.env.example` — le plus simple étant `TELEGRAM_BOT_TOKEN` +
`TELEGRAM_CHAT_ID`. Sans elles, l'application marche mais n'envoie rien.

### 4. Créer la table

Une seule fois, depuis votre machine, avec l'URL de la base Neon (visible dans
l'onglet Database de Netlify) :

```bash
npm install
DATABASE_URL="postgresql://…la vraie URL Neon…" npm run db:push
```

### 5. Déployer

**Deploys → Trigger deploy**. Le site est en ligne ; à la première visite il
demande le code, puis qui vous êtes.

---

## En local

```bash
npm install
cp .env.example .env.local     # puis remplir les trois variables
npm run db:push                # crée la table
npm run dev                    # http://localhost:3000
```

Pour un Postgres local, `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kanban3d`.

Autres commandes :

| Commande | Rôle |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | vérification TypeScript |
| `npm run build` | construction de production |
| `npm run test:platforms` | interroge les quatre plateformes et signale celle qui a changé |
| `npm run format` | Prettier sur `src` et les fichiers de configuration |

---

## Comment ça marche

### Ajouter une demande

Un seul champ. Coller un lien crée la carte sans autre geste : `AddUrlBar`
intercepte l'événement `paste`, et `POST /api/cards` n'a besoin que de l'URL —
c'est **le serveur** qui résout les informations du modèle. Un aller-retour
plutôt que deux, et aucune carte ne peut arriver sans nom.

Une carte provisoire s'affiche pendant la résolution (une ou deux secondes selon
la plateforme), puis cède la place à la vraie. Si la création échoue, elle
disparaît : mieux vaut rien qu'une carte fantôme.

Un collage qui contient plusieurs liens crée plusieurs cartes. Un texte qui n'est
pas un lien devient le titre de la carte, pour une demande sans modèle en ligne.

### Le panneau de détail

`CardPanel` est un panneau latéral, pas une fenêtre modale : au-delà de `lg` il
se place à côté du tableau, qui reste visible et continue de se rafraîchir
pendant qu'on remplit une carte. Il est donc **volontairement non modal** — ni
piège de focus, ni voile bloquant, et on peut déplacer une carte du tableau
panneau ouvert. La carte concernée est cerclée de la couleur d'accent, sans quoi
on ne saurait pas de laquelle le panneau parle.

Sous `lg`, faute de place pour deux colonnes, il redevient une feuille qui monte
du bas, avec un voile tactile.

Enregistrer ne referme pas le panneau : passer d'une carte à l'autre doit rester
fluide.

### Récupération des informations d'un modèle

`src/lib/metadata.ts`. Un adaptateur par plateforme, parce qu'elles ne se lisent
pas de la même façon :

| Plateforme | Méthode |
| --- | --- |
| Printables | API GraphQL `api.printables.com` — la page HTML est bloquée par Cloudflare, l'API non |
| MakerWorld | API REST `makerworld.com/api/v1/design-service/design/{id}` |
| Thingiverse | balises OpenGraph de la page |
| Cults3D | balises OpenGraph + auteur en JSON-LD |
| tout le reste | OpenGraph, sinon `<title>`, sinon le nom déduit de l'URL |

Cette fonction **n'échoue jamais** : si une plateforme ne répond pas, la carte se
crée quand même avec un titre déduit de l'URL, à corriger à la main. C'est utile
en pratique — Cults3D refuse parfois les requêtes selon l'adresse IP appelante.

### Vignettes

Les plateformes servent l'image en pleine résolution (2 Mo chez Printables) pour
une vignette de 56 px. En production, les images passent donc par l'Image CDN de
Netlify qui les redimensionne ; les hôtes autorisés sont listés dans
`netlify.toml`. Si le CDN ne peut pas traiter une image, le composant
`Thumbnail` retombe sur l'URL d'origine, puis masque la vignette — jamais
d'icône d'image cassée.

### Accès

Pas de comptes : un code partagé (`APP_PIN`), vérifié par
`src/lib/auth.ts`, qui dépose un cookie contenant `HMAC(APP_SECRET, APP_PIN)`.
Le PIN ne quitte jamais le serveur et rien n'est stocké en base.

Le contrôle se fait explicitement dans la page et dans chaque route d'API, sans
middleware Edge : tout reste en runtime Node, ce qui évite les surprises de
configuration côté Netlify Edge Functions.

Le choix « Antoine / Alexandre » est indépendant : une simple valeur en
`localStorage`, pour savoir qui a demandé quoi. Pour changer les prénoms, éditer
`PEOPLE` dans `src/lib/people.ts`.

### Ordre des cartes

`position` est un flottant. Insérer une carte entre deux autres prend la moyenne
de leurs positions : un seul `UPDATE`, jamais de renumérotation de la colonne.

### Synchronisation

Le tableau se recharge au retour sur l'onglet et toutes les 10 secondes. Les
actions sont optimistes — la carte bouge tout de suite, et revient en place si le
serveur refuse. Pas de WebSocket : inutile à deux.

### Déplacer une carte

Au glisser-déposer (dnd-kit), ou avec les boutons `‹` `›` en pied de carte. Les
deux existent parce que le glisser tactile reste inégal d'un navigateur mobile à
l'autre : les boutons marchent toujours.

### Notifications

`src/lib/notify.ts`. Trois transports possibles — Telegram, ntfy, ou un webhook
générique — choisis selon les variables présentes. Un message part à la création
d'une carte, à son changement de colonne et à chaque nouveau message ; réordonner
une carte dans sa colonne ou corriger une quantité ne notifie rien.

L'envoi est **attendu** volontairement : en serverless, l'instance est gelée dès
la réponse renvoyée, et un envoi laissé en arrière-plan serait perdu une fois sur
deux. En revanche il ne peut jamais faire échouer la requête — service en panne
ou injoignable, la carte est enregistrée et seule une ligne d'avertissement part
dans les traces.

Les notifications partent sur un canal commun, donc vous voyez aussi vos propres
actions. C'est volontaire : ça vaut accusé de réception.

### Échéances et archivage

L'échéance est une `date` sans heure ni fuseau : « pour le 12 » ne doit pas
dépendre du fuseau du lecteur. La carte affiche une formulation relative
(« demain », « dans 5 j », « 4 j de retard »), mise en évidence dès que la date
est passée, et masquée une fois la carte terminée.

La colonne « Fait » grossit sans fin. Les cartes terminées depuis plus de 30
jours passent derrière un lien « voir l'historique » ; c'est `done_at` qui en
décide, horodaté à l'entrée en « Fait » et effacé si la carte en ressort.
`updated_at` ne pourrait pas jouer ce rôle, la moindre correction le remettant à
zéro.

### Icônes

[Phosphor Icons](https://phosphoricons.com) (licence MIT). Les pictogrammes
retenus sont rassemblés dans `src/components/icons.ts` sous des noms d'usage
(`IconOverdue` plutôt que `Warning`) : un seul endroit à modifier pour en changer
un. `next.config.ts` réécrit ces imports vers les modules individuels, sans quoi
le barrel de la bibliothèque ralentirait beaucoup la compilation.

Les icônes de l'application elle-même viennent du même jeu — le cube Phosphor
sur fond orange — et se régénèrent avec `python3 scripts/generate-icons.py`
(voir l'en-tête du script pour les deux dépendances Python). Les PNG sont
versionnés : ce script ne tourne ni au build ni au déploiement.

Les emojis subsistent dans le **texte des notifications** (`🖨️`, `📦`, `💬`) :
ce sont des messages Telegram ou ntfy en texte brut, où une icône vectorielle
n'aurait pas de sens.

### Le décompte des messages, et un piège Drizzle

`src/db/queries.ts` compte les messages par jointure agrégée, et non par
sous-requête corrélée. Dans un template `sql`, Drizzle ne préfixe la colonne du
nom de sa table **que si la requête comporte une jointure**. Sans jointure,
`(select count(*) from comments where comments.card_id = cards.id)` se rend
`… where "card_id" = "id"`, et dans la sous-requête `"id"` désigne
`comments.id` : le décompte vaut zéro partout, sans la moindre erreur SQL. Le
commentaire dans le fichier le rappelle.
