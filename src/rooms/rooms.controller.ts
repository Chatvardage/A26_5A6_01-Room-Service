import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  RoomAuthGuard,
  PublicRoute,
} from '../auth/auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Rooms')
@ApiBearerAuth()
@UseGuards(RoomAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @PublicRoute()
  @ApiOperation({ summary: 'Récupère tous les salons publics' })
  findAll() {
    return this.roomsService.findAll();
  }

  @Get('invitations/me')
  @ApiOperation({
    summary: "Récupère les invitations de l'utilisateur connecté",
  })
  findMyInvitations(@Req() request: AuthenticatedRequest) {
    return this.roomsService.findInvitationsForUser(request.user.id);
  }

  @Get(':id')
  @PublicRoute()
  @ApiOperation({ summary: 'Récupère un salon public par son identifiant' })
  findOne(@Param('id') id: string) {
    return this.roomsService.findPublicOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crée un salon' })
  create(@Body() dto: CreateRoomDto, @Req() request: AuthenticatedRequest) {
    return this.roomsService.create(dto, request.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifie le nom ou la visibilité d’un salon' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roomsService.update(
      id,
      dto,
      request.user.id,
      request.user.role,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprime un salon' })
  @ApiNoContentResponse({ description: 'Salon supprimé' })
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.roomsService.remove(id, request.user.id, request.user.role);
  }

  @Post(':id/invitations')
  @ApiOperation({ summary: 'Invite un utilisateur dans un salon privé' })
  invite(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roomsService.invite(
      id,
      dto.utilisateurId,
      request.user.id,
      request.user.role,
    );
  }

  @Post(':id/invitations/accept')
  @ApiOperation({ summary: 'Accepte une invitation à un salon' })
  acceptInvitation(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roomsService.acceptInvitation(id, request.user.id);
  }

  @Post(':id/invitations/refuse')
  @ApiOperation({ summary: 'Refuse une invitation à un salon' })
  refuseInvitation(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roomsService.refuseInvitation(id, request.user.id);
  }

  @Post(':id/join')
  @ApiOperation({
    summary: 'Rejoint un salon public ou un salon privé sur invitation',
  })
  join(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.roomsService.join(id, request.user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Quitte un salon' })
  leave(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.roomsService.leave(id, request.user.id);
  }
}
