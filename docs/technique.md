# Kanban3D — notes techniques

Le [README](../README.md) dit ce que fait l'application. Ce fichier dit **comment
elle est faite, et pourquoi ainsi** : mise en ligne, développement local, et les
décisions une par une avec les pièges rencontrés en route. C'est ce qu'il faut
avoir lu avant de modifier quelque chose.

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

Dans **Project configuration → Environment variables**. Trois obligatoires :

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | la chaîne de connexion Neon de l'étape 2 (inutile avec Netlify Database) |
| `APP_PIN` | le code que vous partagez avec votre frère, par ex. `4271` |
| `APP_SECRET` | une chaîne aléatoire, obtenue avec `openssl rand -hex 32` |

`APP_SECRET` sert à signer le cookie de session. Changer `APP_PIN` déconnecte
automatiquement tout le monde.

Et quatre facultatives, chacune allumant une fonctionnalité :

| Variable | Ce qu'elle apporte | Sans elle |
| --- | --- | --- |
| `FILAMENT_PRICE_PER_KG` | le coût estimé sur les cartes et les totaux de colonne | aucun prix n'est affiché, nulle part |
| `THINGIVERSE_TOKEN` | les cartes Thingiverse remontent titre, image et auteur | elles arrivent nommées « Thingiverse 5564110 » |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | les notifications sur vos téléphones | l'application marche, mais n'envoie rien |
| `NTFY_TOPIC` ou `NOTIFY_WEBHOOK_URL` | les mêmes, par un autre canal | idem |

Le détail de chacune, avec le mode opératoire, est dans `.env.example`.

⚠️ **Ces variables ne sont lues qu'au déploiement.** Les poser ne suffit pas : il
faut ensuite **Deploys → Trigger deploy**, sans quoi l'application continue de
tourner sans les voir — un prix qui n'apparaît pas ou un jeton qui semble ignoré
est presque toujours cela.

À la première visite, le site demande le code, puis qui vous êtes.

### Si quelque chose ne va pas

Le build réussit même mal configuré, parce qu'il ne touche pas à la base quand
`DATABASE_URL` est absente. Un déploiement vert ne prouve donc pas que tout est en
place :

