# Chatvardage — Rooms Service

Microservice des **serveurs et salons** de Chatvardage (Contrôle 2 — Backend conteneurisé et services temps réel, cours 420-5A6-ST), sur le modèle de Discord : un **serveur** regroupe des membres et des **salons**. Les messages eux-mêmes appartiennent à Message-Service.

## Technologies

- NestJS + TypeScript
- Prisma ORM
- PostgreSQL
- Swagger / OpenAPI
- Docker

## Modèle

- **Serveur** : public (trouvable par recherche, rejoignable librement) ou privé (sur invitation seulement). Tout utilisateur peut en créer un et en devient **propriétaire** ; un salon `#général` est créé avec lui.
- **Salon** : visible par tous les membres du serveur, sauf s'il est **réservé aux modérateurs** (`acces: 'moderateurs'`). Son **écriture** peut aussi être réservée aux modérateurs (`ecriture: 'moderateurs'`, ex. `#annonces`).
- **Rôles, par serveur** : `proprietaire` (`Server.ownerId`), `moderateur`, `membre`. L'`admin` global d'Authentification a tous les droits partout. Le rôle global `moderateur` d'Authentification n'accorde **aucun** droit ici : la modération est propre à chaque serveur.
- **Serveur par défaut « Chatvardage »** : créé par migration, public, sans propriétaire (géré par les admins). Tout utilisateur y est ajouté automatiquement au premier `GET /api/servers`, que le Frontend appelle dès l'ouverture de session (donc dès l'inscription), et ne peut pas le quitter. L'arrivée d'un **nouveau** membre est signalée en temps réel aux autres membres (`membres`). Il contient `#annonces` (lecture pour tous, écriture réservée aux modérateurs, donc aux admins) et `#général`. Identifiants figés (partagés avec Message-Service, qui y insère le message de bienvenue) : voir `src/servers/default-server.ts`. Le Frontend affiche ces deux salons dans la langue de l'utilisateur (`#annonces`/`#announcements`, `#général`/`#general`) en les reconnaissant à leur identifiant **et** à leur nom d'origine : un salon renommé s'affiche tel quel, sans traduction.

Format d'un serveur :

```ts
{
  type: 'serveur',
  id: string,
  nom: string,
  icone: string | null,            // data URL PNG/JPEG/WebP
  public: boolean,
  parDefaut: boolean,
  proprietaireId: string | null,
  monRole: 'admin' | 'proprietaire' | 'moderateur' | 'membre' | null, // null = aperçu
  nombreMembres: number,
  salons: Salon[],                 // salons visibles par l'appelant
  invitations: string[]            // en attente ; modérateurs et plus seulement
}
```

La liste des membres n'est **pas** incluse : tout le monde est membre du serveur par défaut, elle grossirait avec le nombre de comptes (et chaque inscription fait recharger la liste des serveurs à tous). Elle se lit par pages avec `GET /api/servers/:id/members` :

```ts
// ?decalage=0&limite=50 (100 au plus), ou ?ids=a,b,c (100 au plus, sans pagination)
{
  membres: { utilisateurId: string; role: 'proprietaire' | 'moderateur' | 'membre' }[],
  total: number,
  suivant: number | null           // decalage de la page suivante
}
```

Ordre : le propriétaire en tête de la première page, puis les modérateurs, puis les membres, par ancienneté. `ids` sert à savoir lesquels de ces utilisateurs sont déjà membres (fenêtre « Inviter »).

Format d'un salon :

```ts
{
  type: 'salon',
  id: string,
  serveurId: string,
  nom: string,
  position: number,
  acces: 'tous' | 'moderateurs',
  ecriture: 'tous' | 'moderateurs',
  peutEcrire: boolean,             // pour l'appelant
  creePar: string | null
}
```

## Authentification entre services

Les routes qui agissent au nom d'un utilisateur reçoivent le JWT final du **service Auth** dans `Authorization: Bearer <jeton>`. Le Rooms Service ne fait confiance à aucun en-tête `x-user-id` ou `x-user-role` fourni par le client.

Pour chaque action protégée, il appelle `GET /api/auth/me` du service Auth. Auth valide la signature, l'expiration et `version_auth`, recharge l'utilisateur dans PostgreSQL et retourne son rôle courant. Les changements de rôle, suppressions de compte et révocations sont donc pris en compte sans recopier le rôle dans le JWT.

