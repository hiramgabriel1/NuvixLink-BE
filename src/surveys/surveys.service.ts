import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, ErrorCode } from '../common/errors';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { SurveysListQueryDto } from './dto/surveys-list-query.dto';

@Injectable()
export class SurveysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateSurveyDto) {
    const survey = await this.prisma.survey.create({
      data: {
        author: { connect: { id: authorId } },
        questionSurvey: dto.questionSurvey.trim(),
        options: dto.options.map((o) => o.trim()),
      },
      include: {
        author: { select: { id: true, username: true, photoKey: true } },
      },
    });

    return this.withResults(survey);
  }

  async findAll(query: SurveysListQueryDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [surveys, total] = await this.prisma.$transaction([
      this.prisma.survey.findMany({
        take: limit,
        skip: offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          author: { select: { id: true, username: true, photoKey: true } },
          votes: { select: { option: true } },
        },
      }),
      this.prisma.survey.count(),
    ]);

    return {
      data: surveys.map((s) => this.withResults(s)),
      total,
      limit,
      offset,
    };
  }

  async findOne(id: string) {
    const survey = await this.prisma.survey.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, photoKey: true } },
        votes: { select: { option: true } },
      },
    });

    if (!survey) {
      AppError.notFound(ErrorCode.SURVEY_NOT_FOUND, 'Survey not found');
    }

    return this.withResults(survey);
  }

  async delete(authorId: string, id: string) {
    const survey = await this.prisma.survey.findUnique({ where: { id } });
    if (!survey) {
      AppError.notFound(ErrorCode.SURVEY_NOT_FOUND, 'Survey not found');
    }
    if (survey.authorId !== authorId) {
      AppError.forbidden(ErrorCode.SURVEY_FORBIDDEN_NOT_AUTHOR, 'Only the author can delete the survey');
    }

    await this.prisma.survey.delete({ where: { id } });
    return { deleted: true, id };
  }

  async vote(userId: string, surveyId: string, option: string) {
    const survey = await this.prisma.survey.findUnique({ where: { id: surveyId } });
    if (!survey) {
      AppError.notFound(ErrorCode.SURVEY_NOT_FOUND, 'Survey not found');
    }

    if (!survey.options.includes(option)) {
      AppError.badRequest(ErrorCode.SURVEY_INVALID_OPTION, 'Invalid option for this survey');
    }

    const existing = await this.prisma.surveyVote.findUnique({
      where: { userId_surveyId: { userId, surveyId } },
    });
    if (existing) {
      AppError.conflict(ErrorCode.SURVEY_ALREADY_VOTED, 'You already voted on this survey');
    }

    await this.prisma.surveyVote.create({
      data: {
        user: { connect: { id: userId } },
        survey: { connect: { id: surveyId } },
        option,
      },
    });

    const updated = await this.prisma.survey.findUnique({
      where: { id: surveyId },
      include: {
        author: { select: { id: true, username: true, photoKey: true } },
        votes: { select: { option: true } },
      },
    });

    return this.withResults(updated!);
  }

  async unvote(userId: string, surveyId: string) {
    const vote = await this.prisma.surveyVote.findUnique({
      where: { userId_surveyId: { userId, surveyId } },
    });
    if (!vote) {
      AppError.notFound(ErrorCode.SURVEY_NOT_FOUND, 'Vote not found');
    }

    await this.prisma.surveyVote.delete({
      where: { userId_surveyId: { userId, surveyId } },
    });

    const survey = await this.prisma.survey.findUnique({
      where: { id: surveyId },
      include: {
        author: { select: { id: true, username: true, photoKey: true } },
        votes: { select: { option: true } },
      },
    });

    return this.withResults(survey!);
  }

  private withResults(survey: {
    id: string;
    questionSurvey: string;
    options: string[];
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
    author: { id: string; username: string; photoKey: string | null };
    votes?: { option: string }[];
  }) {
    const voteCounts = new Map<string, number>();
    for (const opt of survey.options) {
      voteCounts.set(opt, 0);
    }
    for (const v of survey.votes ?? []) {
      voteCounts.set(v.option, (voteCounts.get(v.option) ?? 0) + 1);
    }

    const { author, authorId, createdAt, id, options, questionSurvey, updatedAt } = survey;
    return {
      id,
      questionSurvey,
      options,
      authorId,
      createdAt,
      updatedAt,
      author,
      results: survey.options.map((option) => ({
        option,
        count: voteCounts.get(option) ?? 0,
      })),
      totalVotes: (survey.votes ?? []).length,
    };
  }
}