| Symptôme | Cause |
| --- | --- |
| Le code est refusé avec « L'application n'est pas configurée » | `APP_PIN` ou `APP_SECRET` manque |
| Le journal de build affiche « aucune chaîne de connexion » | `DATABASE_URL` manque, ou la base Netlify n'est pas activée |
| Le tableau affiche un écran de configuration | il nomme lui-même la cause et les gestes à faire |
| Une variable posée ne change rien | aucun déploiement n'a eu lieu depuis : **Deploys → Trigger deploy** |
| Les cartes Thingiverse ou Thangs arrivent sans nom propre | [ces plateformes bloquent les hébergeurs](#les-plateformes-qui-refusent-les-serveurs) |

## En local

```bash
npm install
cp .env.example .env.local     # puis remplir DATABASE_URL, APP_PIN, APP_SECRET
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
| `npm run test:platforms` | interroge réellement chaque plateforme et signale celle qui a changé |
| `npm run format` | Prettier sur `src` et les fichiers de configuration |
| `npm run db:generate` | produit une migration après une modification de `src/db/schema.ts` |
| `npm run db:migrate` | applique les migrations en attente |

Deux images se régénèrent à la main, et ne tournent ni au build ni au
déploiement :

```bash
python3 scripts/generate-icons.py   # les icônes de l'app, dans public/
node scripts/generate-og.mjs        # l'image de partage, public/og.png
```

Les captures du README se refont en deux commandes, sur une base locale :

```bash
node scripts/seed-demo.mjs      # jeu de démonstration (efface les cartes !)
node scripts/screenshots.mjs    # écrit dans docs/images/
```

Elles demandent Playwright, qui n'est pas une dépendance du projet :
`npm install --no-save playwright`. Chaque carte du jeu de démonstration naît
d'un vrai lien résolu par le serveur — ce que montrent les captures est donc ce
que l'application produit réellement.

---

## Comment ça marche

Les décisions, une par une, avec les pièges rencontrés en route.

### Où se trouve quoi

```
src/
  app/
    page.tsx                     le tableau, rendu côté serveur avec ses cartes
    login/page.tsx               l'écran du code
    api/cards/route.ts           GET la liste · POST une carte (résout le lien)
    api/cards/[id]/route.ts      PATCH modifier ou déplacer · DELETE
    api/cards/[id]/comments/     le fil de discussion
    api/cards/[id]/photo/        la photo du résultat (octets, hors du tableau)
    api/auth/route.ts            POST le code -> cookie signé
  components/
    Board.tsx                    l'état du tableau, le rafraîchissement, dnd-kit
    Column.tsx  CardTile.tsx     une colonne, une carte
    CardPanel.tsx                le détail, en panneau latéral
    AddUrlBar.tsx                le champ de collage
    CommentThread.tsx            la discussion
    PhotoField.tsx               prise et envoi de la photo
    Thumbnail.tsx                vignette, CDN, et repli nommé
    LoginForm.tsx                la saisie du code
    SetupNeeded.tsx              l'écran de diagnostic d'une base absente
    icons.ts                     tous les pictogrammes, sous des noms d'usage
  lib/
    metadata.ts                  les adaptateurs de plateformes — le cœur technique
    printInfo.ts                 mise en forme des durées, poids, prix, totaux
    photo.ts                     redimensionnement dans le navigateur
    board.ts  cards.ts           positions, déplacements, nettoyage des saisies
    auth.ts                      cookie HMAC
    notify.ts                    Telegram, ntfy, webhook
    dates.ts  settings.ts        échéances, archivage, réglages d'environnement
    images.ts  databaseUrl.ts    Image CDN de Netlify, noms de variables acceptés
    people.ts  useIdentity.ts    les deux prénoms, et lequel est cet appareil
  db/
    schema.ts  queries.ts        les trois tables, et le décompte des messages
drizzle/                         les migrations, versionnées
scripts/                         migration, test des plateformes, captures
docs/images/                     les captures du README
```

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
- **Le titre qui n'est que la marque.** Fab365 sert « FAB365 » comme `og:title` sur
  toutes ses fiches. Un titre égal au nom de la plateforme est donc refusé, et
  l'URL fournit un meilleur nom : « Star wars x wing ».

### Les plateformes qui refusent les serveurs

Deux plateformes filtrent selon l'adresse qui appelle, et **bloquent les
hébergeurs**. Mesuré sur la production, pas déduit : depuis Netlify, la page
d'accueil de Thingiverse répond mais pas ses pages `/thing:*`, et `thangs.com` ne
répond pas du tout — tandis que Printables, MakerWorld, Cults3D et MyMiniFactory
passent sans problème. Depuis un poste de développement tout fonctionne, c'est
pourquoi la panne ne se voit qu'en ligne, tests verts à l'appui.

**Thingiverse** a un remède : son API officielle. Créez une application sur
[thingiverse.com/apps/create](https://www.thingiverse.com/apps/create) (gratuit,
immédiat), relevez l'« App Token » et posez-le dans `THINGIVERSE_TOKEN`. Il est
alors essayé **avant** la lecture de page.

**Thangs** n'en a pas : son API est sur le domaine bloqué, et il n'existe pas de
jeton à demander. Un lien Thangs collé depuis le téléphone donne donc une carte
sans image ni auteur — mais avec le bon titre, l'adresse le contenant :
`…/3d-model/Customizable Alphabet Clicker & Keychain-1501622` devient
« Customizable Alphabet Clicker & Keychain ».

C'est tout l'intérêt du repli : il n'échoue jamais, et il travaille l'adresse
plutôt que d'abandonner. L'identifiant de fin est retiré (au moins quatre
chiffres, pour ne pas manger le « v2 » d'une version), les segments d'un seul
caractère sont sautés — sans quoi un lien court `than.gs/m/1501622` donnerait une
carte nommée « M » — et le nom de la plateforme sert de dernier recours :
« Thangs 1501622 » plutôt qu'un domaine nu.

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

**Le prix et les totaux.** `FILAMENT_PRICE_PER_KG` allume l'estimation du coût.
Une carte chiffre **une** pièce, comme la durée et le poids affichés à côté ; un
total de colonne, lui, multiplie par les quantités — c'est le mot « total » qui
lève l'ambiguïté, plutôt qu'une note en petits caractères. Le tilde de « ~0,97 € »
n'est pas décoratif : le poids vient d'un arrondi de la plateforme et le prix
d'une moyenne.

### La photo du résultat

`card_photos`, table à part, et non colonne de `cards` — c'est la seule décision
importante ici. Le tableau se rafraîchit toutes les dix secondes ; une photo
stockée dans la ligne repartirait au navigateur à chaque fois, soit des mégaoctets
par minute pour une image qu'on regarde une fois. La carte ne transporte donc que
`photo_at`, et l'image se télécharge par `GET /api/cards/{id}/photo`.

Cette date sert aussi de numéro de version : l'URL porte `?v=<photo_at>`, ce qui
permet un `Cache-Control: immutable` d'un an sans qu'une photo remplacée reste
masquée par l'ancienne. `private`, parce que ces images vivent derrière un code
partagé et n'ont rien à faire dans un cache intermédiaire.

Le redimensionnement a lieu **dans le navigateur** (`src/lib/photo.ts`, canvas,
1600 px, JPEG 0,82) : c'est celui qui prend la photo qui est au bout du wifi, pas
le serveur. Effet de bord bienvenu, le passage par le canvas efface les
métadonnées EXIF — dont la position GPS, qu'on n'a aucune raison de stocker.

Le serveur ne fait pas confiance pour autant : formats limités à JPEG, PNG et
WebP, 3 Mo maximum. La clé primaire est la carte elle-même — une photo par carte,
la deuxième remplace la première — et la suppression en cascade emporte la photo
avec la carte.

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

**Ce que cette protection ne fait pas**, pour que ce soit dit : il n'y a aucune
limitation du nombre d'essais. Un code à cinq chiffres sur une adresse publique se
teste donc entièrement en quelques heures par un script. C'est un choix assumé — le
tableau ne contient que des liens vers des modèles publics et des remarques du
genre « plutôt en noir » — mais si un jour son contenu devient sensible, c'est la
première chose à revoir. Un code plus long élève la barre à peu de frais.

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

### L'image de partage

`public/og.png` (1200×630), déclarée dans `src/app/layout.tsx` et régénérée par
`node scripts/generate-og.mjs`. Sans elle, un lien partagé dans iMessage n'affiche
qu'un titre et un domaine, et a l'air mort.

Quatre points qui comptent plus qu'on ne croit :

- **URL absolue obligatoire.** `metadataBase` est construit depuis
  `process.env.URL`, que Netlify fournit, avec repli sur le domaine connu. La
  plupart des robots d'aperçu ignorent une `og:image` relative.
- **L'image doit être lisible sans session.** C'est un fichier statique de
  `public/` : les robots d'aperçu n'ont pas de cookie, une image servie par une
  route authentifiée ne s'afficherait jamais.
- **`robots: { index: false }` ne gêne pas les aperçus.** iMessage, WhatsApp et
  Slack ne consultent pas robots.txt avant de déplier un lien. Le tableau reste
  donc hors des moteurs de recherche tout en s'affichant correctement quand on
  l'envoie.
- **Le lien partagé est la racine, qui redirige.** Un robot sans session reçoit un
  307 vers `/login` ; les balises vivant dans le layout racine, il les trouve au
  bout de la redirection. Les principaux robots la suivent — mais c'est la raison
  pour laquelle ces balises doivent rester dans le layout et non dans la page.

La mise en page est typographique plutôt qu'une capture d'écran, pour deux
raisons : elle reste déchiffrable réduite à 120 px de large (la taille réelle
d'une vignette WhatsApp, vérifiée), et elle ne vieillit pas à chaque évolution de
l'interface. Le cube est lu depuis le paquet Phosphor, à l'endroit même où
`generate-icons.py` le lit : l'icône de l'application et l'image de partage ne
peuvent pas diverger. Tout le contenu tient dans le carré central, de sorte qu'un
rognage en 1:1 conserve l'essentiel.

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

Plusieurs migrations portent des gardes `IF NOT EXISTS` ajoutées à la main, que
drizzle-kit ne produit pas : une base créée auparavant avec `db:push` possède déjà
les tables sans posséder le journal, et le premier déploiement échouerait sans
elles. Les migrations suivantes gardent l'habitude — un `ADD COLUMN` ou un
`CREATE TABLE` idempotent ne coûte rien, et évite qu'un schéma modifié à la main un
soir de dépannage ne bloque le déploiement du lendemain.

L'état actuel, cinq migrations :

| | Contenu |
| --- | --- |
| `0000` | `cards` et `comments`, avec `due_date` et `done_at` |
| `0001` | `auth_attempts` — la limitation du nombre d'essais |
| `0002` | suppression de `auth_attempts` : le bridage a été retiré |
| `0003` | durée, filament, matière, nombre de pièces et de fichiers |
| `0004` | `card_photos` et `cards.photo_at` |

La 0001 est conservée plutôt qu'effacée : une base déjà déployée a joué cette
migration, et retirer un fichier du journal ferait diverger le compte. On n'efface
pas l'histoire, on ajoute la suite.

### Ce qui est vérifié, et comment

Il n'y a pas de suite de tests unitaires dans le dépôt : à cette taille, elle
testerait surtout la mise en forme de chaînes. Ce qui est vérifié l'est de bout en
bout, sur un Postgres local et un vrai navigateur, avec des captures à l'appui.

| Ce qui est couvert | Comment |
| --- | --- |
| Les plateformes répondent comme prévu | `npm run test:platforms`, qui les interroge réellement |
| Créer, modifier, déplacer, supprimer une carte | parcours Playwright, avec rechargement pour vérifier la persistance |
| Réordonner dans une colonne | positions relues après coup, et vérifiées distinctes |
| Discussion, échéances, archivage | idem, y compris le compteur de messages |
| Coût d'impression et prix | valeurs saisies, effacées, bornées, et leur mise en forme |
| Photo | dépôt, remplacement, cache, format refusé, suppression en cascade |
| Contraste AA dans les deux thèmes | mesure du rapport réel sur les éléments rendus |
| Mobile | 375 / 393 / 430 px : débordement, cibles tactiles, taille des champs |

Les scripts de captures (`scripts/screenshots.mjs`) servent aussi de vérification
visuelle : ils passent par l'interface, pas par la base.

### Le décompte des messages, et un piège Drizzle

`src/db/queries.ts` compte les messages par jointure agrégée, et non par
sous-requête corrélée. Dans un template `sql`, Drizzle ne préfixe la colonne du
nom de sa table **que si la requête comporte une jointure**. Sans jointure,
`(select count(*) from comments where comments.card_id = cards.id)` se rend
`… where "card_id" = "id"`, et dans la sous-requête `"id"` désigne
`comments.id` : le décompte vaut zéro partout, sans la moindre erreur SQL. Le
commentaire dans le fichier le rappelle.
