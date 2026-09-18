import { Reflector } from '@nestjs/core';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('est explicitement public malgré le guard global', () => {
    const reflector = new Reflector();
    expect(reflector.get<boolean>('rooms:public-route', HealthController)).toBe(
      true,
    );
  });

  it('retourne ok après requête DB', async () => {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const result = await new HealthController(prisma).health();
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'rooms-service',
        database: 'ok',
      }),
    );
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });
});
