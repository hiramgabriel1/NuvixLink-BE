import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLibraryRecommendationDto } from './dto/create-library-recommendation.dto';
import { QueryLibraryRecommendationsDto } from './dto/query-library-recommendations.dto';
import { VoteLibraryRecommendationDto } from './dto/vote-library-recommendation.dto';
import { ReportLibraryRecommendationDto } from './dto/report-library-recommendation.dto';

@Injectable()
export class LibraryRecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryLibraryRecommendationsDto) {
    const { ecosystem, search, sort = 'newest', limit = 20, offset = 0 } = query;

    const where: Record<string, unknown> = {};
    if (ecosystem) where.ecosystem = ecosystem;
    if (search) {
      where.OR = [
        { packageName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { useCase: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy =
      sort === 'votes' ? { votes: { _count: 'desc' } } : { createdAt: 'desc' };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.libraryRecommendation.findMany({
        where,
        orderBy,
        take: Math.min(limit, 50),
        skip: offset,
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

    return {
      data: data.map((item) => ({
        ...item,
        voteCount: item._count.votes,
        reportCount: item._count.reports,
        author: {
          id: item.author.id,
          username: item.author.username,
          avatarUrl: item.author.photoKey,
        },
      })),
      total,
      limit,
      offset,
    };
  }

  async create(dto: CreateLibraryRecommendationDto) {
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

  async remove(id: string) {
    const recommendation = await this.prisma.libraryRecommendation.findUnique({
      where: { id },
    });

    if (!recommendation) {
      throw new NotFoundException('Recommendation not found.');
    }

    return this.prisma.libraryRecommendation.delete({ where: { id } });
  }

  async vote(id: string, dto: VoteLibraryRecommendationDto) {
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

  async report(id: string, dto: ReportLibraryRecommendationDto) {
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

  private async getVoteSummary(recommendationId: string, userId: string) {
    const [voteCount, userVote] = await this.prisma.$transaction([
      this.prisma.libraryRecommendationVote.aggregate({
        where: { recommendationId },
        _sum: { value: true },
      }),
      this.prisma.libraryRecommendationVote.findUnique({
        where: { userId_recommendationId: { userId, recommendationId } },
      }),
    ]);

    return {
      voteCount: voteCount._sum.value || 0,
      userVote: userVote?.value || null,
    };
  }
}