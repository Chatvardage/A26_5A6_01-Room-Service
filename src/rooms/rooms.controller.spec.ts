import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { RoomsController } from './rooms.controller';

describe('RoomsController', () => {
  let controller: RoomsController;
  let roomsService: Record<string, jest.Mock>;

  const request = {
    user: {
      id: 'u',
      pseudo: 'user',
      courriel: 'u@example.test',
      role: 'utilisateur',
      cree_le: '2026-01-01T00:00:00.000Z',
      modifie_le: '2026-01-01T00:00:00.000Z',
    },
  } as AuthenticatedRequest;

  beforeEach(() => {
    roomsService = Object.fromEntries(
      [
        'findAll',
        'findAccessibleOne',
        'findOne',
        'findInvitationsForUser',
        'create',
        'update',
        'remove',
        'invite',
        'acceptInvitation',
        'refuseInvitation',
        'join',
        'leave',
      ].map((key) => [key, jest.fn().mockResolvedValue(key)]),
    );

    controller = new RoomsController(roomsService as never);
  });

  it('marks list as public, details as optional-auth, and writes as protected', () => {
    const reflector = new Reflector();

    // Nest attache les métadonnées à la fonction originale du prototype.
    // Ces références non liées sont donc intentionnelles pour Reflector.get().
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(
      reflector.get<boolean>(
        'rooms:public-route',
        RoomsController.prototype.findAll,
      ),
    ).toBe(true);
    expect(
      reflector.get<boolean>(
        'rooms:optional-auth-route',
        RoomsController.prototype.findOne,
      ),
    ).toBe(true);
    expect(
      reflector.get<boolean>(
        'rooms:public-route',
        RoomsController.prototype.findOne,
      ),
    ).toBeUndefined();
    expect(
      reflector.get<boolean>(
        'rooms:public-route',
        RoomsController.prototype.create,
      ),
    ).toBeUndefined();
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it('findAll', () => {
    controller.findAll();
    expect(roomsService.findAll).toHaveBeenCalled();
  });

  it('findOne reste public sans identité', () => {
    controller.findOne('r', {} as AuthenticatedRequest);
    expect(roomsService.findAccessibleOne).toHaveBeenCalledWith('r', undefined);
  });

  it('findOne transmet l’identité quand le guard optionnel authentifie le client', () => {
    controller.findOne('r', request);
    expect(roomsService.findAccessibleOne).toHaveBeenCalledWith('r', 'u');
  });

  it('findMyInvitations', () => {
    controller.findMyInvitations(request);
    expect(roomsService.findInvitationsForUser).toHaveBeenCalledWith('u');
  });

  it('create', () => {
    controller.create({ nom: 'x' }, request);
    expect(roomsService.create).toHaveBeenCalledWith({ nom: 'x' }, 'u');
  });

  it('rejette proprement une route protégée sans utilisateur', () => {
    expect(() =>
      controller.create({ nom: 'x' }, {} as AuthenticatedRequest),
    ).toThrow(UnauthorizedException);
  });

  it('update uses the current role attached by RoomAuthGuard', () => {
    const adminRequest = {
      ...request,
      user: { ...request.user, role: 'admin' as const },
    } as AuthenticatedRequest;

    controller.update('r', { nom: 'x' }, adminRequest);
    expect(roomsService.update).toHaveBeenCalledWith(
      'r',
      { nom: 'x' },
      'u',
      'admin',
    );
  });

  it('remove', async () => {
    await controller.remove('r', request);
    expect(roomsService.remove).toHaveBeenCalledWith('r', 'u', 'utilisateur');
  });

  it('invite', () => {
    controller.invite('r', { utilisateurId: 'v' }, request);
    expect(roomsService.invite).toHaveBeenCalledWith(
      'r',
      'v',
      'u',
      'utilisateur',
    );
  });

  it('accept', () => {
    controller.acceptInvitation('r', request);
    expect(roomsService.acceptInvitation).toHaveBeenCalledWith('r', 'u');
  });

  it('refuse', () => {
    controller.refuseInvitation('r', request);
    expect(roomsService.refuseInvitation).toHaveBeenCalledWith('r', 'u');
  });

  it('join', () => {
    controller.join('r', request);
    expect(roomsService.join).toHaveBeenCalledWith('r', 'u');
  });

  it('leave', () => {
    controller.leave('r', request);
    expect(roomsService.leave).toHaveBeenCalledWith('r', 'u');
  });
});
