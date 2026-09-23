# Chatvardage — Rooms Service

Microservice de gestion des salons pour le **Contrôle 2 — Backend conteneurisé et services temps réel** du cours 420-5A6-ST.

Ce dépôt contient uniquement le service responsable des salons. Les messages de groupe ne sont pas gérés par ce service pour ce contrôle.

## Technologies

- NestJS + TypeScript
- Prisma ORM
- PostgreSQL
- Swagger / OpenAPI
- Docker

## Responsabilités

Le service permet de :

- créer un salon public ou privé;
- récupérer la liste des salons;
- récupérer un salon;
- modifier le nom ou la visibilité d'un salon;
- supprimer un salon;
- gérer les membres;
- inviter un utilisateur dans un salon privé;
- accepter ou refuser une invitation;
- rejoindre ou quitter un salon;
- conserver les salons dans PostgreSQL.

Le modèle retourné par l'API pour un salon est le suivant. Ce format a changé de façon coordonnée avec le Frontend (voir [Permissions](#permissions)) : le champ `hoteId` a été retiré et remplacé par `creePar`, qui est purement informationnel et ne confère plus aucune autorité sur le salon.

```ts
{
  type: 'salon',
  id: string,
  nom: string,
  visibilite: 'public' | 'prive',
  creePar: string,
  membreIds: string[],
  membresInvites: string[]
}
```

## Authentification entre services

Les routes qui agissent au nom d'un utilisateur reçoivent le JWT final du **service Auth** dans `Authorization: Bearer <jeton>`. Le Rooms Service ne fait confiance à aucun en-tête `x-user-id` ou `x-user-role` fourni par le client.

Pour chaque action protégée, il appelle `GET /api/auth/me` du service Auth. Auth valide la signature, l'expiration et `version_auth`, recharge l'utilisateur dans PostgreSQL et retourne son rôle courant. Les changements de rôle, suppressions de compte et révocations sont donc pris en compte sans recopier le rôle dans le JWT.

En intégration Docker locale, le service Auth peut être joint en HTTP sur un réseau de développement. `AUTH_SERVICE_URL` doit désigner uniquement l’origine du service Auth (par exemple `http://auth-service:3001`), sans chemin, paramètres de requête ni fragment. En production (`NODE_ENV=production`), cette URL doit obligatoirement utiliser `https://`; le Rooms Service refuse de démarrer avec une configuration Auth invalide ou non sécurisée.

Le Rooms Service valide volontairement l’utilisateur auprès du service Auth à chaque route protégée, sans cache, afin que les révocations et changements de rôle soient pris en compte immédiatement. Ce choix ajoute un appel réseau par requête protégée; si Auth est indisponible ou dépasse le délai configuré par `AUTH_TIMEOUT_MS` (3 000 ms par défaut), Rooms Service retourne une erreur 503. Les réponses 401 et 403 du service Auth sont conservées comme erreurs d’authentification/autorisation distinctes. Une réponse Auth 2xx au format JSON invalide est traitée comme une erreur 502 (réponse incorrecte du service en amont), tandis qu’une indisponibilité réseau ou un 5xx Auth reste une erreur 503. Les journaux distinguent un dépassement du délai configuré d’une erreur réseau afin de faciliter le diagnostic.

Sous Node.js 22, le `fetch` natif s’appuie sur le dispatcher global d’Undici, qui réutilise les connexions HTTP. Aucun pool HTTP supplémentaire n’est donc configuré dans le Room-Service.

Un `RoomAuthGuard` NestJS est enregistré globalement via `APP_GUARD` : toute nouvelle route est donc protégée par défaut. Les exceptions doivent être explicitement marquées avec `@PublicRoute()` ou `@OptionalAuthRoute()`. `GET /api/health` est public. `GET /api/rooms` et `GET /api/rooms/:id` utilisent une authentification optionnelle : sans en-tête `Authorization`, seuls les salons publics sont visibles; avec un JWT valide, la liste inclut aussi les salons privés dont l’utilisateur est membre et le détail d’un tel salon devient accessible. Si un en-tête `Authorization` est présent mais que le jeton est invalide ou expiré, la requête échoue avec l’erreur d’authentification correspondante au lieu d’être traitée comme anonyme. Un salon privé inaccessible reçoit la même réponse 404 qu’un salon inexistant afin d’éviter l’énumération. L’utilisateur authentifié est attaché à la requête par le guard avant l’exécution des gestionnaires protégés.

