import type { ChannelAccess, ChannelWrite, ServerRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';

/**
 * Rôle EFFECTIF d'un utilisateur dans un serveur, du plus fort au plus
 * faible. Seul endroit où ces règles sont définies : services et route
 * interne (Message-Service) s'appuient tous dessus.
 *
 * - `admin` : administrateur global de Chatvardage (Authentification), a
 *   tous les droits dans tous les serveurs.
 * - `proprietaire` : `Server.ownerId`.
 * - `moderateur` / `membre` : `ServerMember.role`.
 *
 * Le rôle global `moderateur` d'Authentification n'accorde AUCUN droit
 * particulier ici : la modération est propre à chaque serveur.
 */
export type RoleServeur = 'admin' | 'proprietaire' | ServerRole;

const RANG: Record<RoleServeur, number> = {
  membre: 1,
  moderateur: 2,
  proprietaire: 3,
  admin: 4,
};

export type ServeurPourPermissions = {
  ownerId: string | null;
  isDefault: boolean;
};

export type Acteur = Pick<AuthenticatedUser, 'id' | 'role'>;

export function roleEffectif(
  serveur: ServeurPourPermissions,
  membre: { role: ServerRole } | null | undefined,
  acteur: Acteur,
): RoleServeur | null {
  if (acteur.role === 'admin') return 'admin';
  if (serveur.ownerId !== null && serveur.ownerId === acteur.id) {
    return 'proprietaire';
  }
  if (membre) return membre.role;
  // Tout le monde est membre du serveur par défaut, même avant que sa
  // ligne ServerMember soit créée (voir ServersService.listerMesServeurs).
  if (serveur.isDefault) return 'membre';
  return null;
}

export function rang(role: RoleServeur | null): number {
  return role === null ? 0 : RANG[role];
}

/** Renommer, rendre public/privé, supprimer le serveur, nommer des modérateurs. */
export function peutGererServeur(role: RoleServeur | null): boolean {
  return rang(role) >= RANG.proprietaire;
}

/** Créer, modifier, supprimer des salons ; voir les invitations en attente. */
export function peutModerer(role: RoleServeur | null): boolean {
  return rang(role) >= RANG.moderateur;
}

export function peutVoirSalon(
  role: RoleServeur | null,
  salon: { access: ChannelAccess },
): boolean {
  if (role === null) return false;
  return salon.access === 'tous' || peutModerer(role);
}

export function peutEcrireSalon(
  role: RoleServeur | null,
  salon: { access: ChannelAccess; writePolicy: ChannelWrite },
): boolean {
  if (!peutVoirSalon(role, salon)) return false;
  return salon.writePolicy === 'tous' || peutModerer(role);
}

/** Expulser : il faut être modérateur ET strictement au-dessus de la cible. */
export function peutExpulser(
  acteur: RoleServeur | null,
  cible: RoleServeur | null,
): boolean {
  return peutModerer(acteur) && rang(acteur) > rang(cible);
}
