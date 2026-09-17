import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, resolveAuthServiceUrl } from './auth.service';

describe('AuthService', () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.AUTH_SERVICE_URL;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('requires a bearer token', async () => {
    await expect(new AuthService().authenticate()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns the current user from Auth', async () => {
    process.env.AUTH_SERVICE_URL = 'http://auth-service:3001/';

    const user = {
      id: 'u1',
      pseudo: 'p',
      courriel: 'a@b.ca',
      role: 'admin',
      cree_le: 'x',
      modifie_le: 'x',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => user,
    });

    await expect(new AuthService().authenticate('Bearer jwt')).resolves.toEqual(
      user,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://auth-service:3001/api/auth/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer jwt' },
      }),
    );
  });

  it('normalizes the Bearer scheme before forwarding it', async () => {
    const user = {
      id: 'u1',
      pseudo: 'p',
      courriel: 'a@b.ca',
      role: 'utilisateur',
      cree_le: 'x',
      modifie_le: 'x',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => user,
    });

    await new AuthService().authenticate('bearer jwt   ');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer jwt' },
      }),
    );
  });

  it('accepts all valid user roles', async () => {
    const roles = ['admin', 'moderateur', 'utilisateur'] as const;

    for (const role of roles) {
      const user = {
        id: 'u1',
        pseudo: 'p',
        courriel: 'a@b.ca',
        role,
        cree_le: 'x',
        modifie_le: 'x',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => user,
      });

      await expect(
        new AuthService().authenticate('Bearer jwt'),
      ).resolves.toEqual(user);
    }
  });

  it('rejects an invalid role', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'u1',
        pseudo: 'p',
        courriel: 'a@b.ca',
        role: 'superadmin',
        cree_le: 'x',
        modifie_le: 'x',
      }),
    });

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects empty required fields including dates', async () => {
    const validUser = {
      id: 'u1',
      pseudo: 'p',
      courriel: 'a@b.ca',
      role: 'admin',
      cree_le: 'x',
      modifie_le: 'x',
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...validUser, id: '   ' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...validUser, cree_le: '   ' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...validUser, modifie_le: '   ' }),
      });

    const service = new AuthService();

    await expect(service.authenticate('Bearer jwt')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.authenticate('Bearer jwt')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.authenticate('Bearer jwt')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects missing user information', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'u1' }),
    });

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps 401 to unauthorized', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

    await expect(
      new AuthService().authenticate('Bearer bad'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('maps 403 to forbidden', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

    await expect(
      new AuthService().authenticate('Bearer denied'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps other Auth failures to unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps network failures to unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps a non-JSON Auth response to unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('invalid json');
      },
    });

    await expect(new AuthService().authenticate('Bearer jwt')).rejects.toThrow(
      "Réponse invalide du service d'authentification : JSON illisible",
    );
  });

  it('rejects null, arrays and primitive JSON responses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => 'invalid',
      });

    const service = new AuthService();

    await expect(service.authenticate('Bearer jwt')).rejects.toThrow(
      "Réponse invalide du service d'authentification : corps JSON non objet",
    );
    await expect(service.authenticate('Bearer jwt')).rejects.toThrow(
      "Réponse invalide du service d'authentification : corps JSON non objet",
    );
    await expect(service.authenticate('Bearer jwt')).rejects.toThrow(
      "Réponse invalide du service d'authentification : corps JSON non objet",
    );
  });

  it('rejects malformed Auth user fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(new AuthService().authenticate('Bearer jwt')).rejects.toThrow(
      "Réponse invalide du service d'authentification : champs utilisateur invalides",
    );
  });

  it('requires HTTPS for Auth in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SERVICE_URL = 'http://auth.example.test:3001';

    expect(() => new AuthService()).toThrow(
      'AUTH_SERVICE_URL doit utiliser HTTPS en production',
    );
  });

  it('accepts HTTPS for Auth in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SERVICE_URL = 'https://auth.example.test/';

    expect(resolveAuthServiceUrl()).toBe('https://auth.example.test');
  });

  it('rejects an invalid AUTH_SERVICE_URL', () => {
    process.env.AUTH_SERVICE_URL = '://invalid';

    expect(resolveAuthServiceUrl).toThrow(
      'AUTH_SERVICE_URL doit être une URL valide',
    );
  });
});
