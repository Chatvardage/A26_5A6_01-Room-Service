import { Module } from '@nestjs/common';
import { RoomAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  providers: [AuthService, RoomAuthGuard],
  exports: [AuthService, RoomAuthGuard],
})
export class AuthModule {}
