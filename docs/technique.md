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

Deux détails de ce duo : le jeu de démonstration affiche en clair la requête SQL
qui recule une date de fin (l'API ne le permet pas, et c'est bien ainsi), et les
deux captures de l'imprimante ne sont prises que si `PRINTER_DEMO_URL` désigne une
source d'état — aucune adresse d'imprimante n'est codée en dur, elles sont
sensibles.

**Ne faites pas tourner deux `next dev` sur ce dossier en même temps.** Ils
partagent `.next` et s'écrasent mutuellement : le symptôme est une page qui répond
`404` ou `500` avec un `Cannot find module './331.js'` ou un `Unexpected end of JSON
input`, sans rapport avec le code. Et un `npm run build` lancé pendant qu'un serveur
de développement tourne produit exactement le même désordre.

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
    api/printer/route.ts         GET le dernier état (rafraîchi si > 20 s) · PATCH la config
    api/printer/test/route.ts    POST interroge sans rien enregistrer, et diagnostique
    api/printer/webhook/route.ts POST les événements poussés par OctoEverywhere
    api/printer/snapshot/        GET l'aperçu webcam, servi par nous
    api/notifications/           GET/PATCH la destination · POST /test l'envoie vraiment
    reglages/page.tsx            imprimante et notifications
  components/
    Board.tsx                    l'état du tableau, le rafraîchissement, dnd-kit
    Column.tsx  CardTile.tsx     une colonne, une carte
    CardPanel.tsx                le détail, en panneau latéral
    AddUrlBar.tsx                le champ de collage
    CommentThread.tsx            la discussion
    PhotoField.tsx               prise et envoi de la photo
    PrinterStrip.tsx             le bandeau d'état, au-dessus des colonnes
    PrinterSettings.tsx          le formulaire de l'imprimante
    NotificationSettings.tsx     où partent les notifications
    Greeting.tsx                 le mot d'accueil qui s'écrit
    Thumbnail.tsx                vignette, CDN, et repli nommé
    LoginForm.tsx                la saisie du code
    SetupNeeded.tsx              l'écran de diagnostic d'une base absente
    icons.ts                     tous les pictogrammes, sous des noms d'usage
  lib/
    metadata.ts                  les adaptateurs de plateformes — le cœur technique
    printer.ts                   OctoEverywhere : URL, lecture, webhooks, redirections
    printerSync.ts               les transitions, et le tableau qui s'avance tout seul
    printerView.ts               ce que le navigateur a le droit de savoir de la machine
    notifySettings.ts            d'où vient la configuration des notifications
    notifyEvents.ts              les six déclencheurs, et le filtre — sans base
    printInfo.ts                 mise en forme des durées, poids, prix, totaux
    photo.ts                     redimensionnement dans le navigateur
    board.ts  cards.ts           positions, déplacements, nettoyage des saisies
    auth.ts                      cookie HMAC
    notify.ts                    Telegram, ntfy, webhook
    dates.ts  settings.ts        archivage, réglages d'environnement
    images.ts  databaseUrl.ts    Image CDN de Netlify, noms de variables acceptés
    people.ts  useIdentity.ts    les deux prénoms, et lequel est cet appareil
  db/
    schema.ts  queries.ts        les tables, et le décompte des messages
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

### Priorité et classement

Trois niveaux stockés en entier — `0` tranquille, `1` normal, `2` urgent — et un
défaut à `1`. `columnCards()` (`src/lib/board.ts`) trie « À imprimer » par priorité
décroissante puis par `position` ; les deux autres colonnes gardent l'ordre manuel,
qui y raconte autre chose (l'ordre de passage, l'ordre de finition).

**Le piège, et il a mordu :** trier une colonne casse le glisser-déposer si les
positions sont calculées d'après les voisins *affichés*. Une carte lâchée entre
deux cartes d'un autre niveau reçoit une position cohérente avec ce qu'on voit à
l'écran, mais incohérente avec le tri — au rechargement, elle est revenue à sa
place. `resolveDrop()` reconstruit donc la liste telle qu'elle sera après le dépôt,
puis lit les voisins **à l'intérieur de la bande de priorité visée** :

