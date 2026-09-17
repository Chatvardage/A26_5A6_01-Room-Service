const listen = jest.fn().mockResolvedValue(undefined);

const app = {
  setGlobalPrefix: jest.fn(),
  enableCors: jest.fn(),
  useGlobalPipes: jest.fn(),
  listen,
};

jest.mock('@nestjs/core', () => ({
  NestFactory: { create: jest.fn().mockResolvedValue(app) },
}));

const build = jest.fn().mockReturnValue({});
const builder = {
  setTitle: jest.fn().mockReturnThis(),
  setDescription: jest.fn().mockReturnThis(),
  setVersion: jest.fn().mockReturnThis(),
  addBearerAuth: jest.fn().mockReturnThis(),
  build,
};

const decorator = () => () => undefined;

jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn(() => builder),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
  ApiTags: decorator,
  ApiOperation: decorator,
  ApiHeader: decorator,
  ApiBearerAuth: decorator,
  ApiNoContentResponse: decorator,
  ApiProperty: decorator,
  ApiPropertyOptional: decorator,
}));

describe('bootstrap', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.PORT;
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.PORT;
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('configure et démarre sur PORT', async () => {
    process.env.PORT = '3999';

    await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://localhost:5173'],
      credentials: false,
    });
    expect(app.useGlobalPipes).toHaveBeenCalled();

    expect(builder.setTitle).toHaveBeenCalledWith('Chatvardage Rooms Service');
    expect(builder.setDescription).toHaveBeenCalled();
    expect(builder.setVersion).toHaveBeenCalledWith('2.0.0');
    expect(builder.addBearerAuth).toHaveBeenCalledWith({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(build).toHaveBeenCalled();
    expect(listen).toHaveBeenCalledWith(3999, '0.0.0.0');
  });

  it('utilise 3003 par défaut', async () => {
    await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(listen).toHaveBeenCalledWith(3003, '0.0.0.0');
  });

  it('configure plusieurs origines CORS valides', async () => {
    process.env.CORS_ORIGINS =
      ' http://localhost:5173, https://app.example.test , ';

    await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://localhost:5173', 'https://app.example.test'],
      credentials: false,
    });
  });

  it('retombe sur localhost si CORS_ORIGINS est vide hors production', async () => {
    process.env.CORS_ORIGINS = '';

    await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://localhost:5173'],
      credentials: false,
    });
  });

  it('refuse de démarrer sans CORS_ORIGINS en production', async () => {
    const main = await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGINS;

    expect(() => main.resolveCorsOrigins()).toThrow(
      'CORS_ORIGINS doit être défini en production',
    );
  });

  it('refuse une origine CORS sans URL valide', async () => {
    const main = await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    process.env.CORS_ORIGINS = '://invalid';

    expect(() => main.resolveCorsOrigins()).toThrow(
      'Origine CORS invalide : ://invalid',
    );
  });

  it('refuse une origine CORS sans schéma HTTP(S)', async () => {
    const main = await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    process.env.CORS_ORIGINS = 'localhost:5173';

    expect(() => main.resolveCorsOrigins()).toThrow(
      'Origine CORS invalide : localhost:5173',
    );
  });

  it('refuse une origine CORS contenant un chemin', async () => {
    const main = await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    process.env.CORS_ORIGINS = 'https://example.test/app';

    expect(() => main.resolveCorsOrigins()).toThrow(
      'Origine CORS invalide : https://example.test/app',
    );
  });
});