## Routes

Toutes les routes sont préfixées par `/api`.

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/rooms` | Liste des salons publics; avec JWT, inclut aussi les salons privés dont l’utilisateur est membre |
| GET | `/api/rooms/:id` | Obtenir un salon public; avec JWT, un salon privé dont l’utilisateur est membre |
| GET | `/api/admin/rooms` | Lister tous les salons pour le panneau d’administration (admin seulement) |
| POST | `/api/rooms` | Créer un salon (modérateur ou administrateur) |
| PATCH | `/api/rooms/:id` | Modifier un salon (modérateur ou administrateur) |
| DELETE | `/api/rooms/:id` | Supprimer un salon (modérateur ou administrateur) |
| GET | `/api/rooms/invitations/me` | Invitations de l'utilisateur connecté |
| POST | `/api/rooms/:id/invitations` | Inviter un utilisateur dans un salon privé (modérateur ou administrateur, idempotent : aucun doublon si déjà membre ou invité) |
| DELETE | `/api/rooms/:id/members/:userId` | Retirer un membre d'un salon (modérateur ou administrateur) |
| POST | `/api/rooms/:id/invitations/accept` | Accepter une invitation |
| POST | `/api/rooms/:id/invitations/refuse` | Refuser une invitation |
| POST | `/api/rooms/:id/join` | Rejoindre un salon |
| POST | `/api/rooms/:id/leave` | Quitter un salon |
| GET | `/api/health` | Vérifier le service et PostgreSQL |

Le panneau d’administration utilise `GET /api/admin/rooms` pour voir tous les salons, publics et privés. Pour supprimer un salon, `DELETE /api/rooms/:id` est ouvert à tout `moderateur` ou `admin`, quel que soit le créateur du salon.

## Permissions

Depuis ce changement, l'autorisation ne repose plus sur un concept d'« hôte » propre à chaque salon : elle dépend uniquement du **rôle global** de l'appelant, renvoyé par le service Auth (`request.user.role`), et s'applique de façon identique sur tous les salons, peu importe qui les a créés.

- `utilisateur` : peut lister/consulter les salons, rejoindre un salon public, accepter ou refuser les invitations qui lui sont adressées, et quitter n'importe quel salon dont il est membre (y compris un salon qu'il a créé). Il ne peut **pas** créer, renommer, changer la visibilité, supprimer, inviter dans, ou retirer un membre d'un salon.
- `moderateur` : peut créer un salon, supprimer n'importe quel salon, renommer ou changer la visibilité de n'importe quel salon, inviter un membre dans un salon privé, et retirer un membre d'un salon — sur n'importe quel salon, qu'il l'ait créé ou non.
- `admin` : peut tout ce qu'un `moderateur` peut faire, sur tous les salons, en plus de lister tous les salons via `GET /api/admin/rooms`.
- Le champ `creePar` retourné dans la réponse d'un salon est purement informationnel (qui a créé le salon) : il n'accorde plus aucun droit particulier.
- Un utilisateur doit être invité pour rejoindre un salon privé; il peut rejoindre librement un salon public.
- N'importe quel membre, y compris le créateur du salon, peut quitter le salon à tout moment via `POST /api/rooms/:id/leave`.

## Installation locale

Prérequis : Node.js 22 et PostgreSQL, ou Docker.

### Option recommandée : Docker

Pour tester le service sans configuration PostgreSQL manuelle :

```bash
docker compose -f compose.local.yml up --build
```

Le Compose local crée une base `chatvardage_rooms` avec l'utilisateur `room_service`, exactement comme `.env.example`.

Par défaut, ce compose force `NODE_ENV=development`, cherche le service Auth sur l'hôte à l'adresse `http://host.docker.internal:3001` et autorise `http://localhost:5173` pour CORS. Les variables `AUTH_SERVICE_URL`, `AUTH_TIMEOUT_MS` et `CORS_ORIGINS` peuvent être redéfinies au lancement si nécessaire. Sous Linux, l'alias `host.docker.internal` repose sur `host-gateway`, disponible avec Docker Engine 20.10 ou plus récent.

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
AUTH_TIMEOUT_MS=3000
CORS_ORIGINS="http://localhost:5173"
```

## Exemple — créer un salon

La création d'un salon requiert un JWT dont le rôle global est `moderateur` ou `admin`; un `utilisateur` reçoit 403.

```bash
curl -X POST http://localhost:3003/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_MODERATEUR_1>" \
  -d '{"nom":"general","visibilite":"public"}'
