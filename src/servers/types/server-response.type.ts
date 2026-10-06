import type { RoleServeur } from '../permissions';

export type RoleAffiche = 'proprietaire' | 'moderateur' | 'membre';

export interface SalonResponse {
  type: 'salon';
  id: string;
  serveurId: string;
  nom: string;
  position: number;
  acces: 'tous' | 'moderateurs';
  ecriture: 'tous' | 'moderateurs';
  /** Pour l'appelant : peut-il écrire dans ce salon ? */
  peutEcrire: boolean;
  creePar: string | null;
}

export interface MembreResponse {
  utilisateurId: string;
  role: RoleAffiche;
}

export interface ServeurResponse {
  type: 'serveur';
  id: string;
  nom: string;
  icone: string | null;
  public: boolean;
  parDefaut: boolean;
  proprietaireId: string | null;
  /** Rôle effectif de l'appelant, ou null s'il n'est pas membre (aperçu). */
  monRole: RoleServeur | null;
  nombreMembres: number;
  /** Salons visibles par l'appelant (vide pour un simple aperçu). */
  salons: SalonResponse[];
  /** Invitations en attente : visibles des modérateurs et plus seulement. */
  invitations: string[];
}

/**
 * Une page de membres (GET /api/servers/:id/members). La liste complète
 * n'est plus renvoyée avec le serveur : tout le monde est membre du serveur
 * par défaut, elle grossissait avec le nombre de comptes.
 */
export interface PageMembresResponse {
  membres: MembreResponse[];
  total: number;
  /** `decalage` de la page suivante, ou null s'il n'y en a plus. */
  suivant: number | null;
}

/** Une page de la liste admin des serveurs (GET /api/admin/servers). */
export interface PageServeursResponse {
  serveurs: ServeurResumeResponse[];
  total: number;
  suivant: number | null;
}

export interface ServeurResumeResponse {
  type: 'serveur';
  id: string;
  nom: string;
  icone: string | null;
  public: boolean;
  nombreMembres: number;
}

export interface InvitationResponse {
  serveur: ServeurResumeResponse;
  invitePar: string;
  inviteLe: string;
}

/** Accès d'un utilisateur à un salon, pour Message-Service (route interne). */
export interface AccesSalonResponse {
  salonId: string;
  serveurId: string;
  estMembre: boolean;
  peutLire: boolean;
  peutEcrire: boolean;
  /** Modérateur du serveur (ou propriétaire, admin) : peut supprimer les
   * messages des autres dans ce salon. */
  peutModerer: boolean;
}

/** Un salon lisible par un utilisateur, pour Message-Service (route interne). */
export interface SalonLisibleResponse {
  salonId: string;
  serveurId: string;
  /** Arrivée de l'utilisateur dans le serveur (ISO 8601) ; `null` sans
   * ligne de membre (admin global non membre, serveur par défaut pas encore
   * rejoint). Message-Service ne compte les non-lus qu'à partir de là. */
  depuis: string | null;
}
