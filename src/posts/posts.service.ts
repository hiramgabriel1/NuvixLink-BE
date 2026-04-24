import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { FeedGateway } from './feed.gateway';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostCommentsQueryDto } from './dto/post-comments-query.dto';
import { PostLikesQueryDto } from './dto/post-likes-query.dto';
import { PostsListFilter, PostsListQueryDto } from './dto/posts-list-query.dto';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function s3PostMediaKeyPrefix(): string {
  const raw = process.env.S3_POSTS_FOLDER?.trim().replace(/^\//, '');
  if (!raw) {
    return 'post-media/';
  }
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/** Convierte `_count` de Prisma en campos explícitos por post (likes, bookmarks, comentarios). */
function postWithPublicCounts<T extends { _count: { likes: number; bookmarks: number; comments: number } }>(
  post: T,
) {
  const { _count, ...rest } = post;
  return {
    ...rest,
    likesCount: _count.likes,
    bookmarksCount: _count.bookmarks,
    commentsCount: _count.comments,
  };
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly feedGateway: FeedGateway,
  ) {}

  async create(authorId: string, dto: CreatePostDto, files?: Express.Multer.File[]) {
    const fromUploads: string[] = [];
    if (files?.length) {
      for (const file of files) {
        if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
          throw new BadRequestException('Cada imagen del post debe ser JPEG, PNG, GIF o WebP');
        }
        const ext = this.extensionForImage(file.mimetype, file.originalname);
        const s3ObjectKey = `${s3PostMediaKeyPrefix()}${authorId}/${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
        await this.s3.putObject({
          key: s3ObjectKey,
          body: file.buffer,
          contentType: file.mimetype,
          acl: S3Service.publicObjectWriteAcl(),
        });
        fromUploads.push(S3Service.publicUrlForObjectKey(s3ObjectKey));
      }
    }
    const media = [...(dto.media ?? []), ...fromUploads];
    const isDraft = dto.isDraft ?? false;
    const post = await this.prisma.post
      .create({
        data: {
          authorId,
          title: dto.title,
          description: dto.description,
          media,
          website: dto.website,
          tags: dto.tags ?? [],
          isDraft,
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
              comments: true,
            },
          },
        },
      })
      .then(postWithPublicCounts);
    if (!isDraft) {
      this.feedGateway.emitPostCreated(post);
    }
    return post;
  }

  private extensionForImage(mimetype: string, originalname: string): string {
    const byMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    if (byMime[mimetype]) return byMime[mimetype];
    const fromName = originalname?.match(/(\.[a-zA-Z0-9]+)$/);
    return fromName?.[1] ?? '.bin';
  }

  private readonly postListInclude = {
    author: {
      select: {
        id: true,
        username: true,
        photoKey: true,
      } as const,
    },
    _count: {
      select: {
        likes: true,
        bookmarks: true,
        comments: true,
      } as const,
    },
  };

  /** Orden estable: recientes primero; `id` desempata para que offset no “bailen” filas con el mismo `createdAt`. */
  private readonly feedOrderBy = [
    { createdAt: 'desc' as const },
    { id: 'desc' as const },
  ];

  async findAll(query: PostsListQueryDto, currentUserId?: string) {
    const filter = query.filter ?? PostsListFilter.ALL;
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    if (filter === PostsListFilter.FOLLOWING) {
      if (!currentUserId) {
        throw new UnauthorizedException(
          'Para ?filter=following debes enviar Authorization: Bearer <token>',
        );
      }
      const following = await this.prisma.follow.findMany({
        where: { followerId: currentUserId },
        select: { followingId: true },
      });
      const authorIds = following.map((f) => f.followingId);
      if (authorIds.length === 0) {
        return { data: [], limit, offset, filter };
      }
      const rows = await this.prisma.post.findMany({
        where: { isDraft: false, authorId: { in: authorIds } },
        orderBy: this.feedOrderBy,
        skip: offset,
        take: limit,
        include: this.postListInclude,
      });
      return {
        data: rows.map(postWithPublicCounts),
        limit,
        offset,
        filter,
      };
    }

    const rows = await this.prisma.post.findMany({
      where: { isDraft: false },
      orderBy: this.feedOrderBy,
      skip: offset,
      take: limit,
      include: this.postListInclude,
    });
    return {
      data: rows.map(postWithPublicCounts),
      limit,
      offset,
      filter,
    };
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
                  comments: true,
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

  async getCommentsForPost(postId: string, query: PostCommentsQueryDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isDraft: true },
    });
    if (!post || post.isDraft) throw new NotFoundException('Post not found');

    const limit = query.limit ?? 5;
    const offset = query.offset ?? 0;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where: { postId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          author: {
            select: { id: true, username: true, photoKey: true },
          },
        },
      }),
      this.prisma.comment.count({ where: { postId } }),
    ]);

    return {
      postId,
      total,
      limit,
      offset,
      items: rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        author: row.author,
      })),
    };
  }

  async createComment(authorId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isDraft: true },
    });
    if (!post || post.isDraft) {
      throw new NotFoundException('Post not found');
    }

    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('El comentario no puede estar vacío');
    }

    const comment = await this.prisma.comment.create({
      data: {
        postId,
        authorId,
        body,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: { id: true, username: true, photoKey: true },
        },
      },
    });
    const commentsCount = await this.prisma.comment.count({ where: { postId } });
    this.feedGateway.emitCommentCreated({ postId, comment, commentsCount });
    return comment;
  }

  private async getCommentForOwnerOrThrow(
    userId: string,
    postId: string,
    commentId: string,
  ) {
    const found = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, authorId: true },
    });
    if (!found || found.postId !== postId) {
      throw new NotFoundException('Comment not found');
    }
    if (found.authorId !== userId) {
      throw new ForbiddenException('Solo el autor del comentario puede modificarlo o eliminarlo');
    }
    return found;
  }

  async updateComment(userId: string, postId: string, commentId: string, dto: UpdateCommentDto) {
    await this.getCommentForOwnerOrThrow(userId, postId, commentId);
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('El comentario no puede estar vacío');
    }
    const comment = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: { id: true, username: true, photoKey: true },
        },
      },
    });
    this.feedGateway.emitCommentUpdated({ postId, comment });
    return comment;
  }

  async deleteComment(userId: string, postId: string, commentId: string) {
    await this.getCommentForOwnerOrThrow(userId, postId, commentId);
    await this.prisma.comment.delete({ where: { id: commentId } });
    const commentsCount = await this.prisma.comment.count({ where: { postId } });
    this.feedGateway.emitCommentDeleted({ postId, commentId, commentsCount });
    return { deleted: true, id: commentId, postId };
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
            comments: true,
          },
        },
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    return postWithPublicCounts(post);
  }

  async deletePost(authorId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== authorId) {
      throw new ForbiddenException('Solo el autor del post puede eliminarlo');
    }
    await this.prisma.post.delete({ where: { id: postId } });
    return { deleted: true, id: postId };
  }
}
