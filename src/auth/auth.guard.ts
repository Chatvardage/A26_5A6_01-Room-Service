import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticatedUser, AuthService } from './auth.service';

const PUBLIC_ROUTE_KEY = 'rooms:public-route';
const OPTIONAL_AUTH_ROUTE_KEY = 'rooms:optional-auth-route';

export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
export const OptionalAuthRoute = () =>
  SetMetadata(OPTIONAL_AUTH_ROUTE_KEY, true);

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class RoomAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isOptionalAuth && !request.headers.authorization) {
      return true;
    }

    request.user = await this.auth.authenticate(request.headers.authorization);
    return true;
  }
}