```ts
const bande = targetStatus === 'todo' ? après.filter((c) => c.priority === niveau) : après
const i = bande.findIndex((card) => card.id === activeId)
return {
  status: targetStatus,
  position: positionBetween(bande[i - 1]?.position, bande[i + 1]?.position),
  ...(changeDeNiveau ? { priority: niveau } : {}),
}
```

Conséquence voulue : faire monter une carte dans le bloc « Urgent » la rend
urgente. Sans cela elle repartirait sous l'œil, ce qui est le défaut classique
d'une colonne triée.

L'échéance a été **retirée de l'interface** au profit de la priorité : la question
n'était jamais « pour quand » mais « laquelle d'abord ». La colonne `due_date`
reste en base, sans écran pour l'écrire — la supprimer coûterait une migration
destructrice pour rien.

### Multi-couleur

`multi_color` (booléen) et `color_count` (entier facultatif). Aucune logique, juste
une annonce : Alexandre voit avant de lancer s'il doit monter le Canvas, au lieu de
le découvrir au premier changement de filament. `columnTotals()` le mentionne dès
qu'une carte du lot le demande.

### Archivage

La colonne « Fait » grossit sans fin. Les cartes terminées depuis plus de 30
jours passent derrière un lien « voir l'historique » ; c'est `done_at` qui en
décide, horodaté à l'entrée en « Fait » et effacé si la carte en ressort.
`updated_at` ne pourrait pas jouer ce rôle, la moindre correction le remettant à
zéro.

### L'imprimante, via OctoEverywhere

**OctoPrint ne convient pas**, et ce n'est pas un choix : la Centauri Carbon
n'expose pas de liaison série, OctoPrint ne sait donc pas lui parler.
OctoEverywhere, si — son compagnon tourne sur le NAS et prend en charge les
imprimantes Elegoo. Les deux noms se ressemblent, les deux logiciels non.

#### Le « Live Link » et son API

Un Live Link est une page publique en lecture seule qu'OctoEverywhere crée pour
partager une imprimante : `https://octoeverywhere.com/live/<id>`. Cette page
s'alimente d'une API que l'on peut appeler directement :

```
GET https://octoeverywhere.com/api/live/status?id=-<id>
```

Rien de tout cela n'est documenté publiquement ; c'est relevé dans le code de la
page elle-même. Trois détails, tous vérifiés contre le service réel :

1. **l'identifiant est préfixé** — d'un tiret pour un lien `/live/`, d'un point pour
   un lien `/view/` (la « vue rapide »). Sans préfixe, l'API répond
   `{"Status":400,"Error":"Invalid Id"}` ; avec le mauvais, `401` ;
2. **l'hôte générique redirige** vers le serveur régional (`lon.octoeverywhere.com`
   depuis l'Europe). Il faut donc suivre la redirection ;
3. **aucune authentification** : l'identifiant du lien *est* le sésame. C'est ce qui
   rend cette voie utilisable depuis un hébergeur — rien à ouvrir sur le réseau
   d'Alexandre, rien à installer, et le lien se révoque d'un clic chez lui.

Corollaire de ce troisième point : **cette adresse est un secret**. Elle donne
l'état de la machine et l'accès à sa webcam à qui la possède. Elle n'a sa place ni
dans le dépôt, ni dans une capture d'écran — d'où l'adresse d'exemple dans l'image
du README, et la variable `PRINTER_DEMO_URL` de `scripts/screenshots.mjs`.

La réponse porte `Status` (un libellé en clair, pas un énuméré), `StatusColor`,
`Progress` (0–100, une décimale), `TimeElapsedSec`, `TimeRemainSec`, `IsPaused`,
`IsInHostErrorState`, `IsTimeFlowing`, `FileName` et les températures buse et
plateau. Pas de compte de couches, contrairement à l'autre API.

#### Ce que l'application en fait

