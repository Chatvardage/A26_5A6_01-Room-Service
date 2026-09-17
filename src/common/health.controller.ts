import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@PublicRoute()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Vérifie la santé du service et de PostgreSQL' })
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      service: 'rooms-service',
      database: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
