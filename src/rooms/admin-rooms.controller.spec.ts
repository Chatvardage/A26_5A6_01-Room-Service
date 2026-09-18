import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { AdminRoomsController } from './admin-rooms.controller';

describe('AdminRoomsController', () => {
  let controller: AdminRoomsController;
  let roomsService: { findAllForAdmin: jest.Mock };

  beforeEach(() => {
    roomsService = {
      findAllForAdmin: jest.fn().mockResolvedValue([]),
    };
    controller = new AdminRoomsController(roomsService as never);
  });

  it('transmet le rôle admin au service', () => {
    const request = {
      user: {
        id: 'admin-1',
        pseudo: 'admin',
        courriel: 'admin@example.test',
        role: 'admin',
        cree_le: '2026-01-01T00:00:00.000Z',
        modifie_le: '2026-01-01T00:00:00.000Z',
      },
    } as AuthenticatedRequest;

    controller.findAll(request);

    expect(roomsService.findAllForAdmin).toHaveBeenCalledWith('admin');
  });

  it('rejette une requête sans utilisateur authentifié', () => {
    expect(() => controller.findAll({} as AuthenticatedRequest)).toThrow(
      UnauthorizedException,
    );
  });
});
