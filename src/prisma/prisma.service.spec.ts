import { PrismaService } from './prisma.service';
describe('PrismaService lifecycle', () => {
  it('connecte et déconnecte', async () => {
    const s = Object.create(PrismaService.prototype) as PrismaService;
    (s as any).$connect = jest.fn().mockResolvedValue(undefined);
    (s as any).$disconnect = jest.fn().mockResolvedValue(undefined);
    await s.onModuleInit();
    await s.onModuleDestroy();
    expect((s as any).$connect).toHaveBeenCalled();
    expect((s as any).$disconnect).toHaveBeenCalled();
  });
});
