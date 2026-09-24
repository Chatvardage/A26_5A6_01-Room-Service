import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PublicRoute } from '../auth/auth.guard';
import { ChannelsService } from '../servers/channels.service';
import {
  EN_TETE_JETON_INTERNE,
  InternalTokenGuard,
} from './internal-token.guard';

const ROLES_GLOBAUX = ['admin', 'moderateur', 'utilisateur'] as const;

export class AccesQueryDto {
  @ApiPropertyOptional({
    enum: ROLES_GLOBAUX,
    default: 'utilisateur',
    description:
      "Rôle global de l'utilisateur, issu du JWT validé par l'appelant.",
  })
  @IsOptional()
  @IsIn(ROLES_GLOBAUX)
  role?: (typeof ROLES_GLOBAUX)[number];
}

@ApiTags('Interne')
@ApiHeader({ name: EN_TETE_JETON_INTERNE, required: true })
@Controller('internal')
@PublicRoute()
@UseGuards(InternalTokenGuard)
export class InternalController {
  constructor(private readonly channels: ChannelsService) {}

  @Get('channels/:id/access/:userId')
  @ApiOperation({
    summary: "Accès d'un utilisateur à un salon (pour Message-Service)",
  })
  acces(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Query() query: AccesQueryDto,
  ) {
    return this.channels.acces(id, userId, query.role ?? 'utilisateur');
  }
}