En intégration Docker locale, le service Auth peut être joint en HTTP sur un réseau de développement. `AUTH_SERVICE_URL` doit désigner uniquement l’origine du service Auth (par exemple `http://auth-service:3001`), sans chemin, paramètres de requête ni fragment. En production (`NODE_ENV=production`), cette URL doit obligatoirement utiliser `https://`; le Rooms Service refuse de démarrer avec une configuration Auth invalide ou non sécurisée.

Le Rooms Service valide l’utilisateur auprès du service Auth pour chaque route protégée, avec un **cache court** : un jeton validé est mémorisé `AUTH_CACHE_TTL_MS` millisecondes (10 000 par défaut, `0` pour interroger Auth à chaque requête). Compromis assumé : une révocation (mot de passe changé, compte supprimé) ou un changement de rôle est pris en compte au plus tard à l’expiration de l’entrée. Les refus (401/403) et les pannes ne sont jamais mémorisés, et des requêtes simultanées avec le même jeton ne font qu’un appel. Si Auth est indisponible ou dépasse `AUTH_SERVICE_TIMEOUT_MS` (3 000 ms par défaut), Rooms Service retourne une erreur 503. Les réponses 401 et 403 du service Auth sont conservées comme erreurs d’authentification/autorisation distinctes. Une réponse Auth 2xx au format JSON invalide est traitée comme une erreur 502 (réponse incorrecte du service en amont), tandis qu’une indisponibilité réseau ou un 5xx Auth reste une erreur 503. Les journaux distinguent un dépassement du délai configuré d’une erreur réseau afin de faciliter le diagnostic. Ce client est le fichier partagé `src/partage/client-auth.ts`, identique dans Message-Service.

Sous Node.js 22, le `fetch` natif s’appuie sur le dispatcher global d’Undici, qui réutilise les connexions HTTP. Aucun pool HTTP supplémentaire n’est donc configuré dans le Room-Service.

