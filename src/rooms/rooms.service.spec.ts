import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from './rooms.service';

const makeRoom = (overrides: any = {}) => ({
  id: 'room-1',
  name: 'general',
  visibility: 'public' as const,
  createdBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  members: [{ roomId: 'room-1', userId: 'user-1', joinedAt: new Date() }],
  invitations: [],
  ...overrides,
});

describe('RoomsService', () => {
  let service: RoomsService;
  let prisma: any;
  beforeEach(() => {
    prisma = {
      room: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      roomMember: { create: jest.fn(), delete: jest.fn(), upsert: jest.fn() },
      roomInvitation: { create: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new RoomsService(prisma as PrismaService);
  });

  it('findAll anonyme ne récupère que les salons publics', async () => {
    prisma.room.findMany.mockResolvedValue([makeRoom()]);
    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({ nom: 'general', membreIds: ['user-1'] }),
    ]);
    expect(prisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { visibility: 'public' } }),
    );
  });

  it('findAll authentifié inclut les salons publics et ses salons privés', async () => {
    prisma.room.findMany.mockResolvedValue([
      makeRoom(),
      makeRoom({
        id: 'room-2',
        name: 'secret',
        visibility: 'prive',
        members: [{ userId: 'user-2' }],
      }),
    ]);

    await expect(service.findAll('user-2')).resolves.toEqual([
      expect.objectContaining({ id: 'room-1', visibilite: 'public' }),
      expect.objectContaining({ id: 'room-2', visibilite: 'prive' }),
    ]);
    expect(prisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { visibility: 'public' },
            { members: { some: { userId: 'user-2' } } },
          ],
        },
      }),
    );
  });

  it('findAllForAdmin liste tous les salons pour un administrateur', async () => {
    prisma.room.findMany.mockResolvedValue([
      makeRoom(),
      makeRoom({ id: 'room-2', visibility: 'prive' }),
    ]);

    await expect(service.findAllForAdmin('admin')).resolves.toHaveLength(2);
    expect(prisma.room.findMany).toHaveBeenCalledWith({
      include: expect.any(Object),
      orderBy: { createdAt: 'asc' },
    });
  });

  it('findAllForAdmin refuse un moderateur', async () => {
    await expect(service.findAllForAdmin('moderateur')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.room.findMany).not.toHaveBeenCalled();
  });

  it('findAccessibleOne anonyme filtre directement sur les salons publics', async () => {
    prisma.room.findFirst.mockResolvedValue(makeRoom());

    await expect(service.findAccessibleOne('room-1')).resolves.toEqual(
      expect.objectContaining({ id: 'room-1' }),
    );
    expect(prisma.room.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'room-1', visibility: 'public' },
      }),
    );
  });

  it('findAccessibleOne authentifié autorise un salon privé dont il est membre', async () => {
    prisma.room.findFirst.mockResolvedValue(
      makeRoom({
        visibility: 'prive',
        members: [{ userId: 'user-2' }],
      }),
    );

    await expect(
      service.findAccessibleOne('room-1', 'user-2'),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'room-1', visibilite: 'prive' }),
    );
    expect(prisma.room.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'room-1',
          OR: [
            { visibility: 'public' },
            { members: { some: { userId: 'user-2' } } },
          ],
        },
      }),
    );
  });

  it('findAccessibleOne masque un salon privé non accessible ou inexistant avec un 404', async () => {
    prisma.room.findFirst.mockResolvedValue(null);
    await expect(
      service.findAccessibleOne('room-1', 'user-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne retourne un salon pour les flux internes authentifiés', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom({ visibility: 'prive' }));
    await expect(service.findOne('room-1')).resolves.toEqual(
      expect.objectContaining({ id: 'room-1', visibilite: 'prive' }),
    );
  });
  it('findInvitationsForUser filtre et mappe', async () => {
    prisma.room.findMany.mockResolvedValue([
      makeRoom({ invitations: [{ userId: 'user-2' }] }),
    ]);
    const result = await service.findInvitationsForUser('user-2');
    expect(prisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invitations: { some: { userId: 'user-2' } } },
      }),
    );
    expect(result[0].membresInvites).toEqual(['user-2']);
  });

  it('create trim le nom et utilise public par défaut pour un moderateur', async () => {
    prisma.room.create.mockResolvedValue(makeRoom());
    await service.create({ nom: '  general  ' }, 'user-1', 'moderateur');
    expect(prisma.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'general',
          visibility: 'public',
          createdBy: 'user-1',
        }),
      }),
    );
  });
  it('create respecte une visibilité fournie pour un admin', async () => {
    prisma.room.create.mockResolvedValue(makeRoom({ visibility: 'prive' }));
    await service.create(
      { nom: 'privé', visibilite: 'prive' },
      'user-1',
      'admin',
    );
    expect(prisma.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: 'prive' }),
      }),
    );
  });
  it('create refuse un utilisateur simple', async () => {
    await expect(
      service.create({ nom: 'x' }, 'user-1', 'utilisateur'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.room.create).not.toHaveBeenCalled();
  });

  it('update modifie nom et visibilité pour un moderateur, même sur un salon créé par un autre', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    prisma.room.update.mockResolvedValue(
      makeRoom({ name: 'equipe', visibility: 'prive' }),
    );
    const result = await service.update(
      'room-1',
      { nom: ' equipe ', visibilite: 'prive' },
      'moderateur',
    );
    expect(result.nom).toBe('equipe');
    expect(prisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'equipe', visibility: 'prive' },
      }),
    );
  });
  it('update accepte seulement le nom pour un admin', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    prisma.room.update.mockResolvedValue(makeRoom({ name: 'x' }));
    await service.update('room-1', { nom: 'x' }, 'admin');
    expect(prisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'x' } }),
    );
  });
  it('update accepte seulement la visibilité pour un admin', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    prisma.room.update.mockResolvedValue(makeRoom({ visibility: 'prive' }));
    await service.update('room-1', { visibilite: 'prive' }, 'admin');
    expect(prisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { visibility: 'prive' } }),
    );
  });
  it('update refuse un DTO vide', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    await expect(
      service.update('room-1', {}, 'moderateur'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('update refuse un utilisateur simple, même créateur du salon', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    await expect(
      service.update('room-1', { nom: 'x' }, 'utilisateur'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.room.update).not.toHaveBeenCalled();
  });
  it('update produit un 404 si le salon est introuvable', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(
      service.update('absent', { nom: 'x' }, 'admin'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove autorise un moderateur et supprime un salon qu’il n’a pas créé', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    prisma.room.delete.mockResolvedValue(makeRoom());
    await service.remove('room-1', 'moderateur');
    expect(prisma.room.delete).toHaveBeenCalledWith({
      where: { id: 'room-1' },
    });
  });
  it('remove autorise admin et supprime', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    prisma.room.delete.mockResolvedValue(makeRoom());
    await service.remove('room-1', 'admin');
    expect(prisma.room.delete).toHaveBeenCalledWith({
      where: { id: 'room-1' },
    });
  });
  it('remove refuse un utilisateur simple', async () => {
    await expect(
      service.remove('room-1', 'utilisateur'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.room.findUnique).not.toHaveBeenCalled();
    expect(prisma.room.delete).not.toHaveBeenCalled();
  });
  it('remove produit un 404 si le salon est introuvable', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(service.remove('absent', 'admin')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.room.delete).not.toHaveBeenCalled();
  });

  it('invite refuse un utilisateur simple avant même de charger le salon', async () => {
    await expect(
      service.invite('room-1', 'user-2', 'utilisateur'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.room.findUnique).not.toHaveBeenCalled();
  });
  it('invite refuse un salon public', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    await expect(
      service.invite('room-1', 'user-2', 'moderateur'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('invite retourne le salon si utilisateur déjà membre', async () => {
    const room = makeRoom({
      visibility: 'prive',
      members: [{ userId: 'user-1' }, { userId: 'user-2' }],
    });
    prisma.room.findUnique.mockResolvedValue(room);
    await expect(
      service.invite('room-1', 'user-2', 'moderateur'),
    ).resolves.toEqual(
      expect.objectContaining({ membreIds: ['user-1', 'user-2'] }),
    );
    expect(prisma.roomInvitation.create).not.toHaveBeenCalled();
  });
  it('invite crée une nouvelle invitation puis recharge, y compris pour un salon créé par un autre', async () => {
    const before = makeRoom({ visibility: 'prive' });
    const after = makeRoom({
      visibility: 'prive',
      invitations: [{ userId: 'user-2' }],
    });
    prisma.room.findUnique
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    prisma.roomInvitation.create.mockResolvedValue({});
    const result = await service.invite('room-1', 'user-2', 'admin');
    expect(prisma.roomInvitation.create).toHaveBeenCalled();
    expect(result.membresInvites).toEqual(['user-2']);
  });
  it('invite ne duplique pas une invitation existante', async () => {
    const room = makeRoom({
      visibility: 'prive',
      invitations: [{ userId: 'user-2' }],
    });
    prisma.room.findUnique.mockResolvedValue(room);
    await service.invite('room-1', 'user-2', 'moderateur');
    expect(prisma.roomInvitation.create).not.toHaveBeenCalled();
  });

  it('removeMember refuse un utilisateur simple avant de charger le salon', async () => {
    await expect(
      service.removeMember('room-1', 'user-1', 'utilisateur'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.room.findUnique).not.toHaveBeenCalled();
  });
  it('removeMember produit un 404 si le salon est introuvable', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(
      service.removeMember('absent', 'user-1', 'moderateur'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('removeMember produit un 404 si l’utilisateur n’est pas membre', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    await expect(
      service.removeMember('room-1', 'user-2', 'moderateur'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.roomMember.delete).not.toHaveBeenCalled();
  });
  it('removeMember retire un membre pour un moderateur, même sur un salon créé par un autre', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce(
        makeRoom({ members: [{ userId: 'user-1' }, { userId: 'user-2' }] }),
      )
      .mockResolvedValueOnce(makeRoom());
    prisma.roomMember.delete.mockResolvedValue({});
    const result = await service.removeMember('room-1', 'user-2', 'moderateur');
    expect(prisma.roomMember.delete).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: 'room-1', userId: 'user-2' } },
    });
    expect(result.membreIds).toEqual(['user-1']);
  });
  it('removeMember retire un membre pour un admin', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce(
        makeRoom({ members: [{ userId: 'user-1' }, { userId: 'user-2' }] }),
      )
      .mockResolvedValueOnce(makeRoom());
    prisma.roomMember.delete.mockResolvedValue({});
    await service.removeMember('room-1', 'user-2', 'admin');
    expect(prisma.roomMember.delete).toHaveBeenCalled();
  });

  it('acceptInvitation refuse sans invitation', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom({ visibility: 'prive' }));
    await expect(
      service.acceptInvitation('room-1', 'user-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('acceptInvitation transactionne suppression et upsert', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce(
        makeRoom({ visibility: 'prive', invitations: [{ userId: 'user-2' }] }),
      )
      .mockResolvedValueOnce(
        makeRoom({
          visibility: 'prive',
          members: [{ userId: 'user-1' }, { userId: 'user-2' }],
        }),
      );
    prisma.roomInvitation.delete.mockReturnValue('delete-op');
    prisma.roomMember.upsert.mockReturnValue('upsert-op');
    prisma.$transaction.mockResolvedValue([]);
    const result = await service.acceptInvitation('room-1', 'user-2');
    expect(prisma.$transaction).toHaveBeenCalledWith([
      'delete-op',
      'upsert-op',
    ]);
    expect(result.membreIds).toContain('user-2');
  });
  it('refuseInvitation refuse sans invitation', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom({ visibility: 'prive' }));
    await expect(
      service.refuseInvitation('room-1', 'user-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('refuseInvitation supprime puis recharge', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce(
        makeRoom({ visibility: 'prive', invitations: [{ userId: 'user-2' }] }),
      )
      .mockResolvedValueOnce(makeRoom({ visibility: 'prive' }));
    prisma.roomInvitation.delete.mockResolvedValue({});
    await service.refuseInvitation('room-1', 'user-2');
    expect(prisma.roomInvitation.delete).toHaveBeenCalled();
  });
  it('join retourne immédiatement si déjà membre', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    await service.join('room-1', 'user-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('join refuse privé sans invitation', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom({ visibility: 'prive' }));
    await expect(service.join('room-1', 'user-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('join public crée membre sans supprimer invitation', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce(makeRoom())
      .mockResolvedValueOnce(
        makeRoom({ members: [{ userId: 'user-1' }, { userId: 'user-2' }] }),
      );
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        roomMember: { create: prisma.roomMember.create },
        roomInvitation: { delete: prisma.roomInvitation.delete },
      }),
    );
    await service.join('room-1', 'user-2');
    expect(prisma.roomMember.create).toHaveBeenCalled();
    expect(prisma.roomInvitation.delete).not.toHaveBeenCalled();
  });
  it('join privé invité crée membre et supprime invitation', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce(
        makeRoom({ visibility: 'prive', invitations: [{ userId: 'user-2' }] }),
      )
      .mockResolvedValueOnce(
        makeRoom({
          visibility: 'prive',
          members: [{ userId: 'user-1' }, { userId: 'user-2' }],
        }),
      );
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        roomMember: { create: prisma.roomMember.create },
        roomInvitation: { delete: prisma.roomInvitation.delete },
      }),
    );
    await service.join('room-1', 'user-2');
    expect(prisma.roomInvitation.delete).toHaveBeenCalled();
  });
  it('leave autorise le créateur du salon à le quitter', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce(makeRoom())
      .mockResolvedValueOnce(makeRoom({ members: [] }));
    prisma.roomMember.delete.mockResolvedValue({});
    await service.leave('room-1', 'user-1');
    expect(prisma.roomMember.delete).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: 'room-1', userId: 'user-1' } },
    });
  });
  it('leave refuse un non-membre', async () => {
    prisma.room.findUnique.mockResolvedValue(makeRoom());
    await expect(service.leave('room-1', 'user-2')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('leave supprime le membre puis recharge', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce(
        makeRoom({ members: [{ userId: 'user-1' }, { userId: 'user-2' }] }),
      )
      .mockResolvedValueOnce(makeRoom());
    prisma.roomMember.delete.mockResolvedValue({});
    await service.leave('room-1', 'user-2');
    expect(prisma.roomMember.delete).toHaveBeenCalled();
  });
  it('getRoomOrThrow produit 404', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(service.findOne('absent')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
