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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedRequest, OptionalAuthRoute } from '../auth/auth.guard';
import { requireUser } from '../auth/request-user';
import { CreateRoomDto } from './dto/create-room.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Rooms')
@ApiBearerAuth()
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @OptionalAuthRoute()
  @ApiOperation({
    summary:
      'Récupère les salons publics et, avec JWT, les salons privés de l’utilisateur',
  })
  findAll(@Req() request: AuthenticatedRequest) {
    return this.roomsService.findAll(request.user?.id);
  }

  @Get('invitations/me')
  @ApiOperation({
    summary: "Récupère les invitations de l'utilisateur connecté",
  })
  findMyInvitations(@Req() request: AuthenticatedRequest) {
    const user = requireUser(request);
    return this.roomsService.findInvitationsForUser(user.id);
  }

  @Get(':id')
  @OptionalAuthRoute()
  @ApiOperation({
    summary:
      'Récupère un salon public ou un salon privé dont l’utilisateur est membre',
  })
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.roomsService.findAccessibleOne(id, request.user?.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crée un salon',
    description: 'Réservé à un modérateur ou à un administrateur.',
  })
  create(@Body() dto: CreateRoomDto, @Req() request: AuthenticatedRequest) {
    const user = requireUser(request);
    return this.roomsService.create(dto, user.id, user.role);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifie le nom ou la visibilité d’un salon',
    description: 'Réservé à un modérateur ou à un administrateur.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = requireUser(request);
    return this.roomsService.update(id, dto, user.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprime un salon',
    description: 'Réservé à un modérateur ou à un administrateur.',
  })
  @ApiNoContentResponse({ description: 'Salon supprimé' })
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const user = requireUser(request);
    await this.roomsService.remove(id, user.role);
  }

  @Post(':id/invitations')
  @ApiOperation({
    summary: 'Invite un utilisateur dans un salon privé',
    description:
      'Réservé à un modérateur ou à un administrateur. Opération idempotente : si l’utilisateur est déjà membre ou déjà invité, aucun doublon n’est créé et l’état courant du salon est retourné.',
  })
  invite(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = requireUser(request);
    return this.roomsService.invite(id, dto.utilisateurId, user.role);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({
    summary: 'Retire un membre d’un salon',
    description: 'Réservé à un modérateur ou à un administrateur.',
  })
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = requireUser(request);
    return this.roomsService.removeMember(id, userId, user.role);
  }

  @Post(':id/invitations/accept')
  @ApiOperation({ summary: 'Accepte une invitation à un salon' })
  acceptInvitation(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = requireUser(request);
    return this.roomsService.acceptInvitation(id, user.id);
  }

  @Post(':id/invitations/refuse')
  @ApiOperation({ summary: 'Refuse une invitation à un salon' })
  refuseInvitation(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = requireUser(request);
    return this.roomsService.refuseInvitation(id, user.id);
  }

  @Post(':id/join')
  @ApiOperation({
    summary: 'Rejoint un salon public ou un salon privé sur invitation',
  })
  join(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const user = requireUser(request);
    return this.roomsService.join(id, user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Quitte un salon' })
  leave(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const user = requireUser(request);
    return this.roomsService.leave(id, user.id);
  }
}
