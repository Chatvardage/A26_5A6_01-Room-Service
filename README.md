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

L'authentification est effectuée par le **Auth/User Service** et l'API Gateway.

Le Rooms Service reçoit l'identité validée dans les en-têtes internes :

```http
x-user-id: <id utilisateur>
x-user-role: user | moderator | admin
```

En production, le Rooms Service ne doit pas être exposé directement à Internet. Ces en-têtes doivent être ajoutés par l'API Gateway après validation du JWT.

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

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

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

Dans l'environnement final de l'équipe, ce service doit plutôt être référencé depuis le `docker-compose.yml` global avec les autres microservices et Redis.

## Variables d'environnement

```env
PORT=3003
DATABASE_URL="postgresql://room_service:room_service_dev@localhost:5432/chatvardage_rooms?schema=public"
```

## Exemple — créer un salon

```bash
curl -X POST http://localhost:3003/api/rooms \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-1" \
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
  -H "x-user-id: user-1" \
  -d '{"nom":"equipe-privee","visibilite":"prive"}'
```

Inviter un utilisateur :

```bash
curl -X POST http://localhost:3003/api/rooms/<ROOM_ID>/invitations \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-1" \
  -d '{"utilisateurId":"user-2"}'
```

Accepter l'invitation avec `user-2` :

```bash
curl -X POST http://localhost:3003/api/rooms/<ROOM_ID>/invitations/accept \
  -H "x-user-id: user-2"
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
