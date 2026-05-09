import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLibraryRecommendationDto } from './dto/create-library-recommendation.dto';
import { QueryLibraryRecommendationsDto } from './dto/query-library-recommendations.dto';
import { VoteLibraryRecommendationDto } from './dto/vote-library-recommendation.dto';
import { ReportLibraryRecommendationDto } from './dto/report-library-recommendation.dto';
import { UpdateLibraryRecommendationDto } from './dto/update-library-recommendation.dto';

@Injectable()
export class LibraryRecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<{
    id: string;
    packageName: string;
    packageUrl: string;
    description: string;
    useCase: string;
    ecosystem: string;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
    voteCount: number;
    reportCount: number;
    author: {
      id: string;
      username: string;
      avatarUrl: string;
    };
  }> {
    const item = await this.prisma.libraryRecommendation.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, username: true, photoKey: true },
        },
        _count: {
          select: { votes: true, reports: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Recommendation not found.');
    }

    const avatarBaseUrl = process.env.S3_USERS_BASE_URL || '';
    const avatarUrl = item.author?.photoKey ? `${avatarBaseUrl}/${item.author.photoKey}` : '';
    const { _count, author, ...rest } = item;

    return {
      ...rest,
      voteCount: _count?.votes ?? 0,
      reportCount: _count?.reports ?? 0,
      author: {
        id: author?.id ?? '',
        username: author?.username ?? '',
        avatarUrl,
      },
    };
  }

  async findAll(query: QueryLibraryRecommendationsDto): Promise<{
    data: Array<{
      id: string;
      packageName: string;
      packageUrl: string;
      description: string;
      useCase: string;
      ecosystem: string;
      authorId: string;
      createdAt: Date;
      updatedAt: Date;
      voteCount: number;
      reportCount: number;
      author: {
        id: string;
        username: string;
        avatarUrl: string;
      };
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const { ecosystem, search, sort = 'newest', limit = 20, offset = 0 } = query;
    const take = Math.min(Number(limit), 50);
    const skip = Number(offset);

    const where: Record<string, unknown> = {};
    if (ecosystem) where.ecosystem = ecosystem;
    if (search) {
      where.OR = [
        { packageName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { useCase: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: { createdAt?: 'desc'; votes?: { _count: 'desc' } } = { createdAt: 'desc' };
    if (sort === 'votes') {
      orderBy = { votes: { _count: 'desc' } };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.libraryRecommendation.findMany({
        where,
        orderBy,
        take,
        skip,
        include: {
          author: {
            select: { id: true, username: true, photoKey: true },
          },
          _count: {
            select: { votes: true, reports: true },
          },
        },
      }),
      this.prisma.libraryRecommendation.count({ where }),
    ]);

    // Puedes ajustar la URL base del avatar según tu configuración real
    const AVATAR_BASE_URL = process.env.S3_USERS_BASE_URL || '';

    return {
      data: data.map((item) => {
        const avatarUrl = item.author?.photoKey ? `${AVATAR_BASE_URL}/${item.author.photoKey}` : '';
        const { _count, author, ...rest } = item;
        return {
          ...rest,
          voteCount: _count?.votes ?? 0,
          reportCount: _count?.reports ?? 0,
          author: {
            id: author?.id ?? '',
            username: author?.username ?? '',
            avatarUrl,
          },
        };
      }),
      total,
      limit,
      offset,
    };
  }

  async create(dto: CreateLibraryRecommendationDto): Promise<unknown> {
    const exists = await this.prisma.libraryRecommendation.findFirst({
      where: { authorId: dto.authorId, packageUrl: dto.packageUrl },
    });

    if (exists) {
      throw new BadRequestException('Recommendation already exists for this package.');
    }

    return this.prisma.libraryRecommendation.create({
      data: dto,
    });
  }

  async remove(id: string, userId: string): Promise<unknown> {
    const recommendation = await this.prisma.libraryRecommendation.findUnique({
      where: { id },
      include: { author: { select: { id: true } } },
    });

    if (!recommendation) {
      throw new NotFoundException('Recommendation not found.');
    }

    if (recommendation.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own recommendations.');
    }

    return this.prisma.libraryRecommendation.delete({ where: { id } });
  }

  async update(id: string, userId: string, dto: UpdateLibraryRecommendationDto): Promise<unknown> {
    const recommendation = await this.prisma.libraryRecommendation.findUnique({
      where: { id },
    });

    if (!recommendation) {
      throw new NotFoundException('Recommendation not found.');
    }

    if (recommendation.authorId !== userId) {
      throw new ForbiddenException('You can only update your own recommendations.');
    }

    if (dto.packageUrl) {
      const duplicate = await this.prisma.libraryRecommendation.findFirst({
        where: {
          authorId: userId,
          packageUrl: dto.packageUrl,
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new BadRequestException('Recommendation already exists for this package.');
      }
    }

    return this.prisma.libraryRecommendation.update({
      where: { id },
      data: dto,
    });
  }

  async vote(
    id: string,
    dto: VoteLibraryRecommendationDto,
  ): Promise<{ voteCount: number; userVote: 1 | -1 | null }> {
    const { userId, value } = dto;

    const existingVote = await this.prisma.libraryRecommendationVote.findUnique({
      where: { userId_recommendationId: { userId, recommendationId: id } },
    });

    if (existingVote) {
      if (existingVote.value === value) {
        await this.prisma.libraryRecommendationVote.delete({
          where: { id: existingVote.id },
        });
        return this.getVoteSummary(id, userId);
      }

      await this.prisma.libraryRecommendationVote.update({
        where: { id: existingVote.id },
        data: { value },
      });
      return this.getVoteSummary(id, userId);
    }

    await this.prisma.libraryRecommendationVote.create({
      data: { userId, recommendationId: id, value },
    });
    return this.getVoteSummary(id, userId);
  }

  async report(id: string, dto: ReportLibraryRecommendationDto): Promise<unknown> {
    const { userId, reason } = dto;

    const existingReport = await this.prisma.libraryRecommendationReport.findUnique({
      where: { userId_recommendationId: { userId, recommendationId: id } },
    });

    if (existingReport) {
      throw new BadRequestException('You have already reported this recommendation.');
    }

    return this.prisma.libraryRecommendationReport.create({
      data: { userId, recommendationId: id, reason },
    });
  }

  private async getVoteSummary(
    recommendationId: string,
    userId: string,
  ): Promise<{ voteCount: number; userVote: 1 | -1 | null }> {
    const [voteCount, userVote] = await this.prisma.$transaction([
      this.prisma.libraryRecommendationVote.aggregate({
        where: { recommendationId },
        _sum: { value: true },
      }),
      this.prisma.libraryRecommendationVote.findUnique({
        where: { userId_recommendationId: { userId, recommendationId } },
      }),
    ]);

    let userVoteValue: 1 | -1 | null = null;
    if (userVote?.value === 1 || userVote?.value === -1) {
      userVoteValue = userVote.value;
    }
    return {
      voteCount: voteCount._sum.value || 0,
      userVote: userVoteValue,
    };
  }
}
