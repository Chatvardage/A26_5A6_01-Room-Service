import { RoomsController } from './rooms.controller';

describe('RoomsController', () => {
  let c: RoomsController;
  let s: any;
  let auth: any;
  const user = { id: 'u', role: 'utilisateur' };
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
    auth = { authenticate: jest.fn().mockResolvedValue(user) };
    c = new RoomsController(s, auth);
  });
  it('findAll', () => {
    c.findAll();
    expect(s.findAll).toHaveBeenCalled();
  });
  it('findOne', () => {
    c.findOne('r');
    expect(s.findOne).toHaveBeenCalledWith('r');
  });
  it('findMyInvitations', async () => {
    await c.findMyInvitations('Bearer t');
    expect(auth.authenticate).toHaveBeenCalledWith('Bearer t');
    expect(s.findInvitationsForUser).toHaveBeenCalledWith('u');
  });
  it('create', async () => {
    await c.create({ nom: 'x' }, 'Bearer t');
    expect(s.create).toHaveBeenCalledWith({ nom: 'x' }, 'u');
  });
  it('update uses current role from Auth', async () => {
    auth.authenticate.mockResolvedValue({ id: 'u', role: 'admin' });
    await c.update('r', { nom: 'x' }, 'Bearer t');
    expect(s.update).toHaveBeenCalledWith('r', { nom: 'x' }, 'u', 'admin');
  });
  it('remove', async () => {
    await c.remove('r', 'Bearer t');
    expect(s.remove).toHaveBeenCalledWith('r', 'u', 'utilisateur');
  });
  it('invite', async () => {
    await c.invite('r', { utilisateurId: 'v' }, 'Bearer t');
    expect(s.invite).toHaveBeenCalledWith('r', 'v', 'u', 'utilisateur');
  });
  it('accept', async () => {
    await c.acceptInvitation('r', 'Bearer t');
    expect(s.acceptInvitation).toHaveBeenCalledWith('r', 'u');
  });
  it('refuse', async () => {
    await c.refuseInvitation('r', 'Bearer t');
    expect(s.refuseInvitation).toHaveBeenCalledWith('r', 'u');
  });
  it('join', async () => {
    await c.join('r', 'Bearer t');
    expect(s.join).toHaveBeenCalledWith('r', 'u');
  });
  it('leave', async () => {
    await c.leave('r', 'Bearer t');
    expect(s.leave).toHaveBeenCalledWith('r', 'u');
  });
});