`src/lib/printer.ts` convertit tout dans une seule forme (`PrinterReading`), en
reconnaissant la réponse **aux champs présents** plutôt qu'à l'URL appelée : c'est
la réponse qui décide, pas notre supposition. Deux formes sont acceptées, celle du
Live Link et celle des « Shared Connection »
(`/octoeverywhere-command-api/status`, dont l'authentification n'est, elle, pas
élucidée), plus les webhooks entrants.

Trois décisions valent d'être notées :

- **l'état est affiché tel quel quand on ne le connaît pas.** `Status` est un
  libellé humain, et sa liste n'est pas publiée : `printerStateLabel()` traduit ce
  qu'il connaît, reconnaît les familles (`… Connection Lost` → « liaison perdue »)
  et **laisse passer le reste en anglais**. Le site officiel fait exactement pareil.
  Un « état inconnu » n'apprendrait rien à personne ;
- **« imprime-t-elle ? » est tranché côté serveur**, et stocké (`printing`). Ni le
  libellé ni le chronomètre ne suffisent seuls — le libellé peut être inconnu, et un
  temps qui s'écoule ne dit pas si la machine est en pause — donc on croise les deux,
  une pause ou une erreur d'hôte tranchant dans tous les cas ;
- **les deux secrets ne repartent jamais vers le navigateur.** L'API renvoie
  `hasSecret` / `hasWebhookToken`, le champ affiche « configurée », on ne peut que
  remplacer.

#### Les redirections, et la limite du garde-fou

`isPubliclyRoutable()` (partagé avec la lecture des métadonnées) refuse les adresses
privées : c'est le serveur qui va chercher une URL saisie par l'utilisateur, de quoi
sonder le réseau de l'hébergeur. Mais **contrôler l'entrée ne suffit pas** : une URL
publique qui répond `302 → http://10.0.0.7/` ferait exactement ce qu'on voulait
empêcher. Les redirections sont donc suivies à la main (`redirect: 'manual'`), trois
au plus, et **chaque saut est revalidé**. Un parcours de test le vérifie, avec un
nom d'apparence publique qui redirige vers une adresse interne.

Toutes les récupérations passent par là, y compris l'aperçu webcam et la photo de
fin : une seule porte, un seul contrôle.

Limite assumée : le garde-fou lit le nom d'hôte, il ne résout pas le DNS. Un nom
public pointant vers une adresse privée passe donc. Résoudre soi-même n'y suffirait
pas complètement — entre la vérification et l'appel, la résolution peut changer — et
le jeu n'en vaut pas la chandelle ici : les seules URL que le serveur va chercher
sont un lien de modèle et une adresse d'imprimante, tous deux saisis derrière le
code d'accès.

`PRINTER_ALLOW_PRIVATE=1` lève l'interdiction, pour le cas réel d'une application
hébergée chez soi sur le même réseau que l'imprimante. Jamais actif par défaut.

#### Fraîcheur

`GET /api/printer` ne rappelle la machine que si la ligne a plus de 20 secondes :
le tableau se recharge toutes les dix secondes, à deux, sur plusieurs onglets — sans
ce cache, le NAS serait interrogé des dizaines de fois par minute. Le bandeau, lui,
demande **une fois à l'arrivée** puis toutes les 20 secondes : le premier rendu vient
de la base, et l'état qui y dort peut avoir plusieurs minutes — attendre le premier
tour d'horloge afficherait « terminée » sur une impression en cours.

Machine injoignable : l'erreur est enregistrée mais **l'état précédent est
conservé**. « il y a 4 min, 47 % » vaut mieux qu'un écran vide, et le bandeau
affiche l'âge dès qu'il dépasse 90 secondes.

Le webhook (`POST /api/printer/webhook?token=…`) est la voie de secours. Son jeton
est comparé en temps constant, sur des empreintes SHA-256, comme le code d'accès —
c'est la seule route de l'application qui n'exige pas le cookie de session, puisque
c'est un service qui l'appelle. Il ne remplace que les champs qu'il porte : un
événement de progression ne dit rien des températures, et les écraser par des `null`
ferait clignoter le bandeau.

