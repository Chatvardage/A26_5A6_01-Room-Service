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

Le modèle retourné par l'API reste compatible avec le modèle `Salon` du client Electron du contrôle 1 :

```ts
{
  type: 'salon',
  id: string,
  nom: string,
  visibilite: 'public' | 'prive',
  hoteId: string,
  membreIds: string[],
  membresInvites: string[]
}
```

## Authentification entre services

Les routes qui agissent au nom d'un utilisateur reçoivent le JWT final du **service Auth** dans `Authorization: Bearer <jeton>`. Le Rooms Service ne fait confiance à aucun en-tête `x-user-id` ou `x-user-role` fourni par le client.

Pour chaque action protégée, il appelle `GET /api/auth/me` du service Auth. Auth valide la signature, l'expiration et `version_auth`, recharge l'utilisateur dans PostgreSQL et retourne son rôle courant. Les changements de rôle, suppressions de compte et révocations sont donc pris en compte sans recopier le rôle dans le JWT.

En intégration Docker locale, le service Auth peut être joint en HTTP sur un réseau de développement. En production (`NODE_ENV=production`), `AUTH_SERVICE_URL` doit obligatoirement utiliser `https://`; le Rooms Service refuse de démarrer avec une URL Auth non sécurisée.

Le Rooms Service valide volontairement l’utilisateur auprès du service Auth à chaque route protégée, sans cache, afin que les révocations et changements de rôle soient pris en compte immédiatement. Ce choix ajoute un appel réseau par requête protégée; si Auth est indisponible ou dépasse le délai de 3 s, Rooms Service retourne une erreur 503. Les réponses 401 et 403 du service Auth sont conservées comme erreurs d’authentification/autorisation distinctes.

L’authentification est encore déclenchée explicitement dans les routes protégées du contrôleur. Une migration vers un `AuthGuard` NestJS reste une amélioration d’architecture possible si d’autres contrôleurs protégés sont ajoutés.

## Routes

Toutes les routes sont préfixées par `/api`.

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/rooms` | Liste des salons |
| GET | `/api/rooms/:id` | Obtenir un salon |
| POST | `/api/rooms` | Créer un salon |
| PATCH | `/api/rooms/:id` | Modifier un salon |
| DELETE | `/api/rooms/:id` | Supprimer un salon |
| GET | `/api/rooms/invitations/me` | Invitations de l'utilisateur connecté |
| POST | `/api/rooms/:id/invitations` | Inviter un utilisateur |
| POST | `/api/rooms/:id/invitations/accept` | Accepter une invitation |
| POST | `/api/rooms/:id/invitations/refuse` | Refuser une invitation |
| POST | `/api/rooms/:id/join` | Rejoindre un salon |
| POST | `/api/rooms/:id/leave` | Quitter un salon |
| GET | `/api/health` | Vérifier le service et PostgreSQL |

## Permissions

- Le créateur d'un salon devient automatiquement son hôte et son premier membre.
- Seul l'hôte ou un administrateur peut modifier ou supprimer un salon.
- Seul l'hôte ou un administrateur peut inviter dans un salon privé.
- Un utilisateur peut rejoindre librement un salon public.
- Un utilisateur doit être invité pour rejoindre un salon privé.
- L'hôte ne peut pas quitter son propre salon; il doit supprimer le salon.

## Installation locale

Prérequis : Node.js 22 et PostgreSQL, ou Docker.

### Option recommandée : Docker

Pour tester le service sans configuration PostgreSQL manuelle :

```bash
docker compose -f compose.local.yml up --build
```

Le Compose local crée une base `chatvardage_rooms` avec l'utilisateur `room_service`, exactement comme `.env.example`.

Par défaut, ce compose force `NODE_ENV=development`, cherche le service Auth sur l'hôte à l'adresse `http://host.docker.internal:3001` et autorise `http://localhost:5173` pour CORS. Les variables `AUTH_SERVICE_URL` et `CORS_ORIGINS` peuvent être redéfinies au lancement si nécessaire. Sous Linux, l'alias `host.docker.internal` repose sur `host-gateway`, disponible avec Docker Engine 20.10 ou plus récent.

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

En production, `CORS_ORIGINS` doit être défini explicitement et chaque entrée doit être une origine HTTP(S) valide, sans chemin (par exemple `https://app.example.com`). Le fallback `http://localhost:5173` dans le code est réservé aux environnements hors production; `compose.local.yml` fournit explicitement cette origine pour le conteneur local. `AUTH_SERVICE_URL` doit également utiliser HTTPS en production.

## Variables d'environnement

```env
NODE_ENV=development
PORT=3003
DATABASE_URL="postgresql://room_service:room_service_dev@localhost:5432/chatvardage_rooms?schema=public"
AUTH_SERVICE_URL="http://localhost:3001"
CORS_ORIGINS="http://localhost:5173"
```

## Exemple — créer un salon

```bash
curl -X POST http://localhost:3003/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_USER_1>" \
  -d '{"nom":"general","visibilite":"public"}'
```

Réponse :

```json
{
  "type": "salon",
  "id": "...",
  "nom": "general",
  "visibilite": "public",
  "hoteId": "user-1",
  "membreIds": ["user-1"],
  "membresInvites": []
}
```

## Exemple — salon privé et invitation

Créer le salon :

```bash
curl -X POST http://localhost:3003/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_USER_1>" \
  -d '{"nom":"equipe-privee","visibilite":"prive"}'
```

Inviter un utilisateur :

```bash
curl -X POST http://localhost:3003/api/rooms/<ROOM_ID>/invitations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_USER_1>" \
  -d '{"utilisateurId":"user-2"}'
```

Accepter l'invitation avec `user-2` :

```bash
curl -X POST http://localhost:3003/api/rooms/<ROOM_ID>/invitations/accept \
  -H "Authorization: Bearer <JWT_USER_2>"
```

## Base de données

Le service possède trois modèles :

```text
Room
├── id
├── name
├── visibility
├── ownerId
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
