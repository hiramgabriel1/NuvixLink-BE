import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeedGateway } from '../realtime/feed.gateway';
import { CreateCommentDto } from '../posts/dto/create-comment.dto';
import { PostCommentsQueryDto } from '../posts/dto/post-comments-query.dto';
import { PostLikesQueryDto } from '../posts/dto/post-likes-query.dto';
import { UpdateCommentDto } from '../posts/dto/update-comment.dto';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { DiscussionsListFilter, DiscussionsListQueryDto } from './dto/discussions-list-query.dto';
import { UpdateDiscussionDto } from './dto/update-discussion.dto';

function discussionWithPublicCounts<T extends { _count: { likes: number; comments: number } }>(row: T) {
  const { _count, ...rest } = row;
  return {
    ...rest,
    likesCount: _count.likes,
    commentsCount: _count.comments,
  };
}

@Injectable()
export class DiscussionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feedGateway: FeedGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private readonly listInclude = {
    author: {
      select: { id: true, username: true, photoKey: true } as const,
    },
    _count: { select: { likes: true, comments: true } as const },
  };

  private readonly orderBy = [
    { createdAt: 'desc' as const },
    { id: 'desc' as const },
  ];

  async create(authorId: string, dto: CreateDiscussionDto) {
    const isDraft = dto.isDraft ?? false;
    const data: Prisma.DiscussionCreateInput = {
      author: { connect: { id: authorId } },
      title: dto.title.trim(),
      isDraft,
      tags: dto.tags ?? [],
    };
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    const row = await this.prisma.discussion.create({
      data,
      include: this.listInclude,
    });
    const out = discussionWithPublicCounts(row);
    if (!isDraft) {
      this.feedGateway.emitDiscussionCreated(out);
    }
    return out;
  }

  async findAll(query: DiscussionsListQueryDto, currentUserId?: string) {
    const filter = query.filter ?? DiscussionsListFilter.ALL;
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    if (filter === DiscussionsListFilter.FOLLOWING) {
      if (!currentUserId) {
        AppError.unauthorized(
          ErrorCode.DISCUSSION_AUTH_REQUIRED_FOR_FOLLOWING_FEED,
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
      const rows = await this.prisma.discussion.findMany({
        where: { isDraft: false, authorId: { in: authorIds } },
        orderBy: this.orderBy,
        skip: offset,
        take: limit,
        include: this.listInclude,
      });
      return {
        data: rows.map(discussionWithPublicCounts),
        limit,
        offset,
        filter,
      };
    }

    const rows = await this.prisma.discussion.findMany({
      where: { isDraft: false },
      orderBy: this.orderBy,
      skip: offset,
      take: limit,
      include: this.listInclude,
    });
    return {
      data: rows.map(discussionWithPublicCounts),
      limit,
      offset,
      filter,
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.discussion.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, photoKey: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (!row) AppError.notFound(ErrorCode.DISCUSSION_NOT_FOUND, 'Discussion not found');
    return discussionWithPublicCounts(row);
  }

  async updateDiscussion(authorId: string, id: string, dto: UpdateDiscussionDto) {
    const existing = await this.prisma.discussion.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!existing) AppError.notFound(ErrorCode.DISCUSSION_NOT_FOUND, 'Discussion not found');
    if (existing.authorId !== authorId) {
      AppError.forbidden(ErrorCode.DISCUSSION_FORBIDDEN_EDIT, 'Solo el autor puede editar la discusión');
    }
    const data: Prisma.DiscussionUpdateInput = {};
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (!t) AppError.badRequest(ErrorCode.DISCUSSION_TITLE_EMPTY, 'El título no puede quedar vacío');
      data.title = t;
    }
    if (dto.description !== undefined) {
      data.description = dto.description === null || dto.description === '' ? null : String(dto.description).trim() || null;
    }
    if (dto.tags !== undefined) {
      data.tags = dto.tags ?? [];
    }
    if (dto.isDraft !== undefined) {
      data.isDraft = dto.isDraft;
    }
    if (Object.keys(data).length === 0) {
      AppError.badRequest(ErrorCode.DISCUSSION_NOTHING_TO_UPDATE, 'Nada que actualizar');
    }
    const row = await this.prisma.discussion.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, username: true, photoKey: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    return discussionWithPublicCounts(row);
  }

  async deleteDiscussion(authorId: string, id: string) {
    const existing = await this.prisma.discussion.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!existing) AppError.notFound(ErrorCode.DISCUSSION_NOT_FOUND, 'Discussion not found');
    if (existing.authorId !== authorId) {
      AppError.forbidden(ErrorCode.DISCUSSION_FORBIDDEN_DELETE, 'Solo el autor puede eliminar la discusión');
    }
    await this.prisma.discussion.delete({ where: { id } });
    return { deleted: true, id };
  }

  async getLikesForDiscussion(discussionId: string, query: PostLikesQueryDto) {
    const d = await this.prisma.discussion.findUnique({
      where: { id: discussionId },
      select: { id: true, isDraft: true },
    });
    if (!d || d.isDraft) AppError.notFound(ErrorCode.DISCUSSION_NOT_FOUND, 'Discussion not found');

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.discussionLike.findMany({
        where: { discussionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          createdAt: true,
          user: { select: { id: true, username: true, photoKey: true } },
        },
      }),
      this.prisma.discussionLike.count({ where: { discussionId } }),
    ]);

    return {
      discussionId,
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

  async getCommentsForDiscussion(discussionId: string, query: PostCommentsQueryDto, viewerUserId?: string) {
    const d = await this.prisma.discussion.findUnique({
      where: { id: discussionId },
      select: { id: true, isDraft: true },
    });
    if (!d || d.isDraft) AppError.notFound(ErrorCode.DISCUSSION_NOT_FOUND, 'Discussion not found');

    const limit = query.limit ?? 5;
    const offset = query.offset ?? 0;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.discussionComment.findMany({
        where: { discussionId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          parentId: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, username: true, photoKey: true } },
          _count: { select: { likes: true, replies: true } },
        },
      }),
      this.prisma.discussionComment.count({ where: { discussionId } }),
    ]);

    let likedIds = new Set<string>();
    if (viewerUserId && rows.length > 0) {
      const batch = await this.prisma.discussionCommentLike.findMany({
        where: {
          userId: viewerUserId,
          discussionCommentId: { in: rows.map((r) => r.id) },
        },
        select: { discussionCommentId: true },
      });
      likedIds = new Set(batch.map((b) => b.discussionCommentId));
    }

    return {
      discussionId,
      total,
      limit,
      offset,
      items: rows.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        author: row.author,
        repliesCount: row._count.replies,
        likesCount: row._count.likes,
        likedByViewer: viewerUserId ? likedIds.has(row.id) : false,
      })),
    };
  }

  async createComment(authorId: string, discussionId: string, dto: CreateCommentDto) {
    const d = await this.prisma.discussion.findUnique({
      where: { id: discussionId },
      select: { id: true, isDraft: true, authorId: true, title: true },
    });
    if (!d || d.isDraft) {
      AppError.notFound(ErrorCode.DISCUSSION_NOT_FOUND, 'Discussion not found');
    }
    const body = dto.body.trim();
    if (!body) {
      AppError.badRequest(ErrorCode.DISCUSSION_COMMENT_EMPTY, 'El comentario no puede estar vacío');
    }

    const rawParentId = dto.parentId?.trim();
    let parentCommentAuthorId: string | undefined;
    if (rawParentId) {
      const parent = await this.prisma.discussionComment.findFirst({
        where: { id: rawParentId, discussionId },
        select: { id: true, authorId: true },
      });
      if (!parent) {
        AppError.badRequest(
          ErrorCode.DISCUSSION_COMMENT_PARENT_INVALID,
          'El comentario al que respondes no existe o no pertenece a esta discusión',
        );
      }
      parentCommentAuthorId = parent.authorId;
    }

    const comment = await this.prisma.discussionComment.create({
      data: {
        discussionId,
        authorId,
        body,
        ...(rawParentId ? { parentId: rawParentId } : {}),
      },
      select: {
        id: true,
        parentId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, username: true, photoKey: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });
    const commentsCount = await this.prisma.discussionComment.count({ where: { discussionId } });
    const { _count, ...rest } = comment;
    const out = { ...rest, likesCount: _count.likes, repliesCount: _count.replies };
    this.feedGateway.emitDiscussionCommentCreated({ discussionId, comment: out, commentsCount });
    try {
      await this.notifications.onMentionsInDiscussionComment({
        body,
        commentAuthorId: authorId,
        discussionId,
        discussionTitle: d.title,
        commentId: comment.id,
        discussionAuthorId: d.authorId,
      });
      if (rawParentId && parentCommentAuthorId !== undefined) {
        await this.notifications.onReplyToYourDiscussionComment({
          parentAuthorId: parentCommentAuthorId,
          replyAuthorId: authorId,
          discussionId,
          discussionTitle: d.title,
          replyCommentId: comment.id,
          parentCommentId: rawParentId,
          body,
        });
      } else {
        await this.notifications.onCommentOnDiscussion({
          discussionAuthorId: d.authorId,
          commentAuthorId: authorId,
          discussionId,
          discussionTitle: d.title,
          commentId: comment.id,
          body,
        });
      }
    } catch {
      /* vacío */
    }
    return out;
  }

  private async getDiscussionCommentForOwnerOrThrow(
    userId: string,
    discussionId: string,
    commentId: string,
  ) {
    const found = await this.prisma.discussionComment.findUnique({
      where: { id: commentId },
      select: { id: true, discussionId: true, authorId: true },
    });
    if (!found || found.discussionId !== discussionId) {
      AppError.notFound(ErrorCode.DISCUSSION_COMMENT_NOT_FOUND, 'Comment not found');
    }
    if (found.authorId !== userId) {
      AppError.forbidden(
        ErrorCode.DISCUSSION_FORBIDDEN_COMMENT_AUTHOR,
        'Solo el autor del comentario puede modificarlo o eliminarlo',
      );
    }
    return found;
  }

  async updateComment(
    userId: string,
    discussionId: string,
    commentId: string,
    dto: UpdateCommentDto,
  ) {
    await this.getDiscussionCommentForOwnerOrThrow(userId, discussionId, commentId);
    const body = dto.body.trim();
    if (!body) {
      AppError.badRequest(ErrorCode.DISCUSSION_COMMENT_EMPTY, 'El comentario no puede estar vacío');
    }
    const comment = await this.prisma.discussionComment.update({
      where: { id: commentId },
      data: { body },
      select: {
        id: true,
        parentId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, username: true, photoKey: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });
    const { _count: c, ...rest } = comment;
    const outComment = { ...rest, likesCount: c.likes, repliesCount: c.replies };
    this.feedGateway.emitDiscussionCommentUpdated({ discussionId, comment: outComment });
    return outComment;
  }

  async deleteComment(userId: string, discussionId: string, commentId: string) {
    await this.getDiscussionCommentForOwnerOrThrow(userId, discussionId, commentId);
    await this.prisma.discussionComment.delete({ where: { id: commentId } });
    const commentsCount = await this.prisma.discussionComment.count({ where: { discussionId } });
    this.feedGateway.emitDiscussionCommentDeleted({ discussionId, commentId, commentsCount });
    return { deleted: true, id: commentId, discussionId };
  }

  async likeDiscussionComment(userId: string, discussionId: string, commentId: string) {
    const row = await this.prisma.discussionComment.findFirst({
      where: { id: commentId, discussionId },
      select: {
        id: true,
        authorId: true,
        body: true,
        discussion: { select: { isDraft: true } },
      },
    });
    if (!row || row.discussion.isDraft) {
      AppError.notFound(ErrorCode.DISCUSSION_COMMENT_NOT_FOUND, 'Comment not found');
    }

    const already = await this.prisma.discussionCommentLike.findUnique({
      where: {
        userId_discussionCommentId: {
          userId,
          discussionCommentId: commentId,
        },
      },
    });

    await this.prisma.discussionCommentLike.upsert({
      where: {
        userId_discussionCommentId: {
          userId,
          discussionCommentId: commentId,
        },
      },
      update: {},
      create: {
        userId,
        discussionCommentId: commentId,
      },
    });
    const likesCount = await this.prisma.discussionCommentLike.count({
      where: { discussionCommentId: commentId },
    });

    if (!already) {
      void this.notifications
        .onLikeOnYourDiscussionComment({
          commentAuthorId: row.authorId,
          likerId: userId,
          discussionId,
          commentId,
          previewBody: row.body,
        })
        .catch(() => undefined);
    }

    return { liked: true, likesCount };
  }

  async unlikeDiscussionComment(userId: string, discussionId: string, commentId: string) {
    const row = await this.prisma.discussionComment.findFirst({
      where: { id: commentId, discussionId },
      select: {
        id: true,
        discussion: { select: { isDraft: true } },
      },
    });
    if (!row || row.discussion.isDraft) {
      AppError.notFound(ErrorCode.DISCUSSION_COMMENT_NOT_FOUND, 'Comment not found');
    }

    await this.prisma.discussionCommentLike.deleteMany({
      where: { userId, discussionCommentId: commentId },
    });
    const likesCount = await this.prisma.discussionCommentLike.count({
      where: { discussionCommentId: commentId },
    });
    return { liked: false, likesCount };
  }

  async likeDiscussion(userId: string, discussionId: string) {
    const d = await this.prisma.discussion.findUnique({
      where: { id: discussionId },
      select: { id: true, isDraft: true, authorId: true, title: true },
    });
    if (!d || d.isDraft) {
      AppError.notFound(ErrorCode.DISCUSSION_NOT_FOUND, 'Discussion not found');
    }
    const alreadyLiked = await this.prisma.discussionLike.findUnique({
      where: {
        userId_discussionId: { userId, discussionId },
      },
    });
    await this.prisma.discussionLike.upsert({
      where: {
        userId_discussionId: { userId, discussionId },
      },
      update: {},
      create: { userId, discussionId },
    });
    const likesCount = await this.prisma.discussionLike.count({ where: { discussionId } });
    if (!alreadyLiked) {
      void this.notifications
        .onLikeOnDiscussion(d.authorId, userId, discussionId, d.title)
        .catch(() => undefined);
    }
    return { liked: true, likesCount };
  }

  async unlikeDiscussion(userId: string, discussionId: string) {
    const d = await this.prisma.discussion.findUnique({
      where: { id: discussionId },
      select: { id: true },
    });
    if (!d) AppError.notFound(ErrorCode.DISCUSSION_NOT_FOUND, 'Discussion not found');
    await this.prisma.discussionLike.deleteMany({
      where: { userId, discussionId },
    });
    const likesCount = await this.prisma.discussionLike.count({ where: { discussionId } });
    return { liked: false, likesCount };
  }
}
