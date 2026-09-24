import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { requireUser } from '../auth/request-user';
import { PageQueryDto } from './dto/member.dto';
import { ServersService } from './servers.service';

/**
 * Routes du panneau d'administration (Dashboard). Les anciennes routes de
 * transition (`GET /api/admin/rooms`, `DELETE /api/rooms/:id`) ont été
 * retirées : utiliser `GET /api/admin/servers`, puis `GET /api/servers/:id`
 * et `/members`, et `DELETE /api/channels/:id`.
 */
@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly servers: ServersService) {}

  @Get('servers')
  @ApiOperation({
    summary: "Tous les serveurs, par pages (panneau d'administration)",
  })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  listerServeurs(
    @Query() query: PageQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.servers.listerPourAdmin(requireUser(request), query);
  }
}
