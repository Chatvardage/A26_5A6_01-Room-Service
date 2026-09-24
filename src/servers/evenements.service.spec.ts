import { PrismaService } from '../prisma/prisma.service';
import { SERVEUR_PAR_DEFAUT_ID } from './default-server';
import { EvenementsService } from './evenements.service';

describe('EvenementsService', () => {
  const originalFetch = global.fetch;
  const ancienJeton = process.env.INTERNAL_SERVICE_TOKEN;
  const ancienneUrl = process.env.MESSAGE_SERVICE_URL;
  let prisma: any;
  let service: EvenementsService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = {
      serverMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ userId: 'a' }, { userId: 'b' }]),
      },
    };
    service = new EvenementsService(prisma as PrismaService);
    process.env.INTERNAL_SERVICE_TOKEN = 'secret';
    delete process.env.MESSAGE_SERVICE_URL;
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.INTERNAL_SERVICE_TOKEN = ancienJeton;
    if (ancienneUrl === undefined) delete process.env.MESSAGE_SERVICE_URL;
    else process.env.MESSAGE_SERVICE_URL = ancienneUrl;
  });

  const corps = () => JSON.parse(fetchMock.mock.calls[0][1].body);

  it('envoie aux membres actuels (chargés) + extras, sans doublon, avec le jeton interne', async () => {
    await service.envoyer('s1', 'invitation', {
      cibleId: 'c',
      extras: ['c', 'a'],
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3004/api/internal/events');
    expect(options.method).toBe('POST');
    expect(options.headers['x-internal-token']).toBe('secret');
    expect(corps()).toEqual({
      serveurId: 's1',
      raison: 'invitation',
      cibleId: 'c',
      utilisateurIds: ['a', 'b', 'c'],
    });
  });

  it('serveur par défaut : « tous », sans liste ni requête en base', async () => {
    await service.envoyer(SERVEUR_PAR_DEFAUT_ID, 'salons', {
      destinataires: ['ignore'],
    });
    expect(prisma.serverMember.findMany).not.toHaveBeenCalled();
    expect(corps()).toEqual({
      serveurId: SERVEUR_PAR_DEFAUT_ID,
      raison: 'salons',
      tous: true,
    });
  });

  it('destinataires fournis : pas de requête en base ; URL configurée', async () => {
    process.env.MESSAGE_SERVICE_URL = 'http://message-service:3004/';
    await service.envoyer('s1', 'salons', { destinataires: ['x'] });
    expect(prisma.serverMember.findMany).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://message-service:3004/api/internal/events',
    );
    expect(corps()).toEqual({
      serveurId: 's1',
      raison: 'salons',
      utilisateurIds: ['x'],
    });
  });

  it.each([undefined, '  '])(
    'ne fait rien sans INTERNAL_SERVICE_TOKEN (%p)',
    async (valeur) => {
      if (valeur === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
      else process.env.INTERNAL_SERVICE_TOKEN = valeur;
      await service.envoyer('s1', 'salons', {});
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('ne fait rien sans destinataire', async () => {
    await service.envoyer('s1', 'salons', { destinataires: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'une réponse HTTP en erreur',
      () => fetchMock.mockResolvedValue({ ok: false, status: 401 }),
    ],
    ['une erreur réseau', () => fetchMock.mockRejectedValue(new Error('down'))],
    ['une erreur non-Error', () => fetchMock.mockRejectedValue('down')],
    [
      'un échec de lecture en base',
      () => prisma.serverMember.findMany.mockRejectedValue(new Error('db')),
    ],
  ])("n'échoue jamais sur %s", async (_cas, preparer) => {
    preparer();
    await expect(service.envoyer('s1', 'salons', {})).resolves.toBeUndefined();
  });

  it('notifier ne bloque pas et ne renvoie rien', () => {
    const envoyer = jest.spyOn(service, 'envoyer').mockResolvedValue();
    expect(service.notifier('s1', 'modifie')).toBeUndefined();
    expect(envoyer).toHaveBeenCalledWith('s1', 'modifie', {});
  });
});
