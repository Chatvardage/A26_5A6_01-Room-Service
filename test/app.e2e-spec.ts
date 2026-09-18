import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Rooms Service (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let authService: { authenticate: jest.Mock };
  let prisma: {
    $queryRaw: jest.Mock;
    room: {
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const authenticatedUser = {
    id: 'user-e2e',
    pseudo: 'e2e',
    courriel: 'e2e@example.test',
    role: 'utilisateur' as const,
    cree_le: '2026-01-01T00:00:00.000Z',
    modifie_le: '2026-01-01T00:00:00.000Z',
  };

  const adminUser = {
    id: 'admin-e2e',
    pseudo: 'admin-e2e',
    courriel: 'admin-e2e@example.test',
    role: 'admin' as const,
    cree_le: '2026-01-01T00:00:00.000Z',
    modifie_le: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    authService = {
      authenticate: jest.fn(async (authorization?: string) => {
        if (authorization === 'Bearer valid-jwt') {
          return authenticatedUser;
        }
        if (authorization === 'Bearer admin-jwt') {
          return adminUser;
        }
        throw new UnauthorizedException('Authorization Bearer requis');
      }),
    };

    const publicRoom = {
      id: 'public-e2e',
      name: 'public-room',
      visibility: 'public',
      ownerId: 'public-owner',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      members: [
        {
          roomId: 'public-e2e',
          userId: 'public-owner',
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      invitations: [],
    };

    const privateRoom = {
      id: 'private-e2e',
      name: 'secret',
      visibility: 'prive',
      ownerId: authenticatedUser.id,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      members: [
        {
          roomId: 'private-e2e',
          userId: authenticatedUser.id,
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      invitations: [],
    };

    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      room: {
        findMany: jest.fn().mockImplementation(({ where }: any = {}) => {
          if (!where) {
            return [publicRoom, privateRoom];
          }

          const canSeePrivate =
            Array.isArray(where?.OR) &&
            where.OR.some(
              (condition: any) =>
                condition?.members?.some?.userId === authenticatedUser.id,
            );

          return canSeePrivate ? [publicRoom, privateRoom] : [publicRoom];
        }),
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          const isMemberLookup =
            Array.isArray(where?.OR) &&
            where.OR.some(
              (condition: any) =>
                condition?.members?.some?.userId === authenticatedUser.id,
            );

          if (where?.id !== 'private-e2e' || !isMemberLookup) {
            return null;
          }

          return privateRoom;
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.id === 'private-e2e') {
            return privateRoom;
          }
          if (where?.id === 'public-e2e') {
            return publicRoom;
          }
          return null;
        }),
        create: jest.fn().mockResolvedValue({
          id: 'room-e2e',
          name: 'general',
          visibility: 'public',
          ownerId: authenticatedUser.id,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          members: [
            {
              roomId: 'room-e2e',
              userId: authenticatedUser.id,
              joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ],
          invitations: [],
        }),
        delete: jest.fn().mockResolvedValue(privateRoom),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue(authService)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterEach(async () => app.close());

  it('GET /api/health', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'rooms-service',
        database: 'ok',
      }),
    );
  });

  it('POST /api/rooms exige une identité authentifiée', async () => {
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nom: 'general', visibilite: 'public' }),
    });
    expect(response.status).toBe(401);
  });

  it('POST /api/rooms crée un salon avec un JWT valide', async () => {
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-jwt',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ nom: 'general', visibilite: 'public' }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: 'room-e2e',
        nom: 'general',
        hoteId: authenticatedUser.id,
      }),
    );
    expect(authService.authenticate).toHaveBeenCalledWith('Bearer valid-jwt');
    expect(prisma.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: authenticatedUser.id }),
      }),
    );
  });

  it('GET /api/rooms anonyme ne liste que les salons publics', async () => {
    const response = await fetch(`${baseUrl}/api/rooms`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'public-e2e',
        visibilite: 'public',
      }),
    ]);
    expect(authService.authenticate).not.toHaveBeenCalled();
  });

  it('GET /api/rooms avec JWT inclut les salons privés dont l’utilisateur est membre', async () => {
    const response = await fetch(`${baseUrl}/api/rooms`, {
      headers: { authorization: 'Bearer valid-jwt' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'public-e2e',
          visibilite: 'public',
        }),
        expect.objectContaining({
          id: 'private-e2e',
          visibilite: 'prive',
        }),
      ]),
    );
    expect(authService.authenticate).toHaveBeenCalledWith('Bearer valid-jwt');
  });

  it('GET /api/admin/rooms refuse un utilisateur non-admin', async () => {
    const response = await fetch(`${baseUrl}/api/admin/rooms`, {
      headers: { authorization: 'Bearer valid-jwt' },
    });

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/rooms permet à un admin de voir tous les salons', async () => {
    const response = await fetch(`${baseUrl}/api/admin/rooms`, {
      headers: { authorization: 'Bearer admin-jwt' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'public-e2e', visibilite: 'public' }),
        expect.objectContaining({ id: 'private-e2e', visibilite: 'prive' }),
      ]),
    );
    expect(authService.authenticate).toHaveBeenCalledWith('Bearer admin-jwt');
  });

  it('DELETE /api/rooms/:id permet à un admin de supprimer un salon', async () => {
    const response = await fetch(`${baseUrl}/api/rooms/private-e2e`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer admin-jwt' },
    });

    expect(response.status).toBe(204);
    expect(prisma.room.delete).toHaveBeenCalledWith({
      where: { id: 'private-e2e' },
    });
  });

  it('GET /api/rooms/:id masque un salon privé pour un client anonyme', async () => {
    const response = await fetch(`${baseUrl}/api/rooms/private-e2e`);

    expect(response.status).toBe(404);
    expect(authService.authenticate).not.toHaveBeenCalled();
  });

  it('GET /api/rooms/:id permet à un membre authentifié de relire son salon privé', async () => {
    const response = await fetch(`${baseUrl}/api/rooms/private-e2e`, {
      headers: { authorization: 'Bearer valid-jwt' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: 'private-e2e',
        nom: 'secret',
        visibilite: 'prive',
      }),
    );
    expect(authService.authenticate).toHaveBeenCalledWith('Bearer valid-jwt');
  });
});
