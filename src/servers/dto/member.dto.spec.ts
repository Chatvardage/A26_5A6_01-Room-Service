import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  LIMITE_MEMBRES_MAX,
  ListMembersQueryDto,
  PageQueryDto,
} from './member.dto';

async function lire(query: Record<string, unknown>) {
  const dto = plainToInstance(ListMembersQueryDto, query);
  return { dto, erreurs: await validate(dto) };
}

describe('ListMembersQueryDto', () => {
  it('convertit decalage et limite en nombres', async () => {
    const { dto, erreurs } = await lire({ decalage: '50', limite: '25' });
    expect(erreurs).toEqual([]);
    expect(dto).toMatchObject({ decalage: 50, limite: 25 });
  });

  it('découpe ids : espaces, vides et doublons retirés', async () => {
    const { dto, erreurs } = await lire({ ids: ' a, b ,,a ' });
    expect(erreurs).toEqual([]);
    expect(dto.ids).toEqual(['a', 'b']);
  });

  it('refuse des bornes invalides', async () => {
    for (const query of [
      { decalage: '-1' },
      { decalage: 'x' },
      { limite: '0' },
      { limite: String(LIMITE_MEMBRES_MAX + 1) },
      {
        ids: Array.from(
          { length: LIMITE_MEMBRES_MAX + 1 },
          (_, i) => `u${i}`,
        ).join(','),
      },
      { ids: 'x'.repeat(256) },
    ]) {
      expect((await lire(query)).erreurs).not.toEqual([]);
    }
  });

  it('refuse ids qui ne serait pas une chaîne', async () => {
    const { erreurs } = await lire({ ids: 5 });
    expect(erreurs).not.toEqual([]);
  });

  it('tout est facultatif', async () => {
    expect((await lire({})).erreurs).toEqual([]);
  });
});

describe('PageQueryDto', () => {
  it('convertit et borne decalage et limite', async () => {
    const valide = plainToInstance(PageQueryDto, {
      decalage: '10',
      limite: '20',
    });
    expect(await validate(valide)).toEqual([]);
    expect(valide).toMatchObject({ decalage: 10, limite: 20 });
    for (const query of [
      { decalage: '-1' },
      { limite: '0' },
      { limite: '101' },
    ]) {
      expect(await validate(plainToInstance(PageQueryDto, query))).not.toEqual(
        [],
      );
    }
  });
});
