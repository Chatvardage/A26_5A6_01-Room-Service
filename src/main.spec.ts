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
  addApiKey: jest.fn().mockReturnThis(),
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
  ApiNoContentResponse: decorator,
  ApiProperty: decorator,
  ApiPropertyOptional: decorator,
}));

describe('bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('configure et démarre sur PORT', async () => {
    process.env.PORT = '3999';
    await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(app.enableCors).toHaveBeenCalled();
    expect(app.useGlobalPipes).toHaveBeenCalled();
    expect(builder.setTitle).toHaveBeenCalledWith('Chatvardage Rooms Service');
    expect(builder.setDescription).toHaveBeenCalled();
    expect(builder.setVersion).toHaveBeenCalledWith('2.0.0');
    expect(builder.addApiKey).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenCalled();
    expect(listen).toHaveBeenCalledWith(3999, '0.0.0.0');
  });

  it('utilise 3003 par défaut', async () => {
    delete process.env.PORT;
    await import('./main');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(listen).toHaveBeenCalledWith(3003, '0.0.0.0');
  });
});
