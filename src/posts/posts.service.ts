import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Express } from 'express';
import type { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { FeedGateway } from '../realtime/feed.gateway';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateDraftPostDto } from './dto/create-draft-post.dto';
import { DraftPostsListQueryDto } from './dto/draft-posts-list-query.dto';
import { PostCommentsQueryDto } from './dto/post-comments-query.dto';
import { PostLikesQueryDto } from './dto/post-likes-query.dto';
import { PostsListFilter, PostsListQueryDto } from './dto/posts-list-query.dto';
import { UpdateDraftPostDto } from './dto/update-draft-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

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
    private readonly notifications: NotificationsService,
  ) {}

  private async uploadPostImages(authorId: string, files?: Express.Multer.File[]): Promise<string[]> {
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
    return fromUploads;
  }

  async create(authorId: string, dto: CreatePostDto, files?: Express.Multer.File[]) {
    const fromUploads = await this.uploadPostImages(authorId, files);
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

  private readonly draftOrderBy = [
    { updatedAt: 'desc' as const },
    { id: 'desc' as const },
  ];

  async listMyDrafts(authorId: string, query: DraftPostsListQueryDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.draftPost.findMany({
        where: { authorId },
        orderBy: this.draftOrderBy,
        skip: offset,
        take: limit,
      }),
      this.prisma.draftPost.count({ where: { authorId } }),
    ]);
    return { data, total, limit, offset };
  }

  async createDraft(authorId: string, dto: CreateDraftPostDto, files?: Express.Multer.File[]) {
    const fromUploads = await this.uploadPostImages(authorId, files);
    const media = [...(dto.media ?? []), ...fromUploads];
    const title = dto.title?.trim() ?? '';
    return this.prisma.draftPost.create({
      data: {
        authorId,
        title,
        description: dto.description,
        media,
        website: dto.website,
        tags: dto.tags ?? [],
      },
    });
  }

  async getDraft(authorId: string, draftId: string) {
    const draft = await this.prisma.draftPost.findFirst({
      where: { id: draftId, authorId },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    return draft;
  }

  async updateDraft(
    authorId: string,
    draftId: string,
    dto: UpdateDraftPostDto,
    files?: Express.Multer.File[],
  ) {
    const draft = await this.prisma.draftPost.findFirst({
      where: { id: draftId, authorId },
    });
    if (!draft) throw new NotFoundException('Draft not found');

    const fromUploads = await this.uploadPostImages(authorId, files);
    const newMedia =
      dto.media !== undefined
        ? [...dto.media, ...fromUploads]
        : fromUploads.length > 0
          ? [...draft.media, ...fromUploads]
          : undefined;

    return this.prisma.draftPost.update({
      where: { id: draftId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.website !== undefined ? { website: dto.website } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(newMedia !== undefined ? { media: newMedia } : {}),
      },
    });
  }

  async deleteDraft(authorId: string, draftId: string) {
    const draft = await this.prisma.draftPost.findFirst({
      where: { id: draftId, authorId },
      select: { id: true },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    await this.prisma.draftPost.delete({ where: { id: draftId } });
    return { deleted: true, id: draftId };
  }

  async publishDraft(authorId: string, draftId: string) {
    const post = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.draftPost.findFirst({
        where: { id: draftId, authorId },
      });
      if (!draft) throw new NotFoundException('Draft not found');
      const title = draft.title.trim();
      if (!title) {
        throw new BadRequestException('Añade un título para publicar');
      }

      const created = await tx.post.create({
        data: {
          authorId,
          title,
          description: draft.description,
          media: draft.media,
          website: draft.website,
          tags: draft.tags,
          isDraft: false,
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
      });

      await tx.draftPost.delete({ where: { id: draftId } });
      return postWithPublicCounts(created);
    });

    this.feedGateway.emitPostCreated(post);
    return post;
  }

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
      select: { id: true, isDraft: true, authorId: true, title: true },
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
    void this.notifyPostCommentAndMentions({
      post,
      postId,
      authorId,
      body,
      comment,
    });
    return comment;
  }

  private async notifyPostCommentAndMentions(args: {
    post: { authorId: string; title: string };
    postId: string;
    authorId: string;
    body: string;
    comment: { id: string; body: string };
  }) {
    try {
      await this.notifications.onCommentOnPost({
        postAuthorId: args.post.authorId,
        commentAuthorId: args.authorId,
        postId: args.postId,
        postTitle: args.post.title,
        commentId: args.comment.id,
        body: args.body,
      });
      await this.notifications.onMentionsInPostComment({
        body: args.body,
        commentAuthorId: args.authorId,
        postId: args.postId,
        postTitle: args.post.title,
        commentId: args.comment.id,
        postAuthorId: args.post.authorId,
      });
    } catch {
      // no bloquear comentario si falla notificación
    }
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

    const alreadyLiked = await this.prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

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
    if (!alreadyLiked) {
      const forNotify = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true, title: true },
      });
      if (forNotify) {
        void this.notifications
          .onLikeOnPost(forNotify.authorId, userId, postId, forNotify.title)
          .catch(() => undefined);
      }
    }
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

  async updatePost(authorId: string, postId: string, dto: UpdatePostDto, files?: Express.Multer.File[]) {
    const existing = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        authorId: true,
        isDraft: true,
        title: true,
        description: true,
        media: true,
        website: true,
        tags: true,
      },
    });
    if (!existing) throw new NotFoundException('Post not found');
    if (existing.isDraft) throw new NotFoundException('Post not found');
    if (existing.authorId !== authorId) {
      throw new ForbiddenException('Solo el autor del post puede editarlo');
    }

    const fromUploads = await this.uploadPostImages(authorId, files);
    const newMedia =
      dto.media !== undefined
        ? [...dto.media, ...fromUploads]
        : fromUploads.length > 0
          ? [...existing.media, ...fromUploads]
          : undefined;

    const nextTitle = dto.title !== undefined ? dto.title.trim() : existing.title;
    if (!nextTitle) {
      throw new BadRequestException('El título no puede estar vacío');
    }

    const data: Prisma.PostUpdateInput = {};
    if (dto.title !== undefined) data.title = nextTitle;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.website !== undefined) data.website = dto.website;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (newMedia !== undefined) data.media = newMedia;

    if (Object.keys(data).length === 0) {
      return this.findOne(postId);
    }

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data,
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
    const result = postWithPublicCounts(updated);
    this.feedGateway.emitPostUpdated(result);
    return result;
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
    this.feedGateway.emitPostDeleted({ postId });
    return { deleted: true, id: postId };
  }
}
