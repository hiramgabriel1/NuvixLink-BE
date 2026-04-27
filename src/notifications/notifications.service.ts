import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, NotificationType } from '../generated/prisma/client';
import { FeedGateway } from '../realtime/feed.gateway';
import { PrismaService } from '../prisma/prisma.service';

const previewText = (s: string, max = 200) => {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
};

const listInclude = {
  actor: { select: { id: true, username: true, photoKey: true } as const },
  post: { select: { id: true, title: true, isDraft: true } as const },
  comment: { select: { id: true, postId: true, body: true } as const },
  discussion: { select: { id: true, title: true, isDraft: true } as const },
  discussionComment: { select: { id: true, discussionId: true, body: true } as const },
} as const;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feedGateway: FeedGateway,
  ) {}

  async list(userId: string, unreadOnly: boolean, limit: number, offset: number) {
    const where: Prisma.NotificationWhereInput = { userId, ...(unreadOnly ? { read: false } : {}) };
    const [rows, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: listInclude,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return {
      data: rows,
      total,
      unreadCount,
      limit,
      offset,
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(userId: string, notificationId: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!n) {
      throw new NotFoundException('Notificación no encontrada');
    }
    if (n.read) {
      return n;
    }
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
      include: listInclude,
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    this.feedGateway.emitNotificationUpdated(userId, updated);
    this.feedGateway.emitNotificationsUnread(userId, unreadCount);
    return updated;
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    if (result.count > 0) {
      this.feedGateway.emitNotificationsUnread(userId, 0);
    }
    return { updated: result.count };
  }

  // ——— Disparadores (llamados desde posts / users / discussions) ———

  private async actorUsername(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    return u?.username ?? 'usuario';
  }

  private async create(data: {
    userId: string;
    actorId: string | null;
    type: NotificationType;
    title: string;
    preview: string | null;
    postId?: string | null;
    commentId?: string | null;
    discussionId?: string | null;
    discussionCommentId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    if (data.userId === data.actorId) {
      return;
    }
    const row = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        actorId: data.actorId,
        type: data.type,
        title: data.title,
        preview: data.preview,
        postId: data.postId ?? undefined,
        commentId: data.commentId ?? undefined,
        discussionId: data.discussionId ?? undefined,
        discussionCommentId: data.discussionCommentId ?? undefined,
        metadata: data.metadata,
      },
      include: listInclude,
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId: data.userId, read: false },
    });
    this.feedGateway.emitNotificationCreated(data.userId, row);
    this.feedGateway.emitNotificationsUnread(data.userId, unreadCount);
  }

  async onNewFollower(recipientId: string, actorId: string) {
    if (recipientId === actorId) return;
    const name = await this.actorUsername(actorId);
    await this.create({
      userId: recipientId,
      actorId,
      type: 'NEW_FOLLOWER',
      title: `${name} comenzó a seguirte`,
      preview: null,
    });
  }

  async onCommentOnPost(args: {
    postAuthorId: string;
    commentAuthorId: string;
    postId: string;
    postTitle: string;
    commentId: string;
    body: string;
  }) {
    if (args.postAuthorId === args.commentAuthorId) return;
    const name = await this.actorUsername(args.commentAuthorId);
    await this.create({
      userId: args.postAuthorId,
      actorId: args.commentAuthorId,
      type: 'COMMENT_ON_YOUR_POST',
      title: `${name} comentó en tu publicación`,
      preview: previewText(args.body),
      postId: args.postId,
      commentId: args.commentId,
    });
  }

  async onMentionsInPostComment(args: {
    body: string;
    commentAuthorId: string;
    postId: string;
    postTitle: string;
    commentId: string;
    postAuthorId: string;
  }) {
    const re = /@([a-zA-Z0-9_]+)/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    const usernames: string[] = [];
    while ((m = re.exec(args.body)) !== null) {
      const u = m[1];
      if (seen.has(u)) continue;
      seen.add(u);
      usernames.push(u);
      if (usernames.length > 20) break;
    }
    if (usernames.length === 0) return;
    const users = await this.prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true, username: true },
    });
    const name = await this.actorUsername(args.commentAuthorId);
    for (const u of users) {
      if (u.id === args.commentAuthorId) continue;
      if (u.id === args.postAuthorId) continue;
      await this.create({
        userId: u.id,
        actorId: args.commentAuthorId,
        type: 'MENTION',
        title: `${name} te mencionó en un comentario`,
        preview: previewText(args.body),
        postId: args.postId,
        commentId: args.commentId,
        metadata: { postTitle: args.postTitle },
      });
    }
  }

  async onLikeOnPost(postAuthorId: string, likerId: string, postId: string, postTitle: string) {
    if (postAuthorId === likerId) return;
    const name = await this.actorUsername(likerId);
    await this.create({
      userId: postAuthorId,
      actorId: likerId,
      type: 'LIKE_ON_YOUR_POST',
      title: `A ${name} le gustó tu publicación`,
      preview: postTitle,
      postId,
    });
  }

  async onCommentOnDiscussion(args: {
    discussionAuthorId: string;
    commentAuthorId: string;
    discussionId: string;
    discussionTitle: string;
    commentId: string;
    body: string;
  }) {
    if (args.discussionAuthorId === args.commentAuthorId) return;
    const name = await this.actorUsername(args.commentAuthorId);
    await this.create({
      userId: args.discussionAuthorId,
      actorId: args.commentAuthorId,
      type: 'COMMENT_ON_YOUR_DISCUSSION',
      title: `${name} comentó en tu discusión`,
      preview: previewText(args.body),
      discussionId: args.discussionId,
      discussionCommentId: args.commentId,
    });
  }

  async onMentionsInDiscussionComment(args: {
    body: string;
    commentAuthorId: string;
    discussionId: string;
    discussionTitle: string;
    commentId: string;
    discussionAuthorId: string;
  }) {
    const re = /@([a-zA-Z0-9_]+)/g;
    const seen = new Set<string>();
    const usernames: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(args.body)) !== null) {
      const u = m[1];
      if (seen.has(u)) continue;
      seen.add(u);
      usernames.push(u);
      if (usernames.length > 20) break;
    }
    if (usernames.length === 0) return;
    const users = await this.prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    const name = await this.actorUsername(args.commentAuthorId);
    for (const u of users) {
      if (u.id === args.commentAuthorId) continue;
      if (u.id === args.discussionAuthorId) continue;
      await this.create({
        userId: u.id,
        actorId: args.commentAuthorId,
        type: 'MENTION',
        title: `${name} te mencionó en un comentario`,
        preview: previewText(args.body),
        discussionId: args.discussionId,
        discussionCommentId: args.commentId,
        metadata: { discussionTitle: args.discussionTitle },
      });
    }
  }

  async onLikeOnDiscussion(discussionAuthorId: string, likerId: string, discussionId: string, title: string) {
    if (discussionAuthorId === likerId) return;
    const name = await this.actorUsername(likerId);
    await this.create({
      userId: discussionAuthorId,
      actorId: likerId,
      type: 'LIKE_ON_YOUR_DISCUSSION',
      title: `A ${name} le gustó tu discusión`,
      preview: title,
      discussionId,
    });
  }
}
