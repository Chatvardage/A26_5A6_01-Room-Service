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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Rooms')
@ApiBearerAuth()
@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Récupère tous les salons' })
  findAll() {
    return this.roomsService.findAll();
  }

  @Get('invitations/me')
  @ApiOperation({
    summary: "Récupère les invitations de l'utilisateur connecté",
  })
  async findMyInvitations(@Headers('authorization') authorization?: string) {
    const user = await this.auth.authenticate(authorization);
    return this.roomsService.findInvitationsForUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupère un salon par son identifiant' })
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crée un salon' })
  async create(
    @Body() dto: CreateRoomDto,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.auth.authenticate(authorization);
    return this.roomsService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifie le nom ou la visibilité d’un salon' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.auth.authenticate(authorization);
    return this.roomsService.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprime un salon' })
  @ApiNoContentResponse({ description: 'Salon supprimé' })
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const user = await this.auth.authenticate(authorization);
    await this.roomsService.remove(id, user.id, user.role);
  }

  @Post(':id/invitations')
  @ApiOperation({ summary: 'Invite un utilisateur dans un salon privé' })
  async invite(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.auth.authenticate(authorization);
    return this.roomsService.invite(id, dto.utilisateurId, user.id, user.role);
  }

  @Post(':id/invitations/accept')
  @ApiOperation({ summary: 'Accepte une invitation à un salon' })
  async acceptInvitation(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.auth.authenticate(authorization);
    return this.roomsService.acceptInvitation(id, user.id);
  }

  @Post(':id/invitations/refuse')
  @ApiOperation({ summary: 'Refuse une invitation à un salon' })
  async refuseInvitation(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.auth.authenticate(authorization);
    return this.roomsService.refuseInvitation(id, user.id);
  }

  @Post(':id/join')
  @ApiOperation({
    summary: 'Rejoint un salon public ou un salon privé sur invitation',
  })
  async join(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.auth.authenticate(authorization);
    return this.roomsService.join(id, user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Quitte un salon' })
  async leave(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const user = await this.auth.authenticate(authorization);
    return this.roomsService.leave(id, user.id);
  }
}
