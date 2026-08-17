# Kanban3D

Un tableau d'impressions 3D partagé à deux. On colle le lien d'un modèle
(Printables, MakerWorld, Thingiverse, Cults3D…), l'app récupère le titre, l'image
et l'auteur, on précise la quantité et la couleur, et la carte avance de colonne
au fil de l'impression.

**À imprimer → En impression → Fait.** Rien d'autre : pas de compte, pas de
collection, pas d'export.

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

Autres commandes : `npm run lint`, `npm run typecheck`, `npm run build`.

---

## Comment ça marche

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

Le choix « Aedh / Alexandre » est indépendant : une simple valeur en
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
