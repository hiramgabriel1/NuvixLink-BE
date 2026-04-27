import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Challenge, ChallengeMode, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengesListQueryDto } from './dto/challenges-list-query.dto';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';

const creatorSelect = {
  id: true,
  username: true,
  photoKey: true,
} as const;

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateChallengeDto) {
    const endsAt = new Date(dto.endsAt);
    if (endsAt.getTime() <= Date.now()) {
      throw new BadRequestException('endsAt debe ser una fecha en el futuro');
    }
    const prize = this.normalizePrize(dto.prizeDescription);
    return this.prisma.challenge.create({
      data: {
        creatorId: userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        endsAt,
        mode: dto.mode,
        prizeDescription: prize,
      },
      include: { creator: { select: creatorSelect } },
    });
  }

  async list(query: ChallengesListQueryDto) {
    const take = query.limit ?? 20;
    const where: Prisma.ChallengeWhereInput = {};
    if (query.mode) {
      where.mode = query.mode;
    }

    const items = await this.prisma.challenge.findMany({
      where,
      take: take + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        creator: { select: creatorSelect },
        _count: {
          select: {
            soloEnrollments: true,
            teams: true,
          },
        },
      },
    });

    const hasNext = items.length > take;
    const page = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext ? page[page.length - 1]?.id : undefined;

    return {
      items: page,
      nextCursor,
    };
  }

  async getById(id: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id },
      include: {
        creator: { select: creatorSelect },
        _count: {
          select: {
            soloEnrollments: true,
            teams: true,
          },
        },
        teams: {
          orderBy: { createdAt: 'asc' },
          include: {
            _count: { select: { members: true } },
            members: {
              take: 20,
              orderBy: { createdAt: 'asc' },
              include: {
                user: { select: { id: true, username: true, photoKey: true } },
              },
            },
          },
        },
      },
    });
    if (!challenge) {
      throw new NotFoundException('Reto no encontrado');
    }
    return challenge;
  }

  async update(challengeId: string, userId: string, dto: UpdateChallengeDto) {
    const existing = await this.requireChallengeForCreator(challengeId, userId);
    if (dto.endsAt !== undefined) {
      const endsAt = new Date(dto.endsAt);
      if (endsAt.getTime() <= Date.now()) {
        throw new BadRequestException('endsAt debe ser una fecha en el futuro');
      }
    }
    if (dto.mode !== undefined && dto.mode !== existing.mode) {
      throw new BadRequestException('No se puede cambiar el modo (SOLO/TEAMS) de un reto existente');
    }

    const data: Prisma.ChallengeUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
    if (dto.prizeDescription !== undefined) {
      data.prizeDescription = this.normalizePrize(dto.prizeDescription);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nada que actualizar');
    }

    return this.prisma.challenge.update({
      where: { id: challengeId },
      data,
      include: { creator: { select: creatorSelect } },
    });
  }

  async remove(challengeId: string, userId: string) {
    await this.requireChallengeForCreator(challengeId, userId);
    await this.prisma.challenge.delete({ where: { id: challengeId } });
    return { deleted: true };
  }

  /** Inscripción en modo individual */
  async joinSolo(challengeId: string, userId: string) {
    const c = await this.getChallengeOrThrow(challengeId);
    if (c.mode !== ChallengeMode.SOLO) {
      throw new BadRequestException('Este reto es por equipos: crea o únete a un equipo');
    }
    this.assertEnrollmentOpen(c);

    try {
      await this.prisma.challengeSoloEnrollment.create({
        data: { challengeId, userId },
      });
    } catch (e: unknown) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya estás inscrito en este reto');
      }
      throw e;
    }
    return { joined: true, mode: 'SOLO' as const };
  }

  async leaveSolo(challengeId: string, userId: string) {
    const c = await this.getChallengeOrThrow(challengeId);
    if (c.mode !== ChallengeMode.SOLO) {
      throw new BadRequestException('Usa /teams/leave para retos por equipos');
    }
    const res = await this.prisma.challengeSoloEnrollment.deleteMany({
      where: { challengeId, userId },
    });
    if (res.count === 0) {
      throw new NotFoundException('No estabas inscrito en este reto');
    }
    return { left: true, mode: 'SOLO' as const };
  }

  async createTeam(challengeId: string, userId: string, dto: CreateTeamDto) {
    const c = await this.getChallengeOrThrow(challengeId);
    if (c.mode !== ChallengeMode.TEAMS) {
      throw new BadRequestException('Este reto es individual: usa /join');
    }
    this.assertEnrollmentOpen(c);
    await this.assertUserNotInAnyTeamForChallenge(challengeId, userId);

    return this.prisma.$transaction(async (tx) => {
      const team = await tx.challengeTeam.create({
        data: {
          challengeId,
          name: dto.name?.trim() || null,
        },
      });
      await tx.challengeTeamMember.create({
        data: { teamId: team.id, userId },
      });
      return tx.challengeTeam.findUniqueOrThrow({
        where: { id: team.id },
        include: {
          _count: { select: { members: true } },
          members: {
            include: { user: { select: creatorSelect } },
          },
        },
      });
    });
  }

  async joinTeam(challengeId: string, teamId: string, userId: string) {
    const c = await this.getChallengeOrThrow(challengeId);
    if (c.mode !== ChallengeMode.TEAMS) {
      throw new BadRequestException('Este reto no usa equipos');
    }
    this.assertEnrollmentOpen(c);

    const team = await this.prisma.challengeTeam.findFirst({
      where: { id: teamId, challengeId },
    });
    if (!team) {
      throw new NotFoundException('Equipo no encontrado en este reto');
    }
    await this.assertUserNotInAnyTeamForChallenge(challengeId, userId);

    try {
      await this.prisma.challengeTeamMember.create({
        data: { teamId, userId },
      });
    } catch (e: unknown) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya perteneces a este equipo');
      }
      throw e;
    }
    return { joined: true, teamId, mode: 'TEAMS' as const };
  }

  async leaveTeam(challengeId: string, userId: string) {
    const c = await this.getChallengeOrThrow(challengeId);
    if (c.mode !== ChallengeMode.TEAMS) {
      throw new BadRequestException('Usa /leave en retos individuales');
    }

    const membership = await this.prisma.challengeTeamMember.findFirst({
      where: { userId, team: { challengeId } },
      include: { team: true },
    });
    if (!membership) {
      throw new NotFoundException('No estás en ningún equipo de este reto');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.challengeTeamMember.delete({ where: { id: membership.id } });
      const remaining = await tx.challengeTeamMember.count({
        where: { teamId: membership.teamId },
      });
      if (remaining === 0) {
        await tx.challengeTeam.delete({ where: { id: membership.teamId } });
      }
    });

    return { left: true, mode: 'TEAMS' as const };
  }

  private normalizePrize(raw: string | undefined): string | null {
    if (raw === undefined) return null;
    const t = raw.trim();
    return t.length === 0 ? null : t;
  }

  private async getChallengeOrThrow(id: string): Promise<Challenge> {
    const c = await this.prisma.challenge.findUnique({ where: { id } });
    if (!c) {
      throw new NotFoundException('Reto no encontrado');
    }
    return c;
  }

  private assertEnrollmentOpen(c: Challenge) {
    if (c.endsAt.getTime() < Date.now()) {
      throw new BadRequestException('El plazo de este reto ya finalizó');
    }
  }

  private async requireChallengeForCreator(challengeId: string, userId: string) {
    const c = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!c) {
      throw new NotFoundException('Reto no encontrado');
    }
    if (c.creatorId !== userId) {
      throw new ForbiddenException('Solo el creador puede editar o eliminar el reto');
    }
    return c;
  }

  private async assertUserNotInAnyTeamForChallenge(challengeId: string, userId: string) {
    const existing = await this.prisma.challengeTeamMember.findFirst({
      where: { userId, team: { challengeId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Ya estás en un equipo de este reto; sal antes de unirte a otro');
    }
  }
}
