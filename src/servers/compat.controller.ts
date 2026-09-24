import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { requireUser } from '../auth/request-user';
import { ChannelsService } from './channels.service';
import { ServersService } from './servers.service';

/**
 * Routes de l'ancien contrat « salons autonomes », conservées le temps que
 * le Dashboard passe aux serveurs (voir README, « Transition »). À retirer
 * ensuite. L'ancien `GET /api/rooms/:id` (sans authentification) a été
 * retiré : Message-Service utilise la route interne, et il exposait le nom
 * et les membres de serveurs privés à n'importe qui.
 */
@ApiTags('Compatibilité (transition)')
@ApiBearerAuth()
@Controller()
export class CompatController {
  constructor(
    private readonly servers: ServersService,
    private readonly channels: ChannelsService,
  ) {}

  @Delete('rooms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprime un salon (Dashboard, transition)',
    deprecated: true,
  })
  @ApiNoContentResponse({ description: 'Salon supprimé' })
  async supprimerSalon(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const acteur = requireUser(request);
    this.servers.exigerAdmin(acteur);
    await this.channels.supprimer(id, acteur);
  }

  @Get('admin/rooms')
  @ApiOperation({
    summary: 'Tous les salons (Dashboard, transition)',
    deprecated: true,
  })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  listerSalons(@Req() request: AuthenticatedRequest) {
    return this.channels.listerCompatPourAdmin(requireUser(request));
  }

  @Get('admin/servers')
  @ApiOperation({ summary: "Tous les serveurs (panneau d'administration)" })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  listerServeurs(@Req() request: AuthenticatedRequest) {
    return this.servers.listerPourAdmin(requireUser(request));
  }
}
