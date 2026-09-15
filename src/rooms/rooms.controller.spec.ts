import { UnauthorizedException } from '@nestjs/common';
import { RoomsController } from './rooms.controller';

describe('RoomsController', () => {
  let c: RoomsController;
  let s: any;
  beforeEach(() => {
    s = Object.fromEntries(
      [
        'findAll',
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
      ].map((k) => [k, jest.fn().mockResolvedValue(k)]),
    );
    c = new RoomsController(s);
  });
  it('findAll', () => {
    c.findAll();
    expect(s.findAll).toHaveBeenCalled();
  });
  it('findOne', () => {
    c.findOne('r');
    expect(s.findOne).toHaveBeenCalledWith('r');
  });
  it('findMyInvitations', () => {
    c.findMyInvitations('u');
    expect(s.findInvitationsForUser).toHaveBeenCalledWith('u');
  });
  it('create', () => {
    c.create({ nom: 'x' }, 'u');
    expect(s.create).toHaveBeenCalledWith({ nom: 'x' }, 'u');
  });
  it('update défaut role user', () => {
    c.update('r', { nom: 'x' }, 'u');
    expect(s.update).toHaveBeenCalledWith('r', { nom: 'x' }, 'u', 'user');
  });
  it('update role fourni', () => {
    c.update('r', {}, 'u', 'admin');
    expect(s.update).toHaveBeenCalledWith('r', {}, 'u', 'admin');
  });
  it('remove défaut role user', async () => {
    await c.remove('r', 'u');
    expect(s.remove).toHaveBeenCalledWith('r', 'u', 'user');
  });
  it('remove role fourni', async () => {
    await c.remove('r', 'u', 'admin');
    expect(s.remove).toHaveBeenCalledWith('r', 'u', 'admin');
  });
  it('invite', () => {
    c.invite('r', { utilisateurId: 'v' }, 'u');
    expect(s.invite).toHaveBeenCalledWith('r', 'v', 'u', 'user');
  });
  it('invite admin', () => {
    c.invite('r', { utilisateurId: 'v' }, 'u', 'admin');
    expect(s.invite).toHaveBeenCalledWith('r', 'v', 'u', 'admin');
  });
  it('accept', () => {
    c.acceptInvitation('r', 'u');
    expect(s.acceptInvitation).toHaveBeenCalledWith('r', 'u');
  });
  it('refuse', () => {
    c.refuseInvitation('r', 'u');
    expect(s.refuseInvitation).toHaveBeenCalledWith('r', 'u');
  });
  it('join', () => {
    c.join('r', 'u');
    expect(s.join).toHaveBeenCalledWith('r', 'u');
  });
  it('leave', () => {
    c.leave('r', 'u');
    expect(s.leave).toHaveBeenCalledWith('r', 'u');
  });
  it.each([undefined, '', '   '])('refuse identité invalide %p', (id) => {
    expect(() => c.create({ nom: 'x' }, id)).toThrow(UnauthorizedException);
  });
});
