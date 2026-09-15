## Room-Service — finalisation Contrôle 2

Cette PR finalise le **Room-Service** de Chatvardage et l'aligne avec l'architecture multiservice retenue pour le Contrôle 2.

### Changements principaux

- finalisation du CRUD et de l'administration des salons publics/privés;
- gestion de l'hôte, des membres et des invitations;
- permissions centralisées pour l'hôte et le rôle `admin`;
- persistance avec Prisma + PostgreSQL;
- conservation du contrat `Salon` compatible avec le Frontend du Contrôle 1;
- intégration prévue derrière `Serveur-API` avec `x-user-id` et `x-user-role`;
- correction de la configuration Docker/PostgreSQL et ajout des healthchecks;
- migrations Prisma exécutées au démarrage du conteneur;
- documentation Swagger/OpenAPI et README mis à jour;
- suppression du code NestJS généré devenu inutile et de l'ancienne configuration Vitest;
- Jest conservé comme framework de tests du dépôt;
- ajout/correction des tests unitaires du service et du contrôleur;
- remplacement du E2E `Hello World` par des scénarios propres au Room-Service;
- ajout de `AGENTS.md` avec les règles du dépôt, les responsabilités, les commandes de validation et la checklist avant PR.

### Limites volontaires du service

Le Room-Service ne gère pas les messages privés, Redis/WebSocket, l'authentification ni les préférences utilisateur. Ces responsabilités appartiennent respectivement à `Message-Service`, `Authentification` et `User-Config-Service`. Les messages de groupe sont volontairement reportés à un contrôle ultérieur conformément à l'énoncé.

### Vérifications à exécuter avant le merge

```bash
npm ci
npm run lint
npm test
npm run test:e2e
npm run build
npm run test:cov
npx prettier --check "src/**/*.ts" "test/**/*.ts" AGENTS.md
```

Pour valider le service avec PostgreSQL :

```bash
docker compose -f compose.local.yml up --build
curl http://localhost:3003/api/health
```

### Impact sur les autres dépôts

- `Serveur-API` doit transmettre l'identité validée via `x-user-id` et `x-user-role`.
- `Frontend` peut continuer à utiliser le format `Salon` du Contrôle 1.
- `Infra` devra référencer ce service et sa base/configuration dans le `docker-compose.yml` global.

Le Room-Service est maintenant limité à une responsabilité claire : **gérer et persister les salons et leurs membres**.
