import { Injectable } from '@nestjs/common';
import { ClientAuth, UtilisateurAuthentifie } from '../partage/client-auth';

export type AuthenticatedUser = UtilisateurAuthentifie;

/**
 * Valide l'utilisateur auprès d'Authentification pour chaque route protégée
 * (voir RoomAuthGuard). Configuration, cache et traduction des erreurs :
 * src/partage/client-auth.ts, partagé avec Message-Service.
 */
@Injectable()
export class AuthService {
  // Configuration lue et validée au démarrage du service.
  private readonly client = new ClientAuth();

  authenticate(authorization?: string): Promise<AuthenticatedUser> {
    return this.client.authentifier(authorization);
  }
}
