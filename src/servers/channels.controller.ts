import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { requireUser } from '../auth/request-user';
import { ChannelsService } from './channels.service';
import { UpdateChannelDto } from './dto/channel.dto';

@ApiTags('Channels')
@ApiBearerAuth()
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Patch(':id')
  @ApiOperation({
    summary: "Modifie le nom, l'accès, l'écriture ou la position d'un salon",
    description: 'Modérateur du serveur minimum.',
  })
  modifier(
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channels.modifier(id, dto, requireUser(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprime un salon',
    description:
      'Modérateur du serveur minimum ; un serveur garde au moins un salon.',
  })
  @ApiNoContentResponse({ description: 'Salon supprimé' })
  async supprimer(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.channels.supprimer(id, requireUser(request));
  }
}
