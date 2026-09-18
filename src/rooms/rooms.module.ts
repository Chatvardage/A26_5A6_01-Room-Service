import { Module } from '@nestjs/common';
import { AdminRoomsController } from './admin-rooms.controller';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController, AdminRoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
