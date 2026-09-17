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
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.PORT;
    delete process.env.CORS_ORIGINS;
  });

  afterEach(() => {
    delete process.env.PORT;
    delete process.env.CORS_ORIGINS;
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

  it('configure plusieurs origines CORS', async () => {
    process.env.CORS_ORIGINS =
      ' http://localhost:5173, http://localhost:3000 , ';

    await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      credentials: false,
    });
  });
});
