import { Module } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, AuthService],
  exports: [RoomsService],
})
export class RoomsModule {}
