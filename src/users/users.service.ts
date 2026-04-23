import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrendingBuildersBy, TrendingBuildersQueryDto } from './dto/trending-builders-query.dto';

type TrendingBuilder = {
  id: string;
  username: string;
  photoKey: string | null;
  position: string | null;
  description: string | null;
  followersCount: number;
  likesReceivedCount: number;
  score: number;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrendingBuilders(query: TrendingBuildersQueryDto) {
    const by = query.by ?? TrendingBuildersBy.COMBINED;
    const limit = query.limit ?? 10;

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        photoKey: true,
        position: true,
        description: true,
        _count: {
          select: {
            followers: true,
          },
        },
      },
    });

    const postLikes = await this.prisma.post.findMany({
      where: { isDraft: false },
      select: {
        authorId: true,
        _count: {
          select: {
            likes: true,
          },
        },
      },
    });

    const likesByAuthor = postLikes.reduce<Record<string, number>>((acc, post) => {
      acc[post.authorId] = (acc[post.authorId] ?? 0) + post._count.likes;
      return acc;
    }, {});

    const builders: TrendingBuilder[] = users.map((user) => {
      const followersCount = user._count.followers;
      const likesReceivedCount = likesByAuthor[user.id] ?? 0;
      const score =
        by === TrendingBuildersBy.FOLLOWERS
          ? followersCount
          : by === TrendingBuildersBy.LIKES
            ? likesReceivedCount
            : followersCount + likesReceivedCount;

      return {
        id: user.id,
        username: user.username,
        photoKey: user.photoKey,
        position: user.position,
        description: user.description,
        followersCount,
        likesReceivedCount,
        score,
      };
    });

    const trending = builders
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.followersCount !== a.followersCount) return b.followersCount - a.followersCount;
        return b.likesReceivedCount - a.likesReceivedCount;
      })
      .slice(0, limit);

    return {
      by,
      limit,
      totalCandidates: builders.length,
      items: trending,
    };
  }
}

