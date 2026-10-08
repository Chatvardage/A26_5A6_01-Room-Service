import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ServerRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServerDto, UpdateServerDto } from './dto/create-server.dto';
import { SERVEUR_PAR_DEFAUT_ID } from './default-server';
import {
  LIMITE_DECOUVERTE_DEFAUT,
  LIMITE_MEMBRES_DEFAUT,
} from './dto/member.dto';
import { EvenementsService } from './evenements.service';
import {
  Acteur,
  RoleServeur,
  peutEcrireSalon,
  peutExpulser,
  peutGererServeur,
  peutModerer,
  peutVoirSalon,
  roleEffectif,
} from './permissions';
import {
  InvitationResponse,
  PageMembresResponse,
  PageServeursResponse,
  SalonResponse,
  ServeurResponse,
  ServeurResumeResponse,
} from './types/server-response.type';

// Serveurs qu'un même compte peut posséder : sans plafond, un script pouvait
// en créer indéfiniment (chacun avec son salon).
export const MAX_SERVEURS_POSSEDES = 100;
// Invitations en attente d'un même serveur : sans plafond, un modérateur
// pouvait en créer indéfiniment, y compris pour des identifiants inventés.
export const MAX_INVITATIONS_EN_ATTENTE = 200;

export const serveurInclude = {
  members: { orderBy: { joinedAt: 'asc' as const } },
  invitations: { orderBy: { invitedAt: 'asc' as const } },
  channels: {
    orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  _count: { select: { members: true } },
} satisfies Prisma.ServerInclude;

/**
 * Même forme que serveurInclude, mais sans charger tous les membres : seule
 * la ligne de l'appelant (pour son rôle). Pour les lectures, où la liste
 * complète ne sert pas (voir listerMembres).
 */
function serveurIncludeLecture(utilisateurId: string) {
  return {
    ...serveurInclude,
    members: { where: { userId: utilisateurId } },
  } satisfies Prisma.ServerInclude;
}

export type ServeurComplet = Prisma.ServerGetPayload<{
  include: typeof serveurInclude;
}>;

type Salon = ServeurComplet['channels'][number];

export type ContexteServeur = {
  serveur: ServeurComplet;
  role: RoleServeur | null;
};

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evenements: EvenementsService,
  ) {}

  // --- Lecture ---------------------------------------------------------------

  /**
   * Serveurs dont l'appelant est membre, le serveur par défaut en premier.
   * Ajoute au passage l'appelant au serveur par défaut « Chatvardage » (tout
   * le monde en fait partie) : le Frontend fait cet appel dès l'ouverture de
   * session, donc dès l'inscription.
   */
  async listerMesServeurs(acteur: Acteur): Promise<ServeurResponse[]> {
    // ON CONFLICT DO NOTHING. Personne n'est prévenu : une arrivée dans le
    // serveur par défaut ne change que son nombre de membres, et prévenir
    // tout le monde à chaque inscription faisait recharger la page de tous
    // les clients connectés.
    await this.prisma.serverMember.createMany({
      data: [{ serverId: SERVEUR_PAR_DEFAUT_ID, userId: acteur.id }],
      skipDuplicates: true,
    });

    const serveurs = await this.prisma.server.findMany({
      where: { members: { some: { userId: acteur.id } } },
      include: serveurIncludeLecture(acteur.id),
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return serveurs.map((serveur) =>
      this.versReponse(serveur, this.roleDe(serveur, acteur)),
    );
  }

  /** Serveurs publics dont l'appelant n'est pas encore membre, par pages. */
  async decouvrir(
    acteur: Acteur,
    recherche?: string,
    options: { decalage?: number; limite?: number } = {},
  ): Promise<PageServeursResponse> {
    const decalage = options.decalage ?? 0;
    const limite = options.limite ?? LIMITE_DECOUVERTE_DEFAUT;
    const where = {
      isPublic: true,
      members: { none: { userId: acteur.id } },
      ...(recherche
        ? { name: { contains: recherche, mode: 'insensitive' as const } }
        : {}),
    };
    const [total, serveurs] = await Promise.all([
      this.prisma.server.count({ where }),
      this.prisma.server.findMany({
        where,
        include: { _count: { select: { members: true } } },
        // Les plus fréquentés d'abord ; le nom puis l'id départagent les
        // égalités, pour que les pages ne se chevauchent pas.
        orderBy: [
          { members: { _count: 'desc' } },
          { name: 'asc' },
          { id: 'asc' },
        ],
        skip: decalage,
        take: limite,
      }),
    ]);
    const fin = decalage + serveurs.length;
    return {
      serveurs: serveurs.map((serveur) => this.versResume(serveur)),
      total,
      suivant: fin < total ? fin : null,
    };
  }

  /**
   * Un serveur. Non-membre : aperçu (sans salons ni membres) pour un serveur
   * public, 404 pour un serveur privé (son existence n'est pas révélée).
   */
  async obtenir(id: string, acteur: Acteur): Promise<ServeurResponse> {
    const serveur = await this.prisma.server.findUnique({
      where: { id },
      include: serveurIncludeLecture(acteur.id),
    });
    const role = serveur ? this.roleDe(serveur, acteur) : null;
    if (!serveur || (role === null && !serveur.isPublic)) {
      throw new NotFoundException(`Serveur ${id} non trouvé`);
    }
    return this.versReponse(serveur, role);
  }

  /**
   * Membres d'un serveur, par pages : le propriétaire en tête, puis les
   * modérateurs, puis les membres, par ancienneté. Avec `ids`, seulement ces
   * utilisateurs (sans pagination). Réservé aux membres.
   */
  async listerMembres(
    id: string,
    acteur: Acteur,
    options: { decalage?: number; limite?: number; ids?: string[] } = {},
  ): Promise<PageMembresResponse> {
    const serveur = await this.prisma.server.findUnique({
      where: { id },
      include: { members: { where: { userId: acteur.id } } },
    });
    const role = serveur ? this.roleDe(serveur, acteur) : null;
    if (!serveur || (role === null && !serveur.isPublic)) {
      throw new NotFoundException(`Serveur ${id} non trouvé`);
    }
    this.exiger(role !== null, 'Réservé aux membres du serveur');

    const versMembre = (membre: { userId: string; role: ServerRole }) => ({
      utilisateurId: membre.userId,
      role:
        membre.userId === serveur.ownerId
          ? ('proprietaire' as const)
          : membre.role,
    });

    if (options.ids) {
      const membres = await this.prisma.serverMember.findMany({
        where: { serverId: id, userId: { in: options.ids } },
        orderBy: { joinedAt: 'asc' },
      });
      return {
        membres: membres.map(versMembre),
        total: membres.length,
        suivant: null,
      };
    }

    const decalage = options.decalage ?? 0;
    const limite = options.limite ?? LIMITE_MEMBRES_DEFAUT;
    // Le propriétaire est à part (tête de la première page) : son rôle en
    // base ne le distingue pas des autres.
    const proprietaire =
      serveur.ownerId === null
        ? null
        : await this.prisma.serverMember.findUnique({
            where: {
              serverId_userId: { serverId: id, userId: serveur.ownerId },
            },
          });
    const autres = { serverId: id, userId: { not: serveur.ownerId ?? '' } };
    const enTete = proprietaire ? 1 : 0;
    const [total, page] = await Promise.all([
      this.prisma.serverMember.count({ where: autres }),
      this.prisma.serverMember.findMany({
        where: autres,
        // 'moderateur' > 'membre' : les modérateurs d'abord.
        orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }, { userId: 'asc' }],
        skip: Math.max(decalage - enTete, 0),
        take: decalage === 0 ? limite - enTete : limite,
      }),
    ]);
    const membres = [
      ...(decalage === 0 && proprietaire ? [proprietaire] : []),
      ...page,
    ].map(versMembre);
    const fin = decalage + membres.length;
    return {
      membres,
      total: total + enTete,
      suivant: fin < total + enTete ? fin : null,
    };
  }

  /** Tous les serveurs, par pages (panneau d'administration). */
  async listerPourAdmin(
    acteur: Acteur,
    options: { decalage?: number; limite?: number } = {},
  ): Promise<PageServeursResponse> {
    this.exigerAdmin(acteur);
    const decalage = options.decalage ?? 0;
    const limite = options.limite ?? LIMITE_MEMBRES_DEFAUT;
    const [total, serveurs] = await Promise.all([
      this.prisma.server.count(),
      this.prisma.server.findMany({
        include: { _count: { select: { members: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: decalage,
        take: limite,
      }),
    ]);
    const fin = decalage + serveurs.length;
    return {
      serveurs: serveurs.map((serveur) => this.versResume(serveur)),
      total,
      suivant: fin < total ? fin : null,
    };
  }

  // --- Création / modification ----------------------------------------------

  /** Tout utilisateur peut créer un serveur ; il en devient propriétaire. */
  async creer(dto: CreateServerDto, acteur: Acteur): Promise<ServeurResponse> {
    const possedes = await this.prisma.server.count({
      where: { ownerId: acteur.id },
    });
    if (possedes >= MAX_SERVEURS_POSSEDES) {
      throw new BadRequestException(
        `Limite atteinte : ${MAX_SERVEURS_POSSEDES} serveurs par compte`,
      );
    }
    const serveur = await this.prisma.server.create({
      data: {
        name: dto.nom,
        isPublic: dto.public ?? false,
        ownerId: acteur.id,
        members: { create: { userId: acteur.id } },
        channels: {
          create: { name: 'général', position: 0, createdBy: acteur.id },
        },
      },
      include: serveurInclude,
    });
    return this.versReponse(serveur, this.roleDe(serveur, acteur));
  }

  async modifier(
    id: string,
    dto: UpdateServerDto,
    acteur: Acteur,
  ): Promise<ServeurResponse> {
    const { serveur, role } = await this.contexteVisible(id, acteur);
    this.exiger(peutGererServeur(role), 'Action réservée au propriétaire');

    if (
      dto.nom === undefined &&
      dto.public === undefined &&
      dto.icone === undefined
    ) {
      throw new BadRequestException('Aucune modification fournie');
    }
    if (serveur.isDefault && dto.public === false) {
      throw new BadRequestException('Le serveur par défaut doit rester public');
    }

    const misAJour = await this.prisma.server.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined ? { name: dto.nom } : {}),
        ...(dto.public !== undefined ? { isPublic: dto.public } : {}),
        // Chaîne vide = retirer l'icône.
        ...(dto.icone !== undefined ? { icon: dto.icone || null } : {}),
      },
      include: serveurInclude,
    });
    this.evenements.notifier(id, 'modifie', {
      destinataires: this.idsMembres(misAJour),
    });
    return this.versReponse(misAJour, role);
  }

  async supprimer(id: string, acteur: Acteur): Promise<void> {
    const { serveur, role } = await this.contexteVisible(id, acteur);
    this.exiger(peutGererServeur(role), 'Action réservée au propriétaire');
    this.refuserSiParDefaut(
      serveur,
      'Le serveur par défaut ne peut pas être supprimé',
    );
    await this.prisma.server.delete({ where: { id } });
    this.evenements.notifier(id, 'supprime', {
      destinataires: this.idsMembres(serveur),
    });
    this.evenements.salonsSupprimes(serveur.channels.map((salon) => salon.id));
  }

  // --- Appartenance ------------------------------------------------------------

  /** Rejoindre : libre pour un serveur public, sur invitation sinon. */
  async rejoindre(id: string, acteur: Acteur): Promise<ServeurResponse> {
    const serveur = await this.chargerServeur(id, [acteur.id]);
    if (serveur.members.some((membre) => membre.userId === acteur.id)) {
      return this.versReponse(serveur, this.roleDe(serveur, acteur));
    }

    const invite = serveur.invitations.some(
      (invitation) => invitation.userId === acteur.id,
    );
    if (!serveur.isPublic && !invite) {
      // Même réponse qu'un serveur inexistant : pas de fuite d'existence.
      throw new NotFoundException(`Serveur ${id} non trouvé`);
    }

    // skipDuplicates : deux requêtes simultanées (double clic) passent toutes
    // deux la vérification ci-dessus ; la seconde ne doit pas échouer en 500
    // sur la contrainte d'unicité, ni prévenir les membres une deuxième fois.
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.serverMember.createMany({
        data: [{ serverId: id, userId: acteur.id }],
        skipDuplicates: true,
      }),
      this.prisma.serverInvitation.deleteMany({
        where: { serverId: id, userId: acteur.id },
      }),
    ]);
    if (count > 0) {
      this.evenements.notifier(id, 'membres', {
        destinataires: this.idsMembres(serveur),
        cibleId: acteur.id,
      });
    }
    return this.obtenir(id, acteur);
  }

  async quitter(id: string, acteur: Acteur): Promise<void> {
    const serveur = await this.chargerServeur(id, [acteur.id]);
    this.refuserSiParDefaut(
      serveur,
      'Le serveur par défaut ne peut pas être quitté',
    );
    if (serveur.ownerId === acteur.id) {
      throw new BadRequestException(
        'Le propriétaire ne peut pas quitter son serveur : il doit le supprimer',
      );
    }
    if (!serveur.members.some((membre) => membre.userId === acteur.id)) {
      throw new ConflictException("L'utilisateur n'est pas membre du serveur");
    }
    await this.prisma.serverMember.delete({
      where: { serverId_userId: { serverId: id, userId: acteur.id } },
    });
    this.evenements.notifier(id, 'membres', {
      destinataires: this.idsMembres(serveur),
      cibleId: acteur.id,
    });
  }

  /** Expulser : modérateur minimum, et strictement au-dessus de la cible. */
  /**
   * Expulser un membre : modérateur minimum, strictement au-dessus de lui.
   * Le propriétaire ne peut donc être expulsé que par un administrateur, qui
   * désigne alors un autre membre comme nouveau propriétaire : sans ça, le
   * propriétaire gardait tous ses droits (`ownerId`) sans être membre.
   */
  async expulser(
    id: string,
    utilisateurId: string,
    acteur: Acteur,
    nouveauProprietaireId?: string,
  ): Promise<ServeurResponse> {
    const { serveur, role } = await this.contexteVisible(id, acteur, [
      utilisateurId,
      ...(nouveauProprietaireId ? [nouveauProprietaireId] : []),
    ]);
    this.refuserSiParDefaut(
      serveur,
      "Impossible d'expulser du serveur par défaut",
    );
    const cible = this.membreOuErreur(serveur, utilisateurId);
    const roleCible = roleEffectif(serveur, cible, {
      id: utilisateurId,
      role: 'utilisateur',
    });
    this.exiger(
      peutExpulser(role, roleCible),
      'Rôle insuffisant pour expulser ce membre',
    );

    if (serveur.ownerId === utilisateurId) {
      await this.transfererPuisExpulser(
        serveur,
        utilisateurId,
        nouveauProprietaireId,
      );
    } else {
      await this.prisma.serverMember.delete({
        where: { serverId_userId: { serverId: id, userId: utilisateurId } },
      });
    }
    // L'expulsé fait partie des destinataires (membres d'avant l'expulsion) :
    // son app ferme le serveur aussitôt ; le nouveau propriétaire recharge
    // le serveur et voit ses nouveaux droits.
    this.evenements.notifier(id, 'expulse', {
      destinataires: this.idsMembres(serveur),
      cibleId: utilisateurId,
    });
    return this.obtenir(id, acteur);
  }

  /** Propriétaire expulsé : la propriété passe à un autre membre, puis il part. */
  private async transfererPuisExpulser(
    serveur: ServeurComplet,
    ancienId: string,
    nouveauId: string | undefined,
  ): Promise<void> {
    if (!nouveauId || nouveauId === ancienId) {
      throw new BadRequestException(
        'Choisissez un autre membre comme nouveau propriétaire',
      );
    }
    this.membreOuErreur(serveur, nouveauId);
    const possedes = await this.prisma.server.count({
      where: { ownerId: nouveauId },
    });
    if (possedes >= MAX_SERVEURS_POSSEDES) {
      throw new BadRequestException(
        `Limite atteinte : ce membre possède déjà ${MAX_SERVEURS_POSSEDES} serveurs`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.server.update({
        where: { id: serveur.id },
        data: { ownerId: nouveauId },
      }),
      this.prisma.serverMember.delete({
        where: { serverId_userId: { serverId: serveur.id, userId: ancienId } },
      }),
    ]);
  }

  /** Nommer ou retirer un modérateur : propriétaire ou admin. */
  async changerRole(
    id: string,
    utilisateurId: string,
    nouveauRole: 'membre' | 'moderateur',
    acteur: Acteur,
  ): Promise<ServeurResponse> {
    const { serveur, role } = await this.contexteVisible(id, acteur, [
      utilisateurId,
    ]);
    this.exiger(peutGererServeur(role), 'Action réservée au propriétaire');
    this.membreOuErreur(serveur, utilisateurId);
    if (serveur.ownerId === utilisateurId) {
      throw new BadRequestException('Le rôle du propriétaire ne change pas');
    }

    await this.prisma.serverMember.update({
      where: { serverId_userId: { serverId: id, userId: utilisateurId } },
      data: { role: nouveauRole },
    });
    this.evenements.notifier(id, 'membres', {
      destinataires: this.idsMembres(serveur),
      cibleId: utilisateurId,
    });
    return this.obtenir(id, acteur);
  }

  // --- Invitations ------------------------------------------------------------

  /** Modérateur minimum (propriétaire, admin) ; jamais dans le serveur par
   * défaut. Idempotent. */
  async inviter(
    id: string,
    utilisateurId: string,
    acteur: Acteur,
  ): Promise<ServeurResponse> {
    const { serveur, role } = await this.contexteVisible(id, acteur, [
      utilisateurId,
    ]);
    this.refuserSiParDefaut(
      serveur,
      'Tout le monde fait déjà partie du serveur par défaut',
    );
    this.exiger(
      peutModerer(role),
      'Seuls les modérateurs et le propriétaire peuvent inviter',
    );
    if (serveur.members.some((membre) => membre.userId === utilisateurId)) {
      throw new ConflictException("L'utilisateur est déjà membre du serveur");
    }

    if (
      !serveur.invitations.some(
        (invitation) => invitation.userId === utilisateurId,
      )
    ) {
      if (serveur.invitations.length >= MAX_INVITATIONS_EN_ATTENTE) {
        throw new BadRequestException(
          `Limite atteinte : ${MAX_INVITATIONS_EN_ATTENTE} invitations en attente par serveur`,
        );
      }
      await this.prisma.serverInvitation.create({
        data: { serverId: id, userId: utilisateurId, invitedBy: acteur.id },
      });
      // L'invité (compteur d'invitations) et les membres (invitations en
      // attente, visibles des modérateurs).
      this.evenements.notifier(id, 'invitation', {
        destinataires: this.idsMembres(serveur),
        extras: [utilisateurId],
        cibleId: utilisateurId,
      });
    }
    return this.obtenir(id, acteur);
  }

  async mesInvitations(acteur: Acteur): Promise<InvitationResponse[]> {
    const invitations = await this.prisma.serverInvitation.findMany({
      where: { userId: acteur.id },
      include: {
        server: { include: { _count: { select: { members: true } } } },
      },
      orderBy: { invitedAt: 'asc' },
    });
    return invitations.map((invitation) => ({
      serveur: this.versResume(invitation.server),
      invitePar: invitation.invitedBy,
      inviteLe: invitation.invitedAt.toISOString(),
    }));
  }

  async accepterInvitation(
    id: string,
    acteur: Acteur,
  ): Promise<ServeurResponse> {
    await this.invitationOuErreur(id, acteur);
    // deleteMany plutôt que delete : deux acceptations simultanées (double
    // clic) passent toutes deux la vérification ci-dessus ; la seconde ne
    // doit pas échouer en 500 (P2025), ni prévenir les membres une seconde
    // fois.
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.serverInvitation.deleteMany({
        where: { serverId: id, userId: acteur.id },
      }),
      this.prisma.serverMember.upsert({
        where: { serverId_userId: { serverId: id, userId: acteur.id } },
        update: {},
        create: { serverId: id, userId: acteur.id },
      }),
    ]);
    if (count > 0) {
      // Destinataires par défaut : membres actuels, nouveau membre compris.
      this.evenements.notifier(id, 'membres', { cibleId: acteur.id });
    }
    return this.obtenir(id, acteur);
  }

  async refuserInvitation(id: string, acteur: Acteur): Promise<void> {
    await this.invitationOuErreur(id, acteur);
    // Même raison que dans accepterInvitation.
    const { count } = await this.prisma.serverInvitation.deleteMany({
      where: { serverId: id, userId: acteur.id },
    });
    if (count > 0) {
      // Les modérateurs voient les invitations en attente.
      this.evenements.notifier(id, 'membres', { cibleId: acteur.id });
    }
  }

  // --- Compte supprimé -----------------------------------------------------------

  /**
   * Compte supprimé dans Authentification (route interne) : ses serveurs
   * sont supprimés avec leurs salons (et, via Message-Service, leurs
   * messages), il quitte les autres, ses invitations reçues disparaissent.
   * Idempotent : un second appel ne trouve plus rien.
   */
  async supprimerUtilisateur(utilisateurId: string): Promise<{
    serveursSupprimes: number;
    serveursQuittes: number;
    invitationsSupprimees: number;
  }> {
    const [possedes, adhesions, invitations] = await Promise.all([
      this.prisma.server.findMany({
        where: { ownerId: utilisateurId },
        select: {
          id: true,
          members: { select: { userId: true } },
          channels: { select: { id: true } },
        },
      }),
      this.prisma.serverMember.findMany({
        where: { userId: utilisateurId },
        select: { serverId: true },
      }),
      this.prisma.serverInvitation.findMany({
        where: { userId: utilisateurId },
        select: { serverId: true },
      }),
    ]);

    await this.prisma.$transaction([
      this.prisma.server.deleteMany({ where: { ownerId: utilisateurId } }),
      this.prisma.serverMember.deleteMany({ where: { userId: utilisateurId } }),
      this.prisma.serverInvitation.deleteMany({
        where: { userId: utilisateurId },
      }),
    ]);

    for (const serveur of possedes) {
      this.evenements.notifier(serveur.id, 'supprime', {
        destinataires: this.idsMembres(serveur),
      });
    }
    this.evenements.salonsSupprimes(
      possedes.flatMap((serveur) => serveur.channels.map((salon) => salon.id)),
    );
    // Membres restants (nombre de membres) et modérateurs (invitations en
    // attente). Pas pour le serveur par défaut : une arrivée n'y prévient
    // personne, un départ non plus.
    const idsPossedes = new Set(possedes.map((serveur) => serveur.id));
    const quittes = adhesions.filter(
      (adhesion) => !idsPossedes.has(adhesion.serverId),
    );
    const serveursChanges = new Set(
      [...quittes, ...invitations]
        .map((ligne) => ligne.serverId)
        .filter((id) => id !== SERVEUR_PAR_DEFAUT_ID && !idsPossedes.has(id)),
    );
    for (const serveurId of serveursChanges) {
      this.evenements.notifier(serveurId, 'membres', {
        cibleId: utilisateurId,
      });
    }

    return {
      serveursSupprimes: possedes.length,
      serveursQuittes: quittes.length,
      invitationsSupprimees: invitations.length,
    };
  }

  // --- Outils partagés (aussi utilisés par ChannelsService) ---------------------

  /**
   * Serveur + rôle effectif de l'appelant. 404 si le serveur n'existe pas ou
   * s'il est privé et que l'appelant n'en est pas membre. `cibles` : autres
   * membres dont la ligne est utile (voir chargerServeur).
   */
  async contexteVisible(
    id: string,
    acteur: Acteur,
    cibles: string[] = [],
  ): Promise<ContexteServeur> {
    const serveur = await this.chargerServeur(id, [acteur.id, ...cibles]);
    const role = this.roleDe(serveur, acteur);
    if (role === null && !serveur.isPublic) {
      throw new NotFoundException(`Serveur ${id} non trouvé`);
    }
    return { serveur, role };
  }

  versSalon(salon: Salon, role: RoleServeur | null): SalonResponse {
    return {
      type: 'salon',
      id: salon.id,
      serveurId: salon.serverId,
      nom: salon.name,
      position: salon.position,
      acces: salon.access,
      ecriture: salon.writePolicy,
      peutEcrire: peutEcrireSalon(role, salon),
      creePar: salon.createdBy,
    };
  }

  exiger(condition: boolean, message: string): void {
    if (!condition) throw new ForbiddenException(message);
  }

  exigerAdmin(acteur: Acteur): void {
    this.exiger(acteur.role === 'admin', 'Action réservée aux administrateurs');
  }

  /**
   * Serveur complet. Pour le serveur par défaut, dont tout le monde est
   * membre, seules les lignes de `utilisateursUtiles` sont chargées : ses
   * événements partent à tous sans liste (voir EvenementsService), la liste
   * complète ne sert donc jamais et coûterait une ligne par compte.
   */
  private async chargerServeur(
    id: string,
    utilisateursUtiles: string[],
  ): Promise<ServeurComplet> {
    const serveur = await this.prisma.server.findUnique({
      where: { id },
      include:
        id === SERVEUR_PAR_DEFAUT_ID
          ? {
              ...serveurInclude,
              members: {
                where: { userId: { in: utilisateursUtiles } },
                orderBy: { joinedAt: 'asc' as const },
              },
            }
          : serveurInclude,
    });
    if (!serveur) {
      throw new NotFoundException(`Serveur ${id} non trouvé`);
    }
    return serveur;
  }

  private idsMembres(serveur: { members: { userId: string }[] }): string[] {
    return serveur.members.map((membre) => membre.userId);
  }

  private roleDe(
    serveur: {
      ownerId: string | null;
      isDefault: boolean;
      members: { userId: string; role: ServerRole }[];
    },
    acteur: Acteur,
  ): RoleServeur | null {
    const membre = serveur.members.find((item) => item.userId === acteur.id);
    return roleEffectif(serveur, membre, acteur);
  }

  private membreOuErreur(serveur: ServeurComplet, utilisateurId: string) {
    const membre = serveur.members.find(
      (item) => item.userId === utilisateurId,
    );
    if (!membre) {
      throw new NotFoundException(
        `Membre ${utilisateurId} non trouvé dans le serveur ${serveur.id}`,
      );
    }
    return membre;
  }

  private refuserSiParDefaut(serveur: { isDefault: boolean }, message: string) {
    if (serveur.isDefault) throw new BadRequestException(message);
  }

  private async invitationOuErreur(id: string, acteur: Acteur) {
    const invitation = await this.prisma.serverInvitation.findUnique({
      where: { serverId_userId: { serverId: id, userId: acteur.id } },
    });
    if (!invitation) {
      throw new NotFoundException(`Aucune invitation au serveur ${id}`);
    }
    return invitation;
  }

  private versReponse(
    serveur: ServeurComplet,
    role: RoleServeur | null,
  ): ServeurResponse {
    return {
      type: 'serveur',
      id: serveur.id,
      nom: serveur.name,
      icone: serveur.icon,
      public: serveur.isPublic,
      parDefaut: serveur.isDefault,
      proprietaireId: serveur.ownerId,
      monRole: role,
      nombreMembres: serveur._count.members,
      salons: serveur.channels
        .filter((salon) => peutVoirSalon(role, salon))
        .map((salon) => this.versSalon(salon, role)),
      invitations: peutModerer(role)
        ? serveur.invitations.map((invitation) => invitation.userId)
        : [],
    };
  }

  private versResume(serveur: {
    id: string;
    name: string;
    icon: string | null;
    isPublic: boolean;
    _count: { members: number };
  }): ServeurResumeResponse {
    return {
      type: 'serveur',
      id: serveur.id,
      nom: serveur.name,
      icone: serveur.icon,
      public: serveur.isPublic,
      nombreMembres: serveur._count.members,
    };
  }
}
