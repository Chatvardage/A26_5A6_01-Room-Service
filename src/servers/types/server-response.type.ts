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
  /** Membres (vide pour un simple aperçu). */
  membres: MembreResponse[];
  /** Invitations en attente : visibles des modérateurs et plus seulement. */
  invitations: string[];
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
}

/**
 * Ancien format « salon » (avant les serveurs), conservé pour la transition :
 * liste admin du Dashboard (GET /api/admin/rooms).
 */
export interface SalonCompatResponse {
  type: 'salon';
  id: string;
  nom: string;
  visibilite: 'public';
  creePar: string | null;
  membreIds: string[];
  membresInvites: string[];
  serveurId: string;
  serveurNom: string;
}
