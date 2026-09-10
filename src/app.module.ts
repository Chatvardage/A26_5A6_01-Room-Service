import { Module } from '@nestjs/common';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [PrismaModule, RoomsModule],
  controllers: [HealthController],
})
export class AppModule {}
