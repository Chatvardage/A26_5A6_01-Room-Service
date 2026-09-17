import {
  BadGatewayException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthService,
  resolveAuthServiceUrl,
  resolveAuthTimeoutMs,
} from './auth.service';

describe('AuthService', () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.AUTH_SERVICE_URL;
    delete process.env.AUTH_TIMEOUT_MS;
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    jest.restoreAllMocks();
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
    ).rejects.toBeInstanceOf(BadGatewayException);
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
      BadGatewayException,
    );
    await expect(service.authenticate('Bearer jwt')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(service.authenticate('Bearer jwt')).rejects.toBeInstanceOf(
      BadGatewayException,
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
    ).rejects.toBeInstanceOf(BadGatewayException);
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

  it('logs network failures and maps them to unavailable', async () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(errorLog).toHaveBeenCalledWith(
      'Erreur réseau lors de la validation auprès du service Auth',
    );
  });

  it('logs Auth timeouts separately and maps them to unavailable', async () => {
    const warningLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation();
    const timeout = new Error('timeout');
    timeout.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(timeout);

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(warningLog).toHaveBeenCalledWith(
      'Délai dépassé lors de la validation auprès du service Auth',
    );
  });

  it('handles non-Error network rejections', async () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    global.fetch = jest.fn().mockRejectedValue('network');

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(errorLog).toHaveBeenCalled();
  });

  it('maps a non-JSON Auth response to bad gateway', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('invalid json');
      },
    });

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(BadGatewayException);
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

    await expect(service.authenticate('Bearer jwt')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(service.authenticate('Bearer jwt')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(service.authenticate('Bearer jwt')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('rejects malformed Auth user fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(
      new AuthService().authenticate('Bearer jwt'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('uses a 3000 ms Auth timeout by default', () => {
    delete process.env.AUTH_TIMEOUT_MS;
    expect(resolveAuthTimeoutMs()).toBe(3000);
  });

  it('accepts a configurable positive Auth timeout', () => {
    process.env.AUTH_TIMEOUT_MS = '4500';
    expect(resolveAuthTimeoutMs()).toBe(4500);
  });

  it.each(['abc', '3000.0', '3e3', ''])(
    'rejects a non-integer Auth timeout: %s',
    (timeout) => {
      process.env.AUTH_TIMEOUT_MS = timeout;
      expect(resolveAuthTimeoutMs).toThrow(
        `AUTH_TIMEOUT_MS doit être un entier : "${timeout}"`,
      );
    },
  );

  it('normalizes whitespace around AUTH_TIMEOUT_MS', () => {
    process.env.AUTH_TIMEOUT_MS = ' 4500 ';
    expect(resolveAuthTimeoutMs()).toBe(4500);
  });

  it('rejects a non-positive Auth timeout', () => {
    process.env.AUTH_TIMEOUT_MS = '0';
    expect(resolveAuthTimeoutMs).toThrow(
      'AUTH_TIMEOUT_MS doit être supérieur à 0 : "0"',
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

  it.each([
    'http://auth-service:3001/v1',
    'http://auth-service:3001/v1/',
    'http://auth-service:3001?tenant=chatvardage',
    'http://auth-service:3001#fragment',
  ])('rejects AUTH_SERVICE_URL with path or parameters: %s', (url) => {
    process.env.AUTH_SERVICE_URL = url;

    expect(resolveAuthServiceUrl).toThrow(
      `AUTH_SERVICE_URL ne doit pas contenir de chemin ou paramètres : "${url}"`,
    );
  });
});
