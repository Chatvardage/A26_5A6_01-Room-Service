# AGENTS.md — Chatvardage Room Service

Ce fichier contient les règles de travail pour tout agent IA ou développeur qui modifie ce dépôt.

## Contexte du projet

Ce dépôt est le **Room-Service** de Chatvardage pour le Contrôle 2 du cours `420-5A6-ST – A26`.

Architecture d'équipe :

- `Frontend` : Electron et ChatGateway réel.
- `Serveur-API` : API Gateway / point d'entrée unique.
- `Authentification` : utilisateurs, authentification et rôles.
- `Room-Service` : gestion et administration des salons.
- `Message-Service` : messages privés, historique et temps réel.
- `User-Config-Service` : alias, thème et préférences.
- `Dashboard` : panneau d'administration / AdminJS.
- `Infra` : Docker Compose, PostgreSQL, Redis et orchestration globale.

Le Room-Service ne doit **pas** prendre en charge les messages privés, Redis, le WebSocket, les configurations utilisateur ou l'authentification. Les messages de groupe sont reportés à un contrôle ultérieur.

## Stack

- Node.js 22
- NestJS 11
- TypeScript
- Prisma 6
- PostgreSQL 17
- Jest
- ESLint + Prettier
- Swagger / OpenAPI
- Docker / Docker Compose

## Responsabilités du Room-Service

Le service doit conserver la responsabilité de :

- créer, lire, modifier et supprimer des salons;
- gérer les salons publics et privés;
- gérer les membres d'un salon;
- gérer les invitations aux salons privés;
- rejoindre et quitter un salon;
- appliquer les permissions selon le rôle global de l'appelant (admin/modérateur/utilisateur);
- persister les salons, membres et invitations dans PostgreSQL;
- exposer un healthcheck pour le service et PostgreSQL.

Ne pas déplacer ici les responsabilités des autres microservices.

## Contrat avec le Gateway

Le service est destiné à être appelé derrière `Serveur-API`.

Le Gateway transmet l'identité déjà validée avec :

```http
Authorization: Bearer <JWT>
```

Ne jamais considérer ces en-têtes comme sûrs si le service devient directement exposé à Internet. Dans l'architecture finale, le Room-Service doit rester un service interne.

Toutes les routes sont sous `/api`. Swagger est exposé sous `/docs`.

## Contrat de données avec le Frontend

Conserver, sauf changement coordonné entre les dépôts, le format de salon compatible avec le client Electron :

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

`creePar` (anciennement `hoteId`) est purement informationnel : il indique qui a créé le salon mais n'accorde aucune autorité particulière sur celui-ci. Ce renommage, ainsi que le retrait complet du concept d'« hôte »/« owner » par salon au profit d'une autorisation basée sur le rôle global de l'appelant (`admin`/`moderateur`/`utilisateur`, voir `assertModeratorOrAdmin` dans `RoomsService`), est un changement de contrat volontaire et coordonné avec le dépôt Frontend (branche `feature/moderator-roles`). Les `userId` restent des chaînes. Ne pas ajouter de table `User` ou de clé étrangère vers un utilisateur : les utilisateurs appartiennent au service d'authentification.

## Base de données et Prisma

Schéma principal :

- `Room`
- `RoomMember`
- `RoomInvitation`

Les migrations Prisma sont versionnées dans `prisma/migrations/`.

Après une modification de `prisma/schema.prisma` :

```bash
npx prisma generate
npx prisma migrate dev --name <nom_de_la_migration>
```

Ne jamais modifier une migration déjà appliquée pour masquer un changement. Créer une nouvelle migration.

Dans Docker/déploiement, utiliser :

```bash
npx prisma migrate deploy
```

## Commandes obligatoires avant de terminer une modification

Installer les dépendances de façon reproductible :

```bash
npm ci
```

Puis exécuter au minimum :

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

Pour une modification importante de logique métier, exécuter aussi :

```bash
npm run test:cov
```

