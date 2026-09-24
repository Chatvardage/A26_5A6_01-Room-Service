-- Rename the per-room "owner" concept to a purely informational "createdBy" field.
-- Authorization no longer relies on this column: global roles (admin/moderateur/utilisateur)
-- are now checked instead. This column is kept only to record who created the room.

ALTER TABLE "Room" RENAME COLUMN "ownerId" TO "createdBy";

ALTER INDEX "Room_ownerId_idx" RENAME TO "Room_createdBy_idx";
