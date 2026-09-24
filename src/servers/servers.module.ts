import { Module } from '@nestjs/common';
import { InternalController } from '../internal/internal.controller';
import { InternalTokenGuard } from '../internal/internal-token.guard';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { CompatController } from './compat.controller';
import { EvenementsService } from './evenements.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  controllers: [
    ServersController,
    ChannelsController,
    CompatController,
    InternalController,
  ],
  providers: [
    ServersService,
    ChannelsService,
    EvenementsService,
    InternalTokenGuard,
  ],
})
export class ServersModule {}
