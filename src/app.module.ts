import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { RoomAuthGuard } from './auth/auth.guard';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ServersModule } from './servers/servers.module';

@Module({
  imports: [AuthModule, PrismaModule, ServersModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RoomAuthGuard,
    },
  ],
})
export class AppModule {}