Pour vérifier le formatage :

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
```

`npm run format` modifie les fichiers; ne l'utiliser que lorsqu'un formatage automatique est souhaité.

Un agent ne doit pas annoncer que le travail est terminé si une de ces vérifications échoue. Il doit corriger l'erreur ou indiquer clairement ce qui bloque.

## Tests

Framework officiel de ce dépôt : **Jest**. Ne pas réintroduire Vitest sans décision d'équipe.

Lors d'un changement de comportement :

1. ajouter ou modifier les tests concernés;
2. couvrir le chemin nominal;
3. couvrir les permissions et les erreurs importantes;
4. éviter les tests qui vérifient uniquement `toBeDefined()` lorsqu'un comportement peut être testé;
5. mocker `PrismaService` dans les tests unitaires plutôt que dépendre d'une vraie base de données.

Les tests E2E doivent refléter les routes actuelles du Room-Service et ne doivent pas réintroduire le test NestJS par défaut `Hello World`.

## Lint, style et qualité

- Respecter ESLint et Prettier existants.
- Garder TypeScript typé; éviter `any` dans le code de production.
- Garder les contrôleurs minces : validation HTTP/headers et délégation au service.
- Garder la logique métier dans `RoomsService`.
- Garder l'accès aux données via Prisma.
- Réutiliser les helpers de permissions au lieu de dupliquer les règles.
- Valider les entrées avec les DTO et `class-validator`.
- Retourner des erreurs HTTP NestJS explicites (`BadRequestException`, `ForbiddenException`, `NotFoundException`, etc.).
- Ne pas laisser de code généré, mort ou de dépendances inutilisées.

## Docker

Pour tester ce dépôt seul :

```bash
docker compose -f compose.local.yml up --build
```

Le compose local doit lancer :

- Room-Service sur `3003`;
- PostgreSQL;
- les migrations Prisma au démarrage du service.

Healthcheck attendu :

```bash
curl http://localhost:3003/api/health
```

Le `compose.local.yml` sert au développement autonome. L'environnement final est orchestré par le dépôt `Infra`.

Ne pas ajouter Redis au Room-Service uniquement parce que Redis est exigé au Contrôle 2 : Redis/WebSocket appartient au flux temps réel des messages privés dans `Message-Service`.

## Documentation

Toute modification d'une route, d'un DTO, d'une permission, d'une variable d'environnement, d'un port ou d'une procédure de lancement doit mettre à jour :

- Swagger/OpenAPI lorsque pertinent;
- `README.md`;
- `.env.example` lorsque pertinent;
- ce fichier `AGENTS.md` si les règles de développement changent.

Le README doit rester suffisant pour démarrer et tester le service sans connaissance implicite du projet.

## Avant une Pull Request

Vérifier :

- [ ] le changement reste dans la responsabilité du Room-Service;
- [ ] aucun secret ou `.env` réel n'est commité;
- [ ] les migrations Prisma nécessaires sont présentes;
- [ ] `npm run lint` passe;
- [ ] `npm test` passe;
- [ ] `npm run test:e2e` passe;
- [ ] `npm run build` passe;
- [ ] `npm run test:cov` a été vérifié pour les changements importants;
- [ ] Swagger et README sont à jour;
- [ ] le compose local fonctionne si Docker/DB ont été modifiés;
- [ ] les changements incompatibles avec Frontend/Serveur-API sont documentés.

Dans la description de PR, résumer les changements, indiquer les tests exécutés et signaler tout impact sur les autres dépôts.

## Couverture obligatoire
- `npm run test:cov` doit terminer avec 100 % Statements, Branches, Functions et Lines.
- Le seuil Jest global est fixé à 100 % : toute baisse fait échouer la commande.
- Toute nouvelle branche de logique doit être accompagnée de tests couvrant succès, refus et erreurs.
- Avant une PR : `npm run lint`, `npm test`, `npm run test:cov`, `npm run test:e2e`, `npm run build`.
