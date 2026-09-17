import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoomsModule } from './rooms/rooms.module';
import { CreateRoomDto } from './rooms/dto/create-room.dto';
import { UpdateRoomDto } from './rooms/dto/update-room.dto';
import { InviteMemberDto } from './rooms/dto/invite-member.dto';
describe('modules et DTO', () => {
  it('sont chargeables', () => {
    expect(AppModule).toBeDefined();
    expect(AuthModule).toBeDefined();
    expect(PrismaModule).toBeDefined();
    expect(RoomsModule).toBeDefined();
    expect(new CreateRoomDto()).toBeInstanceOf(CreateRoomDto);
    expect(new UpdateRoomDto()).toBeInstanceOf(UpdateRoomDto);
    expect(new InviteMemberDto()).toBeInstanceOf(InviteMemberDto);
  });
});
