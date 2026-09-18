import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { requireUser } from '../auth/request-user';
import { RoomsService } from './rooms.service';

@ApiTags('Admin Rooms')
@ApiBearerAuth()
@Controller('admin/rooms')
export class AdminRoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({
    summary: "Liste tous les salons pour le panneau d'administration",
  })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  findAll(@Req() request: AuthenticatedRequest) {
    const user = requireUser(request);
    return this.roomsService.findAllForAdmin(user.role);
  }
}
