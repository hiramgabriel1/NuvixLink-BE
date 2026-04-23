import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostLikesQueryDto } from './dto/post-likes-query.dto';

/** Convierte `_count` de Prisma en campos explícitos por post (likes son por `postId` en la tabla `Like`). */
function postWithPublicCounts<T extends { _count: { likes: number; bookmarks: number } }>(post: T) {
  const { _count, ...rest } = post;
  return {
    ...rest,
    likesCount: _count.likes,
    bookmarksCount: _count.bookmarks,
  };
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  create(authorId: string, dto: CreatePostDto) {
    return this.prisma.post
      .create({
        data: {
          authorId,
          title: dto.title,
          description: dto.description,
          media: dto.media ?? [],
          website: dto.website,
          tags: dto.tags ?? [],
          isDraft: dto.isDraft ?? false,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              photoKey: true,
            },
          },
          _count: {
            select: {
              likes: true,
              bookmarks: true,
            },
          },
        },
      })
      .then(postWithPublicCounts);
  }

  findAll() {
    return this.prisma.post
      .findMany({
        where: { isDraft: false },
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              photoKey: true,
            },
          },
          _count: {
            select: {
              likes: true,
              bookmarks: true,
            },
          },
        },
      })
      .then((rows) => rows.map(postWithPublicCounts));
  }

  findMyBookmarks(userId: string) {
    return this.prisma.bookmark
      .findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  photoKey: true,
                },
              },
              _count: {
                select: {
                  likes: true,
                  bookmarks: true,
                },
              },
            },
          },
        },
      })
      .then((rows) =>
        rows.map((b) => ({
          ...b,
          post: postWithPublicCounts(b.post),
        })),
      );
  }

  async bookmarkPost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.bookmark.upsert({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
      update: {},
      create: {
        userId,
        postId,
      },
    });

    return { bookmarked: true };
  }

  async removeBookmark(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.bookmark.deleteMany({
      where: {
        userId,
        postId,
      },
    });

    return { bookmarked: false };
  }

  async getLikesForPost(postId: string, query: PostLikesQueryDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isDraft: true },
    });
    if (!post || post.isDraft) throw new NotFoundException('Post not found');

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.like.findMany({
        where: { postId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          createdAt: true,
          user: {
            select: { id: true, username: true, photoKey: true },
          },
        },
      }),
      this.prisma.like.count({ where: { postId } }),
    ]);

    return {
      postId,
      total,
      limit,
      offset,
      items: items.map((row) => ({
        userId: row.user.id,
        username: row.user.username,
        photoKey: row.user.photoKey,
        likedAt: row.createdAt,
      })),
    };
  }

  async likePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isDraft: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.isDraft) {
      throw new NotFoundException('Post not found');
    }

    await this.prisma.like.upsert({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
      update: {},
      create: {
        userId,
        postId,
      },
    });

    const likesCount = await this.prisma.like.count({ where: { postId } });
    return { liked: true, likesCount };
  }

  async unlikePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.like.deleteMany({
      where: { userId, postId },
    });

    const likesCount = await this.prisma.like.count({ where: { postId } });
    return { liked: false, likesCount };
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            photoKey: true,
          },
        },
        _count: {
          select: {
            likes: true,
            bookmarks: true,
          },
        },
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    return postWithPublicCounts(post);
  }
}
