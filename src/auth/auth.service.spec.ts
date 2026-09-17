import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.AUTH_SERVICE_URL;
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

  it('rejects an empty user id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: '   ',
        pseudo: 'p',
        courriel: 'a@b.ca',
        role: 'admin',
        cree_le: 'x',
        modifie_le: 'x',
      }),
    });

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects missing user information', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'u1',
      }),
    });

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps 401 to unauthorized', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(
      new AuthService().authenticate('Bearer bad'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('maps Auth failures to unavailable', async () => {
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
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      })
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

  it('rejects non-success and malformed Auth responses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(new AuthService().authenticate('Bearer jwt')).rejects.toThrow(
      "Réponse invalide du service d'authentification : champs utilisateur invalides",
    );
  });
});
