import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { RoomAuthGuard } from './auth/auth.guard';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [AuthModule, PrismaModule, RoomsModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RoomAuthGuard,
    },
  ],
})
export class AppModule {}
