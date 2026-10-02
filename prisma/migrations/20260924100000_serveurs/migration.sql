-- Passage des salons autonomes aux serveurs (façon Discord).
-- Décision d'équipe : on repart à zéro. Les anciens salons, membres et
-- invitations (données de test) sont supprimés ; seul le serveur par défaut
-- « Chatvardage » existe au départ, avec #annonces et #général.
-- Les identifiants fixes ci-dessous sont partagés avec Message-Service
-- (message de bienvenue dans #annonces) : ne pas les modifier.

DROP TABLE "RoomInvitation";
DROP TABLE "RoomMember";
DROP TABLE "Room";
DROP TYPE "RoomVisibility";

CREATE TYPE "ServerRole" AS ENUM ('membre', 'moderateur');
CREATE TYPE "ChannelAccess" AS ENUM ('tous', 'moderateurs');
CREATE TYPE "ChannelWrite" AS ENUM ('tous', 'moderateurs');

CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "ownerId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Server_ownerId_idx" ON "Server"("ownerId");
CREATE INDEX "Server_isPublic_idx" ON "Server"("isPublic");

CREATE TABLE "ServerMember" (
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ServerRole" NOT NULL DEFAULT 'membre',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerMember_pkey" PRIMARY KEY ("serverId","userId")
);
CREATE INDEX "ServerMember_userId_idx" ON "ServerMember"("userId");

CREATE TABLE "ServerInvitation" (
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerInvitation_pkey" PRIMARY KEY ("serverId","userId")
);
CREATE INDEX "ServerInvitation_userId_idx" ON "ServerInvitation"("userId");

CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "access" "ChannelAccess" NOT NULL DEFAULT 'tous',
    "writePolicy" "ChannelWrite" NOT NULL DEFAULT 'tous',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Room_serverId_position_idx" ON "Room"("serverId", "position");

ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerInvitation" ADD CONSTRAINT "ServerInvitation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un seul serveur par défaut.
CREATE UNIQUE INDEX "Server_isDefault_unique" ON "Server"("isDefault") WHERE "isDefault";

-- Serveur par défaut « Chatvardage » : public, sans propriétaire (géré par
-- les administrateurs globaux). Tout utilisateur y est ajouté (voir
-- ServersService.listerMesServeurs) et ne peut pas le quitter.
INSERT INTO "Server" ("id", "name", "isPublic", "isDefault", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'Chatvardage', true, true, CURRENT_TIMESTAMP);

-- #annonces : lecture pour tous, écriture réservée aux modérateurs du
-- serveur, donc en pratique aux administrateurs globaux.
INSERT INTO "Room" ("id", "serverId", "name", "position", "access", "writePolicy", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'annonces', 0, 'tous', 'moderateurs', CURRENT_TIMESTAMP);

INSERT INTO "Room" ("id", "serverId", "name", "position", "access", "writePolicy", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'général', 1, 'tous', 'tous', CURRENT_TIMESTAMP);
