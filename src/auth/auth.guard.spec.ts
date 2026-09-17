import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AuthService, AuthenticatedUser } from './auth.service';

describe('AuthGuard', () => {
  const user: AuthenticatedUser = {
    id: 'u1',
    pseudo: 'user',
    courriel: 'u@example.test',
    role: 'utilisateur',
    cree_le: '2026-01-01T00:00:00.000Z',
    modifie_le: '2026-01-01T00:00:00.000Z',
  };

  let auth: { authenticate: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let request: AuthenticatedRequest;
  let context: ExecutionContext;

  beforeEach(() => {
    auth = { authenticate: jest.fn().mockResolvedValue(user) };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    request = {
      headers: { authorization: 'Bearer jwt' },
    } as AuthenticatedRequest;

    context = {
      getHandler: jest.fn().mockReturnValue(() => undefined),
      getClass: jest.fn().mockReturnValue(class TestController {}),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    } as unknown as ExecutionContext;
  });

  it('allows explicitly public routes without calling Auth', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const guard = new AuthGuard(
      auth as unknown as AuthService,
      reflector as unknown as Reflector,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it('authenticates protected routes and attaches the user to the request', async () => {
    const guard = new AuthGuard(
      auth as unknown as AuthService,
      reflector as unknown as Reflector,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth.authenticate).toHaveBeenCalledWith('Bearer jwt');
    expect(request.user).toEqual(user);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      'rooms:public-route',
      [context.getHandler(), context.getClass()],
    );
  });

  it('propagates authentication errors', async () => {
    auth.authenticate.mockRejectedValue(new UnauthorizedException('bad token'));
    const guard = new AuthGuard(
      auth as unknown as AuthService,
      reflector as unknown as Reflector,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
