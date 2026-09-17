import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
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

export function resolveAuthServiceUrl(): string {
  const baseUrl = (
    process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001'
  ).replace(/\/+$/, '');

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error('AUTH_SERVICE_URL doit être une URL valide');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    parsedUrl.protocol !== 'https:'
  ) {
    throw new Error('AUTH_SERVICE_URL doit utiliser HTTPS en production');
  }

  return baseUrl;
}

export function resolveAuthTimeoutMs(): number {
  const rawTimeout = process.env.AUTH_TIMEOUT_MS ?? '3000';
  const timeoutMs = Number(rawTimeout);

  if (!Number.isInteger(timeoutMs)) {
    throw new Error(`AUTH_TIMEOUT_MS doit être un entier : "${rawTimeout}"`);
  }

  if (timeoutMs <= 0) {
    throw new Error(
      `AUTH_TIMEOUT_MS doit être supérieur à 0 : "${rawTimeout}"`,
    );
  }

  return timeoutMs;
}

@Injectable()
export class AuthService {
  private readonly baseUrl: string;
  private readonly logger = new Logger(AuthService.name);
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = resolveAuthServiceUrl();
    this.timeoutMs = resolveAuthTimeoutMs();
  }

  async authenticate(authorization?: string): Promise<AuthenticatedUser> {
    const bearerMatch = authorization?.match(/^Bearer\s+(\S+)\s*$/i);

    if (!bearerMatch) {
      throw new UnauthorizedException('Authorization Bearer requis');
    }

    const normalizedAuthorization = `Bearer ${bearerMatch[1]}`;

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/auth/me`, {
        headers: { Authorization: normalizedAuthorization },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.logger.warn(
          'Délai dépassé lors de la validation auprès du service Auth',
        );
      } else {
        this.logger.error(
          'Erreur réseau lors de la validation auprès du service Auth',
        );
      }

      throw new ServiceUnavailableException(
        "Service d'authentification indisponible",
      );
    }

    if (response.status === 401) {
      throw new UnauthorizedException('Jeton invalide, expiré ou révoqué');
    }

    if (response.status === 403) {
      throw new ForbiddenException('Accès refusé par le service Auth');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        "Validation de l'authentification impossible",
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new BadGatewayException(
        "Réponse invalide du service d'authentification : JSON illisible",
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadGatewayException(
        "Réponse invalide du service d'authentification : corps JSON non objet",
      );
    }

    const user = payload as Partial<AuthenticatedUser>;

    if (
      typeof user.id !== 'string' ||
      user.id.trim() === '' ||
      typeof user.pseudo !== 'string' ||
      user.pseudo.trim() === '' ||
      typeof user.courriel !== 'string' ||
      user.courriel.trim() === '' ||
      !VALID_ROLES.includes(user.role as (typeof VALID_ROLES)[number]) ||
      typeof user.cree_le !== 'string' ||
      user.cree_le.trim() === '' ||
      typeof user.modifie_le !== 'string' ||
      user.modifie_le.trim() === ''
    ) {
      throw new BadGatewayException(
        "Réponse invalide du service d'authentification : champs utilisateur invalides",
      );
    }

    return user as AuthenticatedUser;
  }
}