```

Réponse :

```json
{
  "type": "salon",
  "id": "...",
  "nom": "general",
  "visibilite": "public",
  "creePar": "moderateur-1",
  "membreIds": ["moderateur-1"],
  "membresInvites": []
}
```

## Exemple — salon privé et invitation

Créer le salon (toujours réservé à `moderateur`/`admin`) :

```bash
curl -X POST http://localhost:3003/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_MODERATEUR_1>" \
  -d '{"nom":"equipe-privee","visibilite":"prive"}'
```

Inviter un utilisateur (réservé à `moderateur`/`admin`) :

```bash
curl -X POST http://localhost:3003/api/rooms/<ROOM_ID>/invitations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_MODERATEUR_1>" \
  -d '{"utilisateurId":"user-2"}'
```

Cette opération est idempotente : si l’utilisateur est déjà membre du salon ou possède déjà une invitation, aucun doublon n’est créé et l’état courant du salon est retourné.

Accepter l'invitation avec `user-2` :

```bash
curl -X POST http://localhost:3003/api/rooms/<ROOM_ID>/invitations/accept \
  -H "Authorization: Bearer <JWT_USER_2>"
```

Retirer un membre d'un salon (réservé à `moderateur`/`admin`) :

```bash
curl -X DELETE http://localhost:3003/api/rooms/<ROOM_ID>/members/user-2 \
  -H "Authorization: Bearer <JWT_MODERATEUR_1>"
```

## Base de données

Le service possède trois modèles. `Room.createdBy` est purement informationnel (qui a créé le salon, pour affichage éventuel) et n'est utilisé dans aucun contrôle d'autorisation; l'autorisation repose uniquement sur le rôle global de l'appelant (voir [Permissions](#permissions)).

```text
Room
├── id
├── name
├── visibility
├── createdBy
├── createdAt
└── updatedAt

RoomMember
├── roomId
├── userId
└── joinedAt

RoomInvitation
├── roomId
├── userId
└── invitedAt
```

Les identifiants utilisateurs sont conservés sous forme de chaînes plutôt que comme clés étrangères vers `User`, car le modèle utilisateur appartient au Auth/User Service.

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

Le service reprend la logique de salon déjà présente dans le contrôle 1, mais remplace le stockage local/simulé par PostgreSQL.

Les messages envoyés dans les salons peuvent rester simulés dans le client Electron pour ce contrôle. Le vrai temps réel demandé concerne les messages privés, qui sont gérés par le Messaging Service.

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

Le **Room-Service ne gère volontairement ni Redis, ni WebSocket, ni les messages de groupe**. Pour le Contrôle 2, le temps réel demandé concerne les messages privés et appartient au `Message-Service`. Les messages de salons restent simulés jusqu'au contrôle ultérieur, conformément à l'énoncé.

Le Dashboard d'administration peut consulter et supprimer les salons en passant par le Serveur-API, qui transmet ensuite les requêtes autorisées à ce service.

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
npm run lint
```

Le `docker-compose.yml` global du dépôt `Infra` demeure le point de démarrage de l'environnement complet de l'équipe pour la démonstration du Contrôle 2.
