import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateRoomDto } from './dto/create-room.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Rooms')
@ApiHeader({
  name: 'x-user-id',
  required: true,
  description: "Identifiant de l'utilisateur authentifié, transmis par l'API Gateway",
})
@ApiHeader({
  name: 'x-user-role',
  required: false,
  description: "Rôle transmis par l'API Gateway (user, moderator ou admin)",
})
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'Récupère tous les salons' })
  findAll() {
    return this.roomsService.findAll();
  }

  @Get('invitations/me')
  @ApiOperation({ summary: "Récupère les invitations de l'utilisateur connecté" })
  findMyInvitations(@Headers('x-user-id') userId?: string) {
    return this.roomsService.findInvitationsForUser(this.requireUserId(userId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupère un salon par son identifiant' })
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crée un salon' })
  create(
    @Body() dto: CreateRoomDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.roomsService.create(dto, this.requireUserId(userId));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifie le nom ou la visibilité d’un salon' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-role') role?: string,
  ) {
    return this.roomsService.update(
      id,
      dto,
      this.requireUserId(userId),
      role ?? 'user',
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprime un salon' })
  @ApiNoContentResponse({ description: 'Salon supprimé' })
  async remove(
    @Param('id') id: string,
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-role') role?: string,
  ): Promise<void> {
    await this.roomsService.remove(
      id,
      this.requireUserId(userId),
      role ?? 'user',
    );
  }

  @Post(':id/invitations')
  @ApiOperation({ summary: 'Invite un utilisateur dans un salon privé' })
  invite(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-role') role?: string,
  ) {
    return this.roomsService.invite(
      id,
      dto.utilisateurId,
      this.requireUserId(userId),
      role ?? 'user',
    );
  }

  @Post(':id/invitations/accept')
  @ApiOperation({ summary: 'Accepte une invitation à un salon' })
  acceptInvitation(
    @Param('id') id: string,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.roomsService.acceptInvitation(id, this.requireUserId(userId));
  }

  @Post(':id/invitations/refuse')
  @ApiOperation({ summary: 'Refuse une invitation à un salon' })
  refuseInvitation(
    @Param('id') id: string,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.roomsService.refuseInvitation(id, this.requireUserId(userId));
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Rejoint un salon public ou un salon privé sur invitation' })
  join(
    @Param('id') id: string,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.roomsService.join(id, this.requireUserId(userId));
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Quitte un salon' })
  leave(
    @Param('id') id: string,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.roomsService.leave(id, this.requireUserId(userId));
  }

  private requireUserId(userId?: string): string {
    if (!userId?.trim()) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }
    return userId;
  }
}
