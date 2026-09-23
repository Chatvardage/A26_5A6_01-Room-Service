import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoomVisibility } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomResponse } from './types/room-response.type';

type ActorRole = AuthenticatedUser['role'];

const roomInclude = {
  members: { orderBy: { joinedAt: 'asc' as const } },
  invitations: { orderBy: { invitedAt: 'asc' as const } },
};

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId?: string): Promise<RoomResponse[]> {
    const rooms = await this.prisma.room.findMany({
      where: this.buildAccessFilter(userId),
      include: roomInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rooms.map((room) => this.toResponse(room));
  }

  async findAllForAdmin(actorRole: ActorRole): Promise<RoomResponse[]> {
    if (actorRole !== 'admin') {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }

    const rooms = await this.prisma.room.findMany({
      include: roomInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rooms.map((room) => this.toResponse(room));
  }

  async findAccessibleOne(id: string, userId?: string): Promise<RoomResponse> {
    const room = await this.prisma.room.findFirst({
      where: { id, ...this.buildAccessFilter(userId) },
      include: roomInclude,
    });

    if (!room) {
      throw new NotFoundException(`Salon ${id} non trouvé`);
    }

    return this.toResponse(room);
  }

  // Usage interne uniquement : les appelants doivent avoir déjà appliqué
  // les contrôles d'authentification et d'autorisation nécessaires.
  async findOne(id: string): Promise<RoomResponse> {
    const room = await this.getRoomOrThrow(id);
    return this.toResponse(room);
  }

  async findInvitationsForUser(userId: string): Promise<RoomResponse[]> {
    const rooms = await this.prisma.room.findMany({
      where: { invitations: { some: { userId } } },
      include: roomInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rooms.map((room) => this.toResponse(room));
  }

  async create(
    dto: CreateRoomDto,
    actorId: string,
    actorRole: ActorRole,
  ): Promise<RoomResponse> {
    this.assertModeratorOrAdmin(actorRole);

    const room = await this.prisma.room.create({
      data: {
        name: dto.nom.trim(),
        visibility: dto.visibilite ?? 'public',
        createdBy: actorId,
        members: { create: { userId: actorId } },
      },
      include: roomInclude,
    });
    return this.toResponse(room);
  }

  async update(
    id: string,
    dto: UpdateRoomDto,
    actorRole: ActorRole,
  ): Promise<RoomResponse> {
    this.assertModeratorOrAdmin(actorRole);
    await this.getRoomOrThrow(id);

    if (dto.nom === undefined && dto.visibilite === undefined) {
      throw new BadRequestException('Aucune modification fournie');
    }

    const room = await this.prisma.room.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined ? { name: dto.nom.trim() } : {}),
        ...(dto.visibilite !== undefined ? { visibility: dto.visibilite } : {}),
      },
      include: roomInclude,
    });
    return this.toResponse(room);
  }

  async remove(id: string, actorRole: ActorRole): Promise<void> {
    this.assertModeratorOrAdmin(actorRole);
    await this.getRoomOrThrow(id);
    await this.prisma.room.delete({ where: { id } });
  }

  async invite(
    id: string,
    invitedUserId: string,
    actorRole: ActorRole,
  ): Promise<RoomResponse> {
    this.assertModeratorOrAdmin(actorRole);
    const room = await this.getRoomOrThrow(id);

    if (room.visibility === 'public') {
      throw new BadRequestException(
        'Les invitations sont désactivées pour un salon public',
      );
    }

    if (room.members.some((member) => member.userId === invitedUserId)) {
      return this.toResponse(room);
    }

    if (
      !room.invitations.some(
        (invitation) => invitation.userId === invitedUserId,
      )
    ) {
      await this.prisma.roomInvitation.create({
        data: { roomId: id, userId: invitedUserId },
      });
    }

    return this.findOne(id);
  }

  async removeMember(
    id: string,
    userId: string,
    actorRole: ActorRole,
  ): Promise<RoomResponse> {
    this.assertModeratorOrAdmin(actorRole);
    const room = await this.getRoomOrThrow(id);

    if (!room.members.some((member) => member.userId === userId)) {
      throw new NotFoundException(
        `Membre ${userId} non trouvé dans le salon ${id}`,
      );
    }

    await this.prisma.roomMember.delete({
      where: { roomId_userId: { roomId: id, userId } },
    });

    return this.findOne(id);
  }

  async acceptInvitation(id: string, actorId: string): Promise<RoomResponse> {
    const room = await this.getRoomOrThrow(id);
    const invitation = room.invitations.find((item) => item.userId === actorId);

    if (!invitation) {
      throw new NotFoundException(`Aucune invitation au salon ${id}`);
    }

    await this.prisma.$transaction([
      this.prisma.roomInvitation.delete({
        where: { roomId_userId: { roomId: id, userId: actorId } },
      }),
      this.prisma.roomMember.upsert({
        where: { roomId_userId: { roomId: id, userId: actorId } },
        update: {},
        create: { roomId: id, userId: actorId },
      }),
    ]);

    return this.findOne(id);
  }

  async refuseInvitation(id: string, actorId: string): Promise<RoomResponse> {
    const room = await this.getRoomOrThrow(id);
    const invitationExists = room.invitations.some(
      (item) => item.userId === actorId,
    );

    if (!invitationExists) {
      throw new NotFoundException(`Aucune invitation au salon ${id}`);
    }

    await this.prisma.roomInvitation.delete({
      where: { roomId_userId: { roomId: id, userId: actorId } },
    });

    return this.findOne(id);
  }

  async join(id: string, actorId: string): Promise<RoomResponse> {
    const room = await this.getRoomOrThrow(id);

    if (room.members.some((member) => member.userId === actorId)) {
      return this.toResponse(room);
    }

    const invited = room.invitations.some(
      (invitation) => invitation.userId === actorId,
    );

    if (room.visibility === 'prive' && !invited) {
      throw new ForbiddenException(`Accès refusé au salon privé ${id}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.roomMember.create({ data: { roomId: id, userId: actorId } });
      if (invited) {
        await tx.roomInvitation.delete({
          where: { roomId_userId: { roomId: id, userId: actorId } },
        });
      }
    });

    return this.findOne(id);
  }

  async leave(id: string, actorId: string): Promise<RoomResponse> {
    const room = await this.getRoomOrThrow(id);

    if (!room.members.some((member) => member.userId === actorId)) {
      throw new ConflictException("L'utilisateur n'est pas membre du salon");
    }

    await this.prisma.roomMember.delete({
      where: { roomId_userId: { roomId: id, userId: actorId } },
    });

    return this.findOne(id);
  }

  private buildAccessFilter(userId?: string) {
    return userId
      ? {
          OR: [
            { visibility: 'public' as const },
            { members: { some: { userId } } },
          ],
        }
      : { visibility: 'public' as const };
  }

  private async getRoomOrThrow(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: roomInclude,
    });

    if (!room) {
      throw new NotFoundException(`Salon ${id} non trouvé`);
    }
    return room;
  }

  private assertModeratorOrAdmin(actorRole: ActorRole): void {
    if (actorRole !== 'moderateur' && actorRole !== 'admin') {
      throw new ForbiddenException(
        'Action réservée à un modérateur ou un administrateur',
      );
    }
  }

  private toResponse(room: {
    id: string;
    name: string;
    visibility: RoomVisibility;
    createdBy: string;
    members: { userId: string }[];
    invitations: { userId: string }[];
  }): RoomResponse {
    return {
      type: 'salon',
      id: room.id,
      nom: room.name,
      visibilite: room.visibility,
      creePar: room.createdBy,
      membreIds: room.members.map((member) => member.userId),
      membresInvites: room.invitations.map((invitation) => invitation.userId),
    };
  }
}