#### Ce que je n'ai pas pu vérifier

L'authentification de l'API des « Shared Connection » reste inconnue : la page qui
devrait l'expliquer ne l'explique pas, et le Live Link ayant réglé le problème, il
n'y avait plus de raison de deviner. Le bouton « Tester la connexion » rapporte la
réponse brute — code HTTP et début du corps — pour trancher en une minute le jour où
la question se reposera.

### Le tableau s'avance tout seul

`src/lib/printerSync.ts`, fonction `appliquerLecture(avant, lecture)`.

**Un seul endroit pour deux appelants.** `GET /api/printer` et le webhook écrivent
tous deux la ligne `printer` ; si chacun détectait les transitions de son côté, une
impression suivie par les deux voies verrait sa carte déplacée deux fois. Les deux
routes passent donc par cette fonction, qui compare l'état d'avant à celui d'après.

Deux transitions, et deux seulement :

| Ce qui change | Ce que le tableau fait |
| --- | --- |
| on n'imprimait pas (ou un autre fichier) → on imprime `F` | la carte de « À imprimer » qui correspond à `F` passe en « En impression » |
| on imprimait `F` → état terminal réussi | cette carte passe en « Fait », avec le filament mesuré et une photo |

`cancelled` et `error` ne déplacent **rien** : une impression ratée n'est pas un
travail terminé, et le bandeau le dit déjà. Elles produisent une notification, elles.

#### Ce qui est délibérément prudent

Rapprocher un nom de fichier d'un titre de carte (`looksLikeSameJob`) est une
heuristique, pas une vérité — elle se trompera. Les garde-fous existent pour que se
tromper ne coûte rien :

- il faut **exactement une** carte candidate ; zéro ou deux, on ne touche à rien ;
- une carte refusée n'est jamais déplacée — la machine n'a pas à contredire un non ;
- jamais de retour en arrière depuis « Fait » ;
- une photo prise par un humain n'est jamais écrasée : celle-là est délibérée ;
- `printer.auto_advance` coupe tout, et se règle dans l'application.

`lastMovedBy` prend le nom de la machine, si bien que la notification existante se
lit « 📦 L'imprimante d'Alexandre a déplacé « Exam Roulette » : À imprimer → En
impression ». Aucun code de notification à ajouter : c'est le même événement qu'un
déplacement à la main, et c'en est un.

#### Les objets en plusieurs morceaux

Un bouton poussoir en trois pièces, ce sont trois fichiers dont chacun ressemble au
titre de la carte. Sans précaution, la première fin d'impression classait l'objet
dans « Fait » avec les deux tiers du travail devant lui.

D'où `cards.pieces_done` : l'imprimante compte, et ne classe qu'à `pieceCount`.

**Une carte, pas trois — et surtout pas une carte maître avec des sous-cartes.**
Ce serait la solution évidente et la mauvaise : elle fausserait le décompte des
colonnes, les totaux d'heures et de filament, la priorité, l'attente et le
glisser-déposer, pour représenter un objet que l'utilisateur considère comme un.

Le filament mesuré **s'additionne** au fil des morceaux, mais seulement à partir du
moment où c'est nous qui comptons (`piecesDone === 0` remplace, ensuite on ajoute) :
ajouter une mesure de buse à une estimation d'auteur donnerait un chiffre qui ne
veut rien dire.

Un retour manuel en « À imprimer » remet le compteur à zéro — une carte qui remonte
de « Fait » en affichant « 3/3 pièces » n'aurait aucun sens.

### La photo, la webcam, et Gadget

