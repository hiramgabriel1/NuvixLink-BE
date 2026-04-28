import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto, SearchScope } from './dto/search-query.dto';

const PAGE_LIMIT = 5 as const;

type SearchResult =
  | {
      type: 'user';
      id: string;
      username: string;
      photoKey: string | null;
      position: string | null;
      description: string | null;
      createdAt: Date;
    }
  | {
      type: 'post';
      id: string;
      title: string;
      description: string | null;
      media: string[];
      tags: string[];
      createdAt: Date;
      author: { id: string; username: string; photoKey: string | null };
      likesCount: number;
      bookmarksCount: number;
      commentsCount: number;
    }
  | {
      type: 'discussion';
      id: string;
      title: string;
      description: string | null;
      tags: string[];
      createdAt: Date;
      author: { id: string; username: string; photoKey: string | null };
      likesCount: number;
      commentsCount: number;
    };

function normQ(raw: string) {
  return raw.trim();
}

function scoreTextMatch(qLower: string, text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t === qLower) return 100;
  if (t.startsWith(qLower)) return 50;
  if (t.includes(qLower)) return 10;
  return 0;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQueryDto) {
    const q = normQ(query.q);
    const qLower = q.toLowerCase();
    const offset = query.offset ?? 0;
    const scope = query.scope ?? SearchScope.ALL;

    const takePerSource = offset + PAGE_LIMIT + 1; // para saber hasMore tras merge+slice

    const needUsers = scope === SearchScope.ALL || scope === SearchScope.USERS;
    const needPosts = scope === SearchScope.ALL || scope === SearchScope.POSTS;
    const needDiscussions = scope === SearchScope.ALL || scope === SearchScope.DISCUSSIONS;

    const [users, posts, discussions] = await Promise.all([
      needUsers
        ? this.prisma.user.findMany({
            where: {
              isActive: true,
              username: { contains: q, mode: 'insensitive' },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: takePerSource,
            select: {
              id: true,
              username: true,
              photoKey: true,
              position: true,
              description: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      needPosts
        ? this.prisma.post.findMany({
            where: {
              isDraft: false,
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { tags: { has: q } },
              ],
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: takePerSource,
            include: {
              author: { select: { id: true, username: true, photoKey: true } },
              _count: { select: { likes: true, bookmarks: true, comments: true } },
            },
          })
        : Promise.resolve([]),
      needDiscussions
        ? this.prisma.discussion.findMany({
            where: {
              isDraft: false,
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { tags: { has: q } },
              ],
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: takePerSource,
            include: {
              author: { select: { id: true, username: true, photoKey: true } },
              _count: { select: { likes: true, comments: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const scored: Array<{ score: number; createdAt: Date; row: SearchResult }> = [];

    for (const u of users) {
      const score = scoreTextMatch(qLower, u.username) * 2;
      scored.push({
        score,
        createdAt: u.createdAt,
        row: { type: 'user', ...u },
      });
    }

    for (const p of posts) {
      const score =
        scoreTextMatch(qLower, p.title) * 2 +
        scoreTextMatch(qLower, p.description) +
        (p.tags.some((t) => t.toLowerCase() === qLower) ? 30 : 0);
      scored.push({
        score,
        createdAt: p.createdAt,
        row: {
          type: 'post',
          id: p.id,
          title: p.title,
          description: p.description,
          media: p.media,
          tags: p.tags,
          createdAt: p.createdAt,
          author: p.author,
          likesCount: p._count.likes,
          bookmarksCount: p._count.bookmarks,
          commentsCount: p._count.comments,
        },
      });
    }

    for (const d of discussions) {
      const score =
        scoreTextMatch(qLower, d.title) * 2 +
        scoreTextMatch(qLower, d.description) +
        (d.tags.some((t) => t.toLowerCase() === qLower) ? 30 : 0);
      scored.push({
        score,
        createdAt: d.createdAt,
        row: {
          type: 'discussion',
          id: d.id,
          title: d.title,
          description: d.description,
          tags: d.tags,
          createdAt: d.createdAt,
          author: d.author,
          likesCount: d._count.likes,
          commentsCount: d._count.comments,
        },
      });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.createdAt.getTime() !== a.createdAt.getTime()) return b.createdAt.getTime() - a.createdAt.getTime();
      return 0;
    });

    const pageSlice = scored.slice(offset, offset + PAGE_LIMIT);
    const hasMore = scored.length > offset + PAGE_LIMIT;

    return {
      q,
      scope,
      limit: PAGE_LIMIT,
      offset,
      hasMore,
      data: pageSlice.map((x) => x.row),
    };
  }
}

