import {
  LONGUEUR_MIN_JETON_INTERNE,
  motDePasseUrl,
  problemesSecretsProduction,
  verifierSecretsProduction,
} from './secrets-production';

const JETON_SUR = 'x'.repeat(LONGUEUR_MIN_JETON_INTERNE);
const URL_SURE = 'postgresql://room_service:un-vrai-secret@db:5432/rooms';

describe('secrets de production', () => {
  it('ne vérifie rien hors production (valeurs de développement acceptées)', () => {
    for (const NODE_ENV of [undefined, 'development', 'test']) {
      expect(
        problemesSecretsProduction({
          NODE_ENV,
          INTERNAL_SERVICE_TOKEN: 'chatvardage_internal_dev',
          DATABASE_URL: 'postgresql://room_service:room_service_dev@db/rooms',
        }),
      ).toEqual([]);
    }
  });

  it('accepte des secrets propres en production', () => {
    expect(() =>
      verifierSecretsProduction({
        NODE_ENV: ' production ',
        INTERNAL_SERVICE_TOKEN: JETON_SUR,
        DATABASE_URL: URL_SURE,
      }),
    ).not.toThrow();
  });

  it('refuse un jeton interne absent, trop court ou de développement', () => {
    expect(problemesSecretsProduction({ NODE_ENV: 'production' })).toEqual([
      `INTERNAL_SERVICE_TOKEN doit contenir au moins ${LONGUEUR_MIN_JETON_INTERNE} caractères`,
    ]);
    expect(
      problemesSecretsProduction({
        NODE_ENV: 'production',
        INTERNAL_SERVICE_TOKEN: 'court',
      }),
    ).toHaveLength(1);
    // Valeur de développement de l'Infra : refusée par sa longueur.
    expect(
      problemesSecretsProduction({
        NODE_ENV: 'production',
        INTERNAL_SERVICE_TOKEN: 'chatvardage_internal_dev',
      }),
    ).toHaveLength(1);
  });

  it('refuse le mot de passe de base de données de développement, et liste tout', () => {
    expect(() =>
      verifierSecretsProduction({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://room_service:room_service_dev@db/rooms',
      }),
    ).toThrow(
      /NODE_ENV=production.*INTERNAL_SERVICE_TOKEN.*mot de passe de DATABASE_URL/,
    );
  });

  it('lit le mot de passe d’une URL de connexion', () => {
    expect(motDePasseUrl('postgresql://u:p%40ss@h/b')).toBe('p@ss');
    expect(motDePasseUrl('postgresql://u@h/b')).toBeNull();
    expect(motDePasseUrl('pas une url')).toBeNull();
    expect(motDePasseUrl(undefined)).toBeNull();
  });
});