Trois champs de plus, tous **déjà présents** dans la réponse qu'on lisait :
`GadgetStatus` / `GadgetStatusColor` (la surveillance par IA d'OctoEverywhere),
`EstTotalFilamentWeightMg`, et `TrackedPrintCompleteImageUrl`.

À la fin d'une impression, `fetchImage()` essaie dans l'ordre l'image de fin
qu'OctoEverywhere conserve, puis la webcam — prise **au moment où l'on détecte la
fin**, la pièce étant encore sur le plateau. Contrôles identiques à la route de
photo existante (type, 3 Mo), et le téléchargement passe par le même `fetchSuivi()`
revalidé à chaque redirection.

La webcam vit sur un chemin distinct de l'API d'état, relevé dans la balise
`og:image` de la page de partage elle-même :

```
GET https://octoeverywhere.com/cdn-api/live/snapshot?id=-<id>
```

`GET /api/printer/snapshot` fait l'aller-retour côté serveur. Le navigateur
pourrait appeler l'adresse directement — elle est publique — mais il faudrait alors
lui confier le lien, et **un Live Link est un sésame**. Il ne sort pas du serveur.

**Ce que je n'ai pas pu vérifier** : les deux images. L'endpoint répond, mais
renvoie `404` tant que le NAS n'est pas relié à l'imprimante. Les deux branches sont
éprouvées localement — image servie *et* absente — et l'absence ne coûte qu'une
vignette en moins.

### Refuser, sans quatrième colonne

`cards.declined_reason`. Une carte refusée reste où elle est, grisée, et **sort de
la liste triable** — comme les cartes provisoires, et pour la même raison : elle n'a
pas de rang dans une file qu'elle ne rejoindra pas.

C'est aussi ce qui neutralise le piège du round précédent. Ajouter une bande de tri,
c'est exactement ce qui avait cassé le glisser-déposer en introduisant la priorité.
Deux parades, l'une derrière l'autre :

1. `bandeDe(card)` — `declined ? -1 : priority` — est **partagée** par
   `columnCards()` et `resolveDrop()`. Une seule définition, deux appelants ;
2. une carte refusée n'étant pas rendue dans le `SortableContext`, elle ne peut pas
   être la cible d'un dépôt. Le cas problématique n'existe plus, au lieu d'être
   seulement gardé.

Le refus n'est pas une modification, c'est une réponse : il part seul, tout de
suite, avec sa propre notification (`kind: 'declined'`).

### « Prête dans ~6 h »

`queueEta()` dans `printInfo.ts`, pur calcul : le temps restant de l'impression en
cours, puis le cumul des durées de « À imprimer » **dans l'ordre affiché**,
quantités comprises.

Une carte sans durée connue n'a pas d'estimation et ne décale pas les suivantes : on
ignore ce qu'elle prendra, autant ne rien inventer.

Le libellé reste au conditionnel — `~`, et une infobulle « si les impressions
s'enchaînent ». L'estimation suppose des impressions bout à bout, ce qui n'arrive
jamais tout à fait ; personne ne relance à trois heures du matin. Un ordre de
grandeur annoncé comme tel vaut mieux qu'une heure précise et fausse.

### Les notifications, réglées dans l'application

Elles existaient depuis longtemps et n'ont jamais été branchées : il fallait poser
des variables d'environnement sur l'hébergeur **et redéployer**. Elles sont
maintenant dans la page Réglages, avec une table `notifications` à une ligne.

`resolveTransport()` prend sa configuration en paramètre au lieu de lire
`process.env` ; `notificationConfig()` (`src/lib/notifySettings.ts`) décide de la
source :

> **la base l'emporte quand elle nomme un transport, l'environnement reprend la
> main quand elle est vide.**

Sans ce repli, la création de la table ferait taire en silence un déploiement qui
notifiait très bien la veille.

Deux détails qui font la différence à l'usage :

- **le bouton « Envoyer un test » envoie vraiment**, et répète la réponse du service
  mot pour mot. C'est la seule façon de distinguer un `chat_id` recopié sans son
  signe moins d'un bot jamais ajouté au groupe — deux pannes qui, autrement, se
  ressemblent : rien n'arrive ;
- **`/slack` est ajouté tout seul** à une URL de webhook Discord. C'était une note
  dans `.env.example`, c'est-à-dire une note que personne ne lit.

`notifySettings.ts` existe pour une raison de dépendances : `notify.ts` est appelé
depuis les routes de cartes, et lui faire importer la base directement mêlerait la
mise en forme des messages à l'accès aux données. La configuration et le type
vivent donc du côté base, et `notify.ts` ne fait que les recevoir — sans quoi les
deux modules s'importeraient mutuellement.

### Choisir ce qui déclenche un message

Six cases dans les réglages, une par message. Le besoin est né de l'avance
automatique : depuis que la machine range les cartes, chaque départ et chaque fin
d'impression produit un déplacement, donc un message. Ce sont précisément ceux
qu'on veut pouvoir taire — ou garder seuls.

`moved` s'est dédoublé pour ça. L'événement reste un déplacement, mais
`byPrinter: true` (posé par `déplacer()` dans `printerSync.ts`, le seul endroit qui
déplace une carte au nom de la machine) le fait tomber sous la clé `printerMoved` :
« Alexandre a déplacé » et « l'imprimante a déplacé » ne se taisent pas pour les
mêmes raisons.

La colonne `notifications.events` stocke les clés retenues, séparées par des
virgules, avec **une distinction qui porte tout le réglage** :

> `NULL` veut dire « tous », `''` veut dire « aucun ».

`NULL` est l'état d'une base qui n'a jamais vu cet écran : elle continue donc de
tout notifier, et une installation neuve aussi. Confondre les deux ferait reparler
une destination qu'on venait délibérément de faire taire — ou, dans l'autre sens,
laisserait une colonne vide couper les notifications en silence, le piège déjà
rencontré avec les variables d'environnement. `parseEvents()` tient cette
distinction, `shouldSend()` en vit.

L'API refuse une clé inconnue au lieu de l'ignorer : sans ça une faute de frappe
ferait taire un événement sans rien dire, exactement ce que ce réglage est censé
rendre visible.

**`notifyEvents.ts` n'a aucune dépendance, et c'est le sujet.** La table `TRIGGERS`
sert deux fois — le filtre côté serveur, les cases côté navigateur — parce qu'en
tenir deux reviendrait à ce qu'un jour l'une propose de taire ce que l'autre ne
sait pas taire. Mais la sortir de `notify.ts` n'est pas cosmétique : `notify.ts`
importe `notifySettings.ts`, donc la base, donc le pilote Postgres. Un composant
client qui l'importe fait échouer la construction sur `Can't resolve 'net'` — vu en
développement, et confirmé par `npm run build`. Les événements et leurs clés vivent
donc dans un module feuille, que les deux côtés peuvent lire.

Le bouton « Envoyer un test » ne passe pas par le filtre : il éprouve la
destination, pas le choix des événements. Tout décocher laisse donc un test qui
marche et une application silencieuse — ce que l'écran dit en toutes lettres.

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

### Le mot d'accueil

`src/components/Greeting.tsx`, affiché **uniquement après le choix initial du
prénom** — pas à chaque bascule d'utilisateur depuis l'en-tête, qui se fait en un
clic et où un plein écran deviendrait pénible. Chacun a sa phrase : celui qui
possède l'imprimante n'a pas la même chose à entendre que celui qui demande.

Trois détails qui font la différence entre un effet de frappe et un effet de
frappe réussi :

- **la place est réservée d'avance.** Le texte complet est posé en fantôme,
  invisible, dans la même cellule de grille que le texte qui s'écrit. Sans lui, la
  phrase centrée se recentre à chaque lettre — elle glisse sous l'œil — et saute
  d'une ligne au moment du passage à la ligne sur téléphone ;
- **le découpage passe par `Array.from`**, et non par un index de chaîne :
  « qu'est-ce » porte une apostrophe typographique, et les caractères composés se
  briseraient en plein milieu ;
- **`prefers-reduced-motion` est respecté** : la phrase s'affiche alors d'un coup.

Le curseur reste fixe pendant la frappe et ne clignote qu'une fois la phrase
finie, comme un vrai curseur de saisie. L’écran s’effface tout seul après un temps
de lecture, et un clic ou une touche coupe court. Le texte entier est porté par
`aria-label` sur le conteneur : un lecteur d'écran l'énonce une fois, au lieu de
bégayer à chaque lettre.

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

`favicon.ico` en fait partie, et empile cinq tailles (16 à 64 px) **redessinées
chacune à sa taille** : laisser Pillow réduire une grande image donnerait un cube
empâté à 16 px. Le cube y occupe aussi plus de place que dans les icônes
d'application (74 % contre 62 %), sans quoi il ne resterait qu'une pastille orange
indistincte dans l'onglet. Ce fichier compte : les navigateurs demandent
`/favicon.ico` d'eux-mêmes, avant même de lire le HTML, et certains contextes
(favoris, raccourcis Windows) ne savent lire que celui-là.

Deux pièges rencontrés, tous deux silencieux :

- **`@phosphor-icons/react` ne s'importe pas dans un composant serveur.** La
  bibliothèque s'appuie sur un contexte React, et l'importer depuis un fichier sans
  `'use client'` fait échouer la construction sur un `createContext is not a
  function` peu bavard. `src/app/reglages/page.tsx` affiche donc un chevron en texte
  (`‹`) plutôt qu'une icône ;
- **`favicon.ico` ne doit exister qu'une fois.** `create-next-app` en pose un dans
  `src/app/`, où Next le traite comme un fichier de métadonnées et le sert sur
  `/favicon.ico` ; celui de `public/` sert la même adresse. Les deux réunis donnent
  un `500` en développement (« A conflicting public file and page file was found »),
  et en production c'est `public/` qui gagne — donc tout marche en ligne pendant que
  le développement casse. Seul celui de `public/` est conservé.

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
| Discussion et archivage | idem, y compris le compteur de messages |
| Coût d'impression et prix | valeurs saisies, effacées, bornées, et leur mise en forme |
| Photo | dépôt, remplacement, cache, format refusé, suppression en cascade |
| Priorité | les trois niveaux, le classement, un glisser dans un niveau qui tient au rechargement, un glisser vers un autre niveau qui change la priorité |
| Multi-couleur | badge, compteur borné, mention dans le total de colonne |
| Imprimante | les deux formes de réponse et la construction de l'URL hors ligne ; puis, contre un faux OctoEverywhere servant la réponse réelle : réglages, test, bandeau, carte liée par son nom de fichier, webhook, jeton faux, secret jamais renvoyé, machine éteinte, adresse privée refusée, **redirection vers le réseau interne refusée** |
| Avance automatique | un cycle complet piloté de l'extérieur : départ, fin, filament réel, photo — et tous les cas d'abstention : deux cartes candidates, carte refusée, impression annulée, photo humaine, interrupteur coupé |
| Objets en plusieurs pièces | trois fichiers, trois fins : le compteur monte, le filament s'additionne, et seule la dernière classe en « Fait » |
| Webcam et Gadget | vignette servie par notre route, `404` qui ne casse rien, pastille d'alerte |
| Refus | badge, tri en bas, notification, annulation — et le glisser-déposer qui **tient au rechargement** malgré la nouvelle bande |
| Attente | cumul, quantités, reclassement par priorité, carte sans durée ignorée |
| Notifications | les trois transports, la base qui l'emporte sur l'environnement et l'inverse, la destination morte rapportée mot pour mot, le `/slack` de Discord, aucun jeton renvoyé au navigateur |
| Le choix des déclencheurs | hors ligne : la clé de chacun des six événements, `moved` avec et sans `byPrinter`, et le filtre (`null` tout, liste vide rien, liste partielle ce qu'il faut) ; de bout en bout : `moved` décoché tait la main mais pas le refus, `printerMoved` décoché laisse la machine avancer les cartes en silence tandis qu'un incident parle encore, rien de coché ne laisse partir que le test, une clé inconnue refusée en 400, et l'écran qui relit son état au rechargement |
| Le lien de l'imprimante | absent de l'API comme du HTML rendu |
| Contraste AA dans les deux thèmes | mesure du rapport réel sur les éléments rendus |
| Mobile | 375 / 393 / 430 px : débordement, cibles tactiles, taille des champs — tableau et page de réglages |

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