Un `RoomAuthGuard` NestJS est enregistré globalement via `APP_GUARD` : toute nouvelle route est donc protégée par défaut. Les exceptions doivent être explicitement marquées avec `@PublicRoute()`. `GET /api/health` est public. Les routes `/api/internal/*` sont marquées publiques pour le JWT mais protégées par un **jeton interne** (voir [Route interne](#route-interne-message-service)). Un serveur privé inaccessible reçoit la même réponse 404 qu’un serveur inexistant afin d’éviter l’énumération. L’utilisateur authentifié est attaché à la requête par le guard avant l’exécution des gestionnaires protégés.

## Routes

Toutes les routes sont préfixées par `/api` et exigent un JWT, sauf mention contraire.

### Serveurs

| Méthode | Route | Qui | Description |
|---|---|---|---|
| GET | `/api/servers` | connecté | Mes serveurs, Chatvardage en premier (m'y ajoute si besoin) |
| GET | `/api/servers/decouvrir?q=` | connecté | Serveurs publics dont je ne suis pas membre (nom contenant `q`, 20 max) |
| POST | `/api/servers` | connecté | Créer un serveur `{ nom, public? }` ; j'en deviens propriétaire |
| GET | `/api/servers/:id` | membre (aperçu si public) | Détail ; 404 si privé et non-membre |
| GET | `/api/servers/:id/members?decalage=&limite=&ids=` | membre | Membres par pages (voir ci-dessus) ; 403 si non-membre d'un serveur public |
| PATCH | `/api/servers/:id` | propriétaire / admin | `{ nom?, public?, icone? }` (icône vide = retirée) ; Chatvardage reste public |
| DELETE | `/api/servers/:id` | propriétaire / admin | Supprime le serveur et ses salons ; interdit pour Chatvardage |
| POST | `/api/servers/:id/join` | connecté | Rejoindre un serveur public, ou privé si invité |
| POST | `/api/servers/:id/leave` | membre | Quitter ; interdit au propriétaire et pour Chatvardage |
| DELETE | `/api/servers/:id/members/:userId` | modérateur+ | Expulser, seulement un membre de rang inférieur ; interdit dans Chatvardage |
| PATCH | `/api/servers/:id/members/:userId` | propriétaire / admin | `{ role: 'membre' \| 'moderateur' }` |

### Invitations

| Méthode | Route | Qui | Description |
|---|---|---|---|
| GET | `/api/servers/invitations/me` | connecté | Mes invitations en attente |
| POST | `/api/servers/:id/invitations` | modérateur | Inviter `{ utilisateurId }` (idempotent ; 409 si déjà membre ; interdit dans Chatvardage) |
| POST | `/api/servers/:id/invitations/accept` | invité | Accepter (devient membre) |
| POST | `/api/servers/:id/invitations/refuse` | invité | Refuser |

### Salons

| Méthode | Route | Qui | Description |
|---|---|---|---|
| POST | `/api/servers/:id/channels` | modérateur+ | Créer `{ nom, acces?, ecriture? }`, en fin de liste |
| PATCH | `/api/channels/:id` | modérateur+ | `{ nom?, acces?, ecriture?, position? }` |
| DELETE | `/api/channels/:id` | modérateur+ | Supprimer ; un serveur garde au moins un salon |

### Administration

| Méthode | Route | Qui | Description |
|---|---|---|---|
| GET | `/api/admin/servers` | admin | Tous les serveurs |

### Route interne (Message-Service)

| Méthode | Route | Protection | Description |
|---|---|---|---|
| GET | `/api/internal/channels/:id/access/:userId?role=` | en-tête `x-internal-token` = `INTERNAL_SERVICE_TOKEN` | `{ salonId, serveurId, estMembre, peutLire, peutEcrire }` |

`role` est le rôle global (`admin` \| `moderateur` \| `utilisateur`, défaut `utilisateur`) issu du JWT que Message-Service a déjà validé. Sans `INTERNAL_SERVICE_TOKEN` configuré, la route répond toujours 503 (échec fermé). **Serveur-API ne relaie pas `/api/internal`** : seuls les autres microservices, sur le réseau Docker interne, peuvent l'appeler. Le port du Room-Service ne doit pas être exposé publiquement.

### Transition (à retirer)

Routes de l'ancien contrat « salons autonomes », conservées le temps que Message-Service passe à la route interne et que le Dashboard passe aux serveurs :

| Méthode | Route | Utilisée par | Description |
|---|---|---|---|
| GET | `/api/admin/rooms` | Dashboard | Tous les salons, ancien format (+ `serveurId`, `serveurNom`) ; admin |
| DELETE | `/api/rooms/:id` | Dashboard | Supprimer un salon ; admin |

### Santé

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | Service et PostgreSQL (public) |

## Permissions

Rôle **effectif** dans un serveur (voir `src/servers/permissions.ts`, seul endroit où ces règles sont codées) : `admin` (global) > `proprietaire` > `moderateur` > `membre`.

| Action | membre | modérateur | propriétaire | admin |
|---|:-:|:-:|:-:|:-:|
| Voir les salons ouverts, écrire là où l'écriture est ouverte | ✅ | ✅ | ✅ | ✅ |
| Voir / écrire dans un salon réservé aux modérateurs, écrire dans `#annonces` | | ✅ | ✅ | ✅ |
| Inviter | | ✅ | ✅ | ✅ |
| Voir les invitations en attente | | ✅ | ✅ | ✅ |
| Créer / modifier / supprimer des salons | | ✅ | ✅ | ✅ |
| Expulser (seulement un rang inférieur) | | ✅ | ✅ | ✅ |
| Nommer / retirer des modérateurs | | | ✅ | ✅ |
| Renommer, icône, public/privé, supprimer le serveur | | | ✅ | ✅ |

## Installation locale

Prérequis : Node.js 22 et PostgreSQL, ou Docker.

### Option recommandée : Docker

Pour tester le service sans configuration PostgreSQL manuelle :

```bash
docker compose -f compose.local.yml up --build
```

Le Compose local crée une base `chatvardage_rooms` avec l'utilisateur `room_service`, exactement comme `.env.example`.

Par défaut, ce compose force `NODE_ENV=development`, cherche le service Auth sur l'hôte à l'adresse `http://host.docker.internal:3001` et autorise `http://localhost:5173` pour CORS. Les variables `AUTH_SERVICE_URL`, `AUTH_SERVICE_TIMEOUT_MS` et `CORS_ORIGINS` peuvent être redéfinies au lancement si nécessaire. Sous Linux, l'alias `host.docker.internal` repose sur `host-gateway`, disponible avec Docker Engine 20.10 ou plus récent.

### Option Node.js + PostgreSQL local

Avant de démarrer le service, PostgreSQL doit contenir la base et le rôle correspondant à `.env.example` :

```sql
CREATE ROLE room_service WITH LOGIN PASSWORD 'room_service_dev';
CREATE DATABASE chatvardage_rooms OWNER room_service;
```

Puis :

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Les scripts `start` et `start:dev` chargent explicitement `.env`; il faut donc créer ce fichier avant de les lancer.

Le service écoute par défaut sur :

```text
http://localhost:3003
```

Swagger est disponible sur :

```text
http://localhost:3003/docs
```

## Lancement avec Docker pour tester ce dépôt seul

Le fichier `compose.local.yml` permet de tester le microservice indépendamment de l'infrastructure globale :

```bash
docker compose -f compose.local.yml up --build
```

Il démarre :

- `rooms-service` sur le port `3003`;
- PostgreSQL sur le port `5432`.

Pour tester les routes protégées, le service Auth doit aussi être disponible. Le chemin recommandé pour l'intégration complète est le `docker-compose.yml` global du dépôt Infra, qui démarre Auth, Rooms, Messages, PostgreSQL et Redis ensemble.

En production, `CORS_ORIGINS` doit être défini explicitement et chaque entrée doit être une origine HTTP(S) valide, sans chemin, paramètres ni fragment (par exemple `https://app.example.com`). Les ports HTTP(S) par défaut explicites (`:80`/`:443`) sont normalisés vers l’origine canonique. Les origines de boucle locale (`localhost`, `127.0.0.1` et `[::1]`) sont refusées en production. Le fallback `http://localhost:5173` dans le code est réservé aux environnements hors production; `compose.local.yml` fournit explicitement cette origine pour le conteneur local. `AUTH_SERVICE_URL` doit également utiliser HTTPS en production.

## Variables d'environnement

```env
NODE_ENV=development
PORT=3003
DATABASE_URL="postgresql://room_service:room_service_dev@localhost:5432/chatvardage_rooms?schema=public"
AUTH_SERVICE_URL="http://localhost:3001"
AUTH_SERVICE_TIMEOUT_MS=3000
# 0 = appel à Auth à chaque requête (voir « Authentification »).
AUTH_CACHE_TTL_MS=10000
CORS_ORIGINS="http://localhost:5173"
# Secret partagé avec Message-Service pour /api/internal (voir « Route interne »).
INTERNAL_SERVICE_TOKEN="changez-moi-en-une-longue-valeur-aleatoire"
# Message-Service, prévenu de chaque changement (voir « Temps réel »).
MESSAGE_SERVICE_URL="http://localhost:3004"
```

### En production (`NODE_ENV=production`)

Le service **refuse de démarrer** si `INTERNAL_SERVICE_TOKEN` fait moins de 32 caractères (la valeur de développement `chatvardage_internal_dev` en fait 24), ou si le mot de passe de `DATABASE_URL` est l'un des mots de passe de développement de l'Infra (`room_service_dev`, `postgres`…) — voir `src/partage/secrets-production.ts`. `CORS_ORIGINS` doit aussi y être défini, sans origine locale. Le message d'erreur liste tous les problèmes d'un coup ; en développement, les valeurs par défaut de l'Infra restent acceptées. Générer de vraies valeurs, par ex. `openssl rand -hex 32`.

## Temps réel

Après chaque changement, le service prévient Message-Service
(`POST {MESSAGE_SERVICE_URL}/api/internal/events`, même `INTERNAL_SERVICE_TOKEN`),
qui relaie `serveur.change` `{ serveurId, raison, cibleId }` aux sockets des
destinataires. Room-Service n'a ni Redis ni Socket.IO.

| Action | `raison` | Destinataires |
|---|---|---|
| Modifier le serveur | `modifie` | membres |
| Supprimer le serveur | `supprime` | membres d'avant la suppression |
| Rejoindre / quitter / accepter ou refuser une invitation / changer un rôle | `membres` | membres (+ la personne concernée) |
| Expulser | `expulse` | membres d'avant, **expulsé compris** |
| Inviter | `invitation` | membres + l'invité |
| Créer / modifier / supprimer un salon | `salons` | membres |

« Tire et oublie » (voir `EvenementsService`) : l'appel n'est jamais attendu
et un échec est seulement journalisé ; une action ne peut pas échouer à
cause du temps réel. Sans `INTERNAL_SERVICE_TOKEN`, rien n'est envoyé.

## Exemple — créer un serveur et inviter

Tout utilisateur connecté peut créer un serveur :

```bash
curl -X POST http://localhost:3003/api/servers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_USER_1>" \
  -d '{"nom":"Projet final","public":false}'
```

Inviter un utilisateur (modérateur, propriétaire ou admin) :

```bash
curl -X POST http://localhost:3003/api/servers/<SERVER_ID>/invitations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_USER_1>" \
  -d '{"utilisateurId":"user-2"}'
```

L'invité accepte :

```bash
curl -X POST http://localhost:3003/api/servers/<SERVER_ID>/invitations/accept \
  -H "Authorization: Bearer <JWT_USER_2>"
```

Créer un salon réservé aux modérateurs, puis nommer un modérateur (propriétaire) :

```bash
curl -X POST http://localhost:3003/api/servers/<SERVER_ID>/channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_USER_1>" \
  -d '{"nom":"modération","acces":"moderateurs"}'

curl -X PATCH http://localhost:3003/api/servers/<SERVER_ID>/members/user-2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_USER_1>" \
  -d '{"role":"moderateur"}'
```

## Base de données

```text
Server            id, name, icon?, ownerId?, isPublic, isDefault, createdAt, updatedAt
ServerMember      serverId, userId, role (membre | moderateur), joinedAt
ServerInvitation  serverId, userId, invitedBy, invitedAt
Room (= salon)    id, serverId, name, position, access (tous | moderateurs),
                  writePolicy (tous | moderateurs), createdBy?, createdAt, updatedAt
```

Le modèle `Room` garde son nom : ses identifiants sont ceux que Message-Service stocke (`RoomMessage.roomId`). Les identifiants utilisateurs restent des chaînes, sans clé étrangère : les utilisateurs appartiennent au service d'authentification.

La migration `20260924100000_serveurs` **repart à zéro** (décision d'équipe) : elle supprime les anciens salons, membres et invitations, puis crée Chatvardage avec `#annonces` et `#général`.

## Migration Prisma

Pour créer une nouvelle migration pendant le développement :

```bash
npx prisma migrate dev --name nom_de_la_migration
```

Dans Docker ou en déploiement :

```bash
npx prisma migrate deploy
```

## Healthcheck

```bash
curl http://localhost:3003/api/health
```

Réponse attendue :

```json
{
  "status": "ok",
  "service": "rooms-service",
  "database": "ok",
  "timestamp": "..."
}
```

## Intégration avec Chatvardage

Les messages des salons sont stockés et diffusés par Message-Service, qui vérifie auprès de ce service, via la route interne, qu'un utilisateur peut lire ou écrire dans un salon (écriture réservée de `#annonces`, salons réservés aux modérateurs).

**Ordre de déploiement du passage aux serveurs :**
1. ce service, avec `INTERNAL_SERVICE_TOKEN` : les routes de transition gardent l'ancien Message-Service et le Dashboard fonctionnels ;
2. Serveur-API : relayer `/api/servers` et `/api/channels` ;
3. Message-Service : passer à la route interne (même `INTERNAL_SERVICE_TOKEN`) et insérer le message de bienvenue de `#annonces` ;
4. Frontend ;
5. retirer les routes de transition.

## Place du service dans l'architecture du Contrôle 2

Le projet d'équipe est séparé en responsabilités :

```text
Frontend Electron
      |
      v
Serveur-API (Gateway)
      |
      +--> Authentification
      +--> Room-Service        <-- ce dépôt
      +--> Message-Service
      +--> User-Config-Service

Dashboard Admin --> Serveur-API

Infra --> Docker Compose + PostgreSQL + Redis + configuration globale
```

Le **Room-Service ne gère volontairement ni Redis, ni WebSocket, ni les messages** : ils appartiennent au `Message-Service`.

Le Dashboard d'administration consulte et supprime les salons via les routes de transition (`GET /api/admin/rooms`, `DELETE /api/rooms/:id`), en attendant de passer à `GET /api/admin/servers`.

## Vérifications avant remise

À partir d'un clone propre du dépôt :

```bash
docker compose -f compose.local.yml up --build
curl http://localhost:3003/api/health
```

Puis, pour vérifier le code hors Docker :

```bash
npm ci
npx prisma generate
npm run build
npm test
npm run test:e2e
npm run test:cov   # 100 % exigé
npm run lint
```

Le `docker-compose.yml` global du dépôt `Infra` demeure le point de démarrage de l'environnement complet de l'équipe pour la démonstration du Contrôle 2.
