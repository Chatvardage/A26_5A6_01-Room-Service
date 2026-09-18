import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard';
import type { AuthenticatedUser } from './auth.service';

export function requireUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.user) {
    throw new UnauthorizedException('Utilisateur authentifié requis');
  }

  return request.user;
}
