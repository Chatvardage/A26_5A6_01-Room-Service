import {
  peutEcrireSalon,
  peutExpulser,
  peutGererServeur,
  peutModerer,
  peutVoirSalon,
  rang,
  roleEffectif,
} from './permissions';

const serveur = { ownerId: 'owner', isDefault: false };
const parDefaut = { ownerId: null, isDefault: true };
const utilisateur = (id: string) => ({ id, role: 'utilisateur' as const });

describe('permissions', () => {
  describe('roleEffectif', () => {
    it("l'admin global a tous les droits partout", () => {
      expect(roleEffectif(serveur, null, { id: 'x', role: 'admin' })).toBe(
        'admin',
      );
    });

    it('le propriétaire est reconnu par Server.ownerId', () => {
      expect(roleEffectif(serveur, null, utilisateur('owner'))).toBe(
        'proprietaire',
      );
    });

    it('sinon le rôle du membre', () => {
      expect(
        roleEffectif(serveur, { role: 'moderateur' }, utilisateur('m')),
      ).toBe('moderateur');
      expect(roleEffectif(serveur, { role: 'membre' }, utilisateur('m'))).toBe(
        'membre',
      );
    });

    it('le modérateur GLOBAL ne donne aucun droit particulier', () => {
      expect(
        roleEffectif(
          serveur,
          { role: 'membre' },
          { id: 'm', role: 'moderateur' },
        ),
      ).toBe('membre');
      expect(roleEffectif(serveur, null, { id: 'm', role: 'moderateur' })).toBe(
        null,
      );
    });

    it('tout le monde est membre du serveur par défaut, même sans ligne', () => {
      expect(roleEffectif(parDefaut, null, utilisateur('n'))).toBe('membre');
    });

    it('non-membre ailleurs', () => {
      expect(roleEffectif(serveur, undefined, utilisateur('n'))).toBeNull();
    });
  });

  it('rang ordonne membre < moderateur < proprietaire < admin', () => {
    expect(
      [null, 'membre', 'moderateur', 'proprietaire', 'admin'].map((r) =>
        rang(r as never),
      ),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it('peutGererServeur / peutModerer', () => {
    expect(peutGererServeur('proprietaire')).toBe(true);
    expect(peutGererServeur('moderateur')).toBe(false);
    expect(peutModerer('moderateur')).toBe(true);
    expect(peutModerer('membre')).toBe(false);
    expect(peutModerer(null)).toBe(false);
  });

  it('salon réservé aux modérateurs : invisible pour un membre', () => {
    const modos = {
      access: 'moderateurs' as const,
      writePolicy: 'tous' as const,
    };
    const tous = { access: 'tous' as const, writePolicy: 'tous' as const };
    expect(peutVoirSalon('membre', modos)).toBe(false);
    expect(peutVoirSalon('moderateur', modos)).toBe(true);
    expect(peutVoirSalon('membre', tous)).toBe(true);
    expect(peutVoirSalon(null, tous)).toBe(false);
  });

  it('écriture réservée (#annonces) : lecture seule pour un membre', () => {
    const annonces = {
      access: 'tous' as const,
      writePolicy: 'moderateurs' as const,
    };
    expect(peutEcrireSalon('membre', annonces)).toBe(false);
    expect(peutEcrireSalon('admin', annonces)).toBe(true);
    expect(
      peutEcrireSalon('membre', { access: 'moderateurs', writePolicy: 'tous' }),
    ).toBe(false);
    expect(
      peutEcrireSalon('membre', { access: 'tous', writePolicy: 'tous' }),
    ).toBe(true);
  });

  it('expulser : modérateur minimum et strictement au-dessus', () => {
    expect(peutExpulser('moderateur', 'membre')).toBe(true);
    expect(peutExpulser('moderateur', 'moderateur')).toBe(false);
    expect(peutExpulser('moderateur', 'proprietaire')).toBe(false);
    expect(peutExpulser('proprietaire', 'moderateur')).toBe(true);
    expect(peutExpulser('membre', null)).toBe(false);
  });
});
