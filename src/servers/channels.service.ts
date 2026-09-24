import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChannelDto, UpdateChannelDto } from './dto/channel.dto';
import { EvenementsService } from './evenements.service';
import {
  Acteur,
  RoleServeur,
  peutEcrireSalon,
  peutModerer,
  peutVoirSalon,
  roleEffectif,
} from './permissions';
import { ServersService } from './servers.service';
import {
  AccesSalonResponse,
  SalonCompatResponse,
  SalonResponse,
} from './types/server-response.type';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
    private readonly evenements: EvenementsService,
  ) {}

  /** Créer un salon : modérateur du serveur minimum. */
  async creer(
    serveurId: string,
    dto: CreateChannelDto,
    acteur: Acteur,
  ): Promise<SalonResponse> {
    const { serveur, role } = await this.servers.contexteVisible(
      serveurId,
      acteur,
    );
    this.servers.exiger(
      peutModerer(role),
      'Action réservée aux modérateurs du serveur',
    );

    // Nouveau salon en fin de liste.
    const position =
      serveur.channels.reduce(
        (max, salon) => Math.max(max, salon.position),
        -1,
      ) + 1;
    const salon = await this.prisma.room.create({
      data: {
        serverId: serveurId,
        name: dto.nom,
        position,
        access: dto.acces ?? 'tous',
        writePolicy: dto.ecriture ?? 'tous',
        createdBy: acteur.id,
      },
    });
    this.evenements.notifier(serveurId, 'salons', {
      destinataires: serveur.members.map((membre) => membre.userId),
    });
    return this.servers.versSalon(salon, role);
  }

  async modifier(
    salonId: string,
    dto: UpdateChannelDto,
    acteur: Acteur,
  ): Promise<SalonResponse> {
    const { role } = await this.contexteModeration(salonId, acteur);
    if (
      dto.nom === undefined &&
      dto.acces === undefined &&
      dto.ecriture === undefined &&
      dto.position === undefined
    ) {
      throw new BadRequestException('Aucune modification fournie');
    }

    const salon = await this.prisma.room.update({
      where: { id: salonId },
      data: {
        ...(dto.nom !== undefined ? { name: dto.nom } : {}),
        ...(dto.acces !== undefined ? { access: dto.acces } : {}),
        ...(dto.ecriture !== undefined ? { writePolicy: dto.ecriture } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
    });
    // Salon rendu réservé aux modérateurs : les membres le perdent aussitôt.
    this.evenements.notifier(salon.serverId, 'salons');
    return this.servers.versSalon(salon, role);
  }

  /** Supprimer un salon ; un serveur garde toujours au moins un salon. */
  async supprimer(salonId: string, acteur: Acteur): Promise<void> {
    const { salon } = await this.contexteModeration(salonId, acteur);
    const nombre = await this.prisma.room.count({
      where: { serverId: salon.serverId },
    });
    if (nombre <= 1) {
      throw new BadRequestException('Un serveur doit garder au moins un salon');
    }
    await this.prisma.room.delete({ where: { id: salonId } });
    this.evenements.notifier(salon.serverId, 'salons');
  }

  /**
   * Accès d'un utilisateur à un salon, pour Message-Service (route
   * interne). `roleGlobal` vient du JWT déjà validé par Message-Service.
   */
  async acces(
    salonId: string,
    utilisateurId: string,
    roleGlobal: AuthenticatedUser['role'],
  ): Promise<AccesSalonResponse> {
    const salon = await this.chargerSalon(salonId, utilisateurId);
    const membre = salon.server.members[0];
    const role = roleEffectif(salon.server, membre, {
      id: utilisateurId,
      role: roleGlobal,
    });
    return {
      salonId: salon.id,
      serveurId: salon.serverId,
      estMembre: membre !== undefined || salon.server.isDefault,
      peutLire: peutVoirSalon(role, salon),
      peutEcrire: peutEcrireSalon(role, salon),
    };
  }

  // --- Compatibilité (transition, voir README) ------------------------------------

  /** Ancien `GET /api/admin/rooms` (Dashboard) : tous les salons. */
  async listerCompatPourAdmin(acteur: Acteur): Promise<SalonCompatResponse[]> {
    this.servers.exigerAdmin(acteur);
    const salons = await this.prisma.room.findMany({
      include: { server: { include: { members: true } } },
      orderBy: [{ serverId: 'asc' }, { position: 'asc' }],
    });
    return salons.map((salon) => this.versCompat(salon));
  }

  // --- Outils -------------------------------------------------------------------

  private async chargerSalon(salonId: string, utilisateurId: string) {
    const salon = await this.prisma.room.findUnique({
      where: { id: salonId },
      include: {
        server: { include: { members: { where: { userId: utilisateurId } } } },
      },
    });
    if (!salon) {
      throw new NotFoundException(`Salon ${salonId} non trouvé`);
    }
    return salon;
  }

  /** Salon visible par l'appelant ET appelant modérateur, sinon 404 / 403. */
  private async contexteModeration(salonId: string, acteur: Acteur) {
    const salon = await this.chargerSalon(salonId, acteur.id);
    const role: RoleServeur | null = roleEffectif(
      salon.server,
      salon.server.members[0],
      acteur,
    );
    if (!peutVoirSalon(role, salon)) {
      throw new NotFoundException(`Salon ${salonId} non trouvé`);
    }
    this.servers.exiger(
      peutModerer(role),
      'Action réservée aux modérateurs du serveur',
    );
    return { salon, role };
  }

  private versCompat(salon: {
    id: string;
    name: string;
    serverId: string;
    createdBy: string | null;
    access: 'tous' | 'moderateurs';
    server: {
      name: string;
      ownerId: string | null;
      isDefault: boolean;
      members: { userId: string; role: 'membre' | 'moderateur' }[];
    };
  }): SalonCompatResponse {
    return {
      type: 'salon',
      id: salon.id,
      nom: salon.name,
      visibilite: 'public',
      creePar: salon.createdBy,
      membreIds: salon.server.members
        .filter((membre) =>
          peutVoirSalon(
            roleEffectif(salon.server, membre, {
              id: membre.userId,
              role: 'utilisateur',
            }),
            salon,
          ),
        )
        .map((membre) => membre.userId),
      membresInvites: [],
      serveurId: salon.serverId,
      serveurNom: salon.server.name,
    };
  }
}
