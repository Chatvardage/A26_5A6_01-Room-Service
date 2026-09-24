import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { CompatController } from './compat.controller';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

const user = {
  id: 'bob',
  pseudo: 'bob',
  courriel: 'bob@example.test',
  role: 'utilisateur' as const,
};
const req = { user } as AuthenticatedRequest;

const simuler = (methodes: string[]): Record<string, jest.Mock> =>
  Object.fromEntries(
    methodes.map((nom) => [nom, jest.fn().mockResolvedValue(nom)]),
  );

describe('contrôleurs', () => {
  let servers: Record<string, jest.Mock>;
  let channels: Record<string, jest.Mock>;
  const service = () => servers as unknown as ServersService;
  const salons = () => channels as unknown as ChannelsService;

  beforeEach(() => {
    servers = simuler([
      'listerMesServeurs',
      'decouvrir',
      'mesInvitations',
      'creer',
      'obtenir',
      'listerMembres',
      'modifier',
      'supprimer',
      'rejoindre',
      'quitter',
      'expulser',
      'changerRole',
      'inviter',
      'accepterInvitation',
      'refuserInvitation',
      'listerPourAdmin',
      'exigerAdmin',
    ]);
    channels = simuler([
      'creer',
      'modifier',
      'supprimer',
      'listerCompatPourAdmin',
    ]);
  });

  it('ServersController délègue au service avec l’utilisateur authentifié', async () => {
    const c = new ServersController(service(), salons());
    await c.lister(req);
    expect(servers.listerMesServeurs).toHaveBeenCalledWith(user);
    await c.decouvrir({ q: 'pro' }, req);
    expect(servers.decouvrir).toHaveBeenCalledWith(user, 'pro');
    await c.mesInvitations(req);
    await c.creer({ nom: 'x' }, req);
    expect(servers.creer).toHaveBeenCalledWith({ nom: 'x' }, user);
    await c.obtenir('s', req);
    await c.membres('s', { limite: 10 }, req);
    expect(servers.listerMembres).toHaveBeenCalledWith('s', user, {
      limite: 10,
    });
    await c.modifier('s', { nom: 'y' }, req);
    await expect(c.supprimer('s', req)).resolves.toBeUndefined();
    await c.rejoindre('s', req);
    await expect(c.quitter('s', req)).resolves.toBeUndefined();
    await c.expulser('s', 'alice', req);
    expect(servers.expulser).toHaveBeenCalledWith('s', 'alice', user);
    await c.changerRole('s', 'alice', { role: 'moderateur' }, req);
    expect(servers.changerRole).toHaveBeenCalledWith(
      's',
      'alice',
      'moderateur',
      user,
    );
    await c.inviter('s', { utilisateurId: 'alice' }, req);
    expect(servers.inviter).toHaveBeenCalledWith('s', 'alice', user);
    await c.accepter('s', req);
    await expect(c.refuser('s', req)).resolves.toBeUndefined();
    await c.creerSalon('s', { nom: 'jeux' }, req);
    expect(channels.creer).toHaveBeenCalledWith('s', { nom: 'jeux' }, user);
  });

  it('sans utilisateur authentifié : 401', () => {
    const c = new ServersController(service(), salons());
    expect(() => c.lister({} as AuthenticatedRequest)).toThrow(
      UnauthorizedException,
    );
  });

  it('ChannelsController délègue au service', async () => {
    const c = new ChannelsController(salons());
    await c.modifier('salon', { nom: 'x' }, req);
    expect(channels.modifier).toHaveBeenCalledWith('salon', { nom: 'x' }, user);
    await expect(c.supprimer('salon', req)).resolves.toBeUndefined();
    expect(channels.supprimer).toHaveBeenCalledWith('salon', user);
  });

  it('CompatController : anciennes routes de transition', async () => {
    const c = new CompatController(service(), salons());
    await expect(c.supprimerSalon('salon', req)).resolves.toBeUndefined();
    expect(servers.exigerAdmin).toHaveBeenCalledWith(user);
    expect(channels.supprimer).toHaveBeenCalledWith('salon', user);
    await c.listerSalons(req);
    expect(channels.listerCompatPourAdmin).toHaveBeenCalledWith(user);
    await c.listerServeurs({ limite: 5 }, req);
    expect(servers.listerPourAdmin).toHaveBeenCalledWith(user, { limite: 5 });
  });
});
