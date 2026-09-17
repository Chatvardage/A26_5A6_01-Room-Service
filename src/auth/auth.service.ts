import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export type AuthenticatedUser = {
  id: string;
  pseudo: string;
  courriel: string;
  role: 'admin' | 'moderateur' | 'utilisateur';
  cree_le: string;
  modifie_le: string;
};

const VALID_ROLES = ['admin', 'moderateur', 'utilisateur'] as const;

@Injectable()
export class AuthService {
  async authenticate(authorization?: string): Promise<AuthenticatedUser> {
    if (!authorization?.match(/^Bearer\s+\S+/i)) {
      throw new UnauthorizedException('Authorization Bearer requis');
    }

    const baseUrl = (
      process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001'
    ).replace(/\/$/, '');

    let response: Response;

    try {
      response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException(
        "Service d'authentification indisponible",
      );
    }

    if (response.status === 401) {
      throw new UnauthorizedException('Jeton invalide, expiré ou révoqué');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        "Validation de l'authentification impossible",
      );
    }

    let user: Partial<AuthenticatedUser>;

    try {
      user = (await response.json()) as Partial<AuthenticatedUser>;
    } catch {
      throw new ServiceUnavailableException(
        "Réponse invalide du service d'authentification",
      );
    }

    if (
      typeof user.id !== 'string' ||
      user.id.trim() === '' ||
      typeof user.pseudo !== 'string' ||
      user.pseudo.trim() === '' ||
      typeof user.courriel !== 'string' ||
      user.courriel.trim() === '' ||
      !VALID_ROLES.includes(user.role as (typeof VALID_ROLES)[number]) ||
      typeof user.cree_le !== 'string' ||
      typeof user.modifie_le !== 'string'
    ) {
      throw new ServiceUnavailableException(
        "Réponse invalide du service d'authentification",
      );
    }

    return user as AuthenticatedUser;
  }
}
