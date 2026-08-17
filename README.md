# Kanban3D

Un tableau d'impressions 3D partagé à deux. **On colle le lien d'un modèle**
(Printables, MakerWorld, Thingiverse, Cults3D…) **et la carte se crée toute
seule** dans « À imprimer », titre, image, auteur et coût d'impression compris —
durée, filament, matière, nombre de pièces. Il ne reste plus qu'à la faire
avancer de colonne au fil de l'impression.

**À imprimer → En impression → Fait.** Pas de compte, pas de collection, pas
d'export : un seul écran, un code partagé.

Quantité, couleur, remarque et échéance se règlent ensuite dans le panneau
latéral, si besoin — le plus souvent il n'y en a pas. Chaque carte a aussi son
fil de discussion, et une notification part sur vos téléphones à chaque demande,
chaque déplacement et chaque message.

---

## Mise en ligne sur Netlify

Trois étapes, aucune commande à taper.

### 1. Créer le site

Sur [app.netlify.com](https://app.netlify.com) : **Add new site → Import an
existing project**, puis choisir ce dépôt. La commande de build et le dossier
publié sont déjà décrits dans `netlify.toml`, il n'y a rien à saisir.

### 2. Brancher une base Postgres

Le plus simple est **[Neon](https://neon.com)** : compte gratuit, sans carte
bancaire. Créez un projet, copiez la chaîne de connexion qu'il affiche
(`postgresql://…?sslmode=require`), et posez-la dans Netlify sous le nom
`DATABASE_URL` à l'étape suivante.

Les tables sont créées automatiquement au premier déploiement : la commande de
build applique les migrations avant de construire le site.

<details>
<summary>Variante : Netlify Database</summary>

**Project configuration → Database** provisionne un Postgres sans quitter
Netlify, et pose `NETLIFY_DB_URL` de lui-même — aucune variable à saisir.

Attention : **Netlify Database n'est disponible que sur les offres à crédits.**
Sur les autres, la création échoue, et Neon est alors la voie à suivre.

L'application accepte les deux, plus l'ancien `NETLIFY_DATABASE_URL` de
l'extension d'avant avril 2026. L'ordre de lecture est dans
`src/lib/databaseUrl.ts`.

</details>

### 3. Poser les variables d'environnement

Dans **Project configuration → Environment variables** :

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | la chaîne de connexion Neon de l'étape 2 (inutile avec Netlify Database) |
| `APP_PIN` | le code que vous partagez avec votre frère, par ex. `4271` |
| `APP_SECRET` | une chaîne aléatoire, obtenue avec `openssl rand -hex 32` |

Ces variables ne sont lues qu'au déploiement : après les avoir posées ou
modifiées, relancez un déploiement pour qu'elles prennent effet.

`APP_SECRET` sert à signer le cookie de session. Changer `APP_PIN` déconnecte
automatiquement tout le monde.

Ajoutez-y aussi, si vous voulez les notifications, les variables d'un des trois
canaux décrits dans `.env.example` — le plus simple étant `TELEGRAM_BOT_TOKEN` +
`TELEGRAM_CHAT_ID`. Sans elles, l'application marche mais n'envoie rien.

Et `THINGIVERSE_TOKEN`, si vous collez des liens Thingiverse : c'est la seule
plateforme dont les pages sont bloquées lorsqu'elles sont demandées depuis un
hébergeur (voir « Le cas Thingiverse » plus bas).

Puis **Deploys → Trigger deploy**. À la première visite, le site demande le code,
puis qui vous êtes.

### Si quelque chose ne va pas

Le build réussit même mal configuré, parce qu'il ne touche pas à la base quand
`DATABASE_URL` est absente. Un déploiement vert ne prouve donc pas que tout est en
place :

| Symptôme | Cause |
| --- | --- |
| Le code est refusé avec « L'application n'est pas configurée » | `APP_PIN` ou `APP_SECRET` manque |
| Le journal de build affiche « aucune chaîne de connexion » | `DATABASE_URL` manque, ou la base Netlify n'est pas activée |
| Le tableau affiche un écran de configuration | il nomme lui-même la cause et les gestes à faire |

## En local

```bash
npm install
cp .env.example .env.local     # puis remplir les trois variables
npm run db:migrate             # crée les tables
npm run dev                    # http://localhost:3000
```

Pour un Postgres local, `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kanban3d`.
La même variable sert en production quand la base vient de Neon ; avec Netlify
Database, c'est `NETLIFY_DB_URL` qui prend le relais et il n'y a rien à saisir.

Autres commandes :

| Commande | Rôle |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | vérification TypeScript |
| `npm run build` | construction de production |
| `npm run test:platforms` | interroge les quatre plateformes et signale celle qui a changé |
| `npm run format` | Prettier sur `src` et les fichiers de configuration |
| `npm run db:generate` | produit une migration après une modification de `src/db/schema.ts` |
| `npm run db:migrate` | applique les migrations en attente |

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

| Plateforme | Ce qu'on obtient | Comment |
| --- | --- | --- |
| **Printables** | titre, image, auteur, **coût d'impression** | API GraphQL `api.printables.com` — la page HTML est bloquée par Cloudflare, l'API non |
| **MakerWorld** | titre, image, auteur, **coût d'impression** | API REST `makerworld.com/api/v1/design-service/design/{id}` |
| **Thangs** | titre, image, auteur, nombre de fichiers | API publique `thangs.com/api/models/{id}`, sans clé. Les liens courts `than.gs/m/{id}` sont reconnus |
| **Thingiverse** | titre, image, auteur | API officielle si `THINGIVERSE_TOKEN` est posé, sinon les balises OpenGraph de la page |
| **Cults3D** | titre, image, auteur | OpenGraph + JSON-LD |
| **MyMiniFactory** | titre, image | JSON-LD seul : ce site n'a aucune balise `og:title` |
| Creality Cloud, Pinshape, Fab365 | titre, badge, image selon les pages | voie générique. Reconnues pour le badge et le titre de repli, sans plus de garantie — leurs pages se construisent en JavaScript |
| tout le reste | ce que la page veut bien dire | OpenGraph, puis JSON-LD, puis `<title>`, puis le nom déduit de l'URL |

Le suffixe d'une URL n'a pas d'importance : `/model/72753-nom/files`,
`/comments`, un `#fragment` — la détection porte sur l'identifiant, le reste du
chemin est ignoré.

Cette fonction **n'échoue jamais** : si une plateforme ne répond pas, la carte se
crée quand même avec un titre déduit de l'URL, à corriger à la main. C'est utile
en pratique — Cults3D refuse parfois les requêtes selon l'adresse IP appelante.

Deux pièges de lecture, rencontrés pour de vrai :

- **Une redirection silencieuse.** Un lien Pinshape mort ne répond pas 404 : il
  redirige vers l'accueil et renvoie 200. Sans garde-fou, la carte s'appelait
  « Pinshape — 3D Marketplace for Designers ». `keptItsIdentity()` vérifie donc que
  la page servie parle encore du modèle demandé — l'identifiant numérique doit
  survivre à la redirection, et l'on refuse les atterrissages sur `/index`,
  `/login`, `/search`…
- **Le poids qui n'en est pas un.** Thangs expose un champ `profileWeight` : c'est
  un poids de classement, pas des grammes de filament. Il n'est pas utilisé.

### Le cas Thingiverse

Thingiverse est la seule plateforme dont les pages de modèles sont **bloquées
lorsqu'elles sont demandées depuis un hébergeur**. Mesuré sur la production : la
page d'accueil du site répond, les pages `/thing:*` non, tandis que Printables et
Cults3D passent sans problème. Depuis un poste de développement tout fonctionne —
c'est pourquoi la panne ne se voit qu'en ligne, tests verts à l'appui.

Le remède est son API officielle : créez une application sur
[thingiverse.com/apps/create](https://www.thingiverse.com/apps/create) (gratuit,
immédiat), relevez l'« App Token » et posez-le dans `THINGIVERSE_TOKEN`. Il est
alors essayé **avant** la lecture de page. Sans jeton, rien ne casse : la carte
arrive nommée « Thingiverse 5564110 », à renommer dans le panneau.

### Coût d'impression

Au-delà du titre, de l'image et de l'auteur, les cartes portent ce que
l'impression va coûter : **durée**, **filament**, **matière**, et le nombre de
**pièces** et de **fichiers** — ce dernier prévenant qu'il y a un assemblage.
La carte les résume en une ligne (« 3 h 14 · 39 g · PETG »), le panneau les rend
modifiables.

Deux plateformes les publient, chacune à sa façon, et c'est là qu'est le piège :

| Plateforme | Champs | Unité d'origine |
| --- | --- | --- |
| Printables | durée, poids, matière, pièces, fichiers | durée en **heures décimales** (`3.24` = 3 h 14) |
| MakerWorld | durée, poids, matière | durée en **secondes**, à sommer sur toutes les plaques |

Tout est stocké en minutes et en grammes. Mesuré sur quinze modèles Printables :
le nombre de fichiers remonte toujours, la durée, le poids et le nombre de pièces
une fois sur trois, la matière jamais — l'auteur remplit ce qu'il veut. D'où le
principe : **rempli tout seul quand c'est disponible, modifiable partout**, la
saisie primant toujours sur la plateforme. `npm run test:platforms` affiche ce
que chaque plateforme donne réellement aujourd'hui.

Zéro est traité comme « non renseigné » : les plateformes l'emploient dans ce
sens, et « 0 minute » ne veut rien dire sur une carte.

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

### Migrations

Le schéma est appliqué par des migrations versionnées (`drizzle/`), et non par
`drizzle-kit push`. C'est ce qui permet de faire tourner l'opération
automatiquement au déploiement : `push` re-compare le schéma à chaque exécution et
peut supprimer une colonne sans prévenir, là où une migration est déterministe et
n'est jouée qu'une fois — Drizzle tient son journal dans la base.

`scripts/migrate.mjs` encadre l'appel : il ne fait rien sans `DATABASE_URL`, pour
qu'un build hors ligne reste possible, mais interrompt le déploiement si une
migration échoue alors que la base est joignable. Mieux vaut un déploiement rouge
qu'un site en ligne dont le schéma ne correspond pas au code.

Après avoir modifié `src/db/schema.ts` : `npm run db:generate`, puis commiter le
fichier SQL produit. Le déploiement s'occupe du reste.

La première migration porte des gardes `IF NOT EXISTS` ajoutées à la main, que
drizzle-kit ne produit pas : une base créée auparavant avec `db:push` possède déjà
les tables sans posséder le journal, et le premier déploiement échouerait sans
elles.

### Le décompte des messages, et un piège Drizzle

`src/db/queries.ts` compte les messages par jointure agrégée, et non par
sous-requête corrélée. Dans un template `sql`, Drizzle ne préfixe la colonne du
nom de sa table **que si la requête comporte une jointure**. Sans jointure,
`(select count(*) from comments where comments.card_id = cards.id)` se rend
`… where "card_id" = "id"`, et dans la sous-requête `"id"` désigne
`comments.id` : le décompte vaut zéro partout, sans la moindre erreur SQL. Le
commentaire dans le fichier le rappelle.
