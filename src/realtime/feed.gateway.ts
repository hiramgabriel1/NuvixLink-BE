import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { getCorsOrigins } from '../cors-origins';

type JwtUserPayload = { sub: string };

@WebSocketGateway({
  cors: { origin: getCorsOrigins(), credentials: true },
  transports: ['websocket', 'polling'],
})
export class FeedGateway implements OnGatewayConnection {
  private readonly logger = new Logger(FeedGateway.name);

  constructor(private readonly jwt: JwtService) {}

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth as { token?: string } | undefined)?.token ??
      (typeof client.handshake.headers?.authorization === 'string'
        ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
        : undefined);
    if (!token) {
      return;
    }
    try {
      const p = this.jwt.verify<JwtUserPayload>(token);
      if (p?.sub) {
        void client.join(`user:${p.sub}`);
        this.logger.debug(`Socket ${client.id} joined user:${p.sub}`);
      }
    } catch {
      // conexión sigue viva para escuchar eventos globales; sin sala de notificaciones
    }
  }

  private emitIfReady(event: string, payload: unknown) {
    if (!this.server) {
      this.logger.warn(`WebSocket server not ready, skip ${event}`);
      return;
    }
    this.server.emit(event, payload);
  }

  private emitToUser(userId: string, event: string, payload: unknown) {
    if (!this.server) {
      this.logger.warn(`WebSocket server not ready, skip ${event}`);
      return;
    }
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  // ——— Broadcast (feed) ———

  emitPostCreated(post: unknown) {
    this.emitIfReady('post:created', post);
  }

  emitPostUpdated(post: unknown) {
    this.emitIfReady('post:updated', post);
  }

  emitPostDeleted(payload: { postId: string }) {
    this.emitIfReady('post:deleted', payload);
  }

  emitCommentCreated(payload: { postId: string; comment: unknown; commentsCount: number }) {
    this.emitIfReady('comment:created', payload);
  }

  emitCommentUpdated(payload: { postId: string; comment: unknown }) {
    this.emitIfReady('comment:updated', payload);
  }

  emitCommentDeleted(payload: { postId: string; commentId: string; commentsCount: number }) {
    this.emitIfReady('comment:deleted', payload);
  }

  emitDiscussionCreated(discussion: unknown) {
    this.emitIfReady('discussion:created', discussion);
  }

  emitDiscussionCommentCreated(payload: {
    discussionId: string;
    comment: unknown;
    commentsCount: number;
  }) {
    this.emitIfReady('discussionComment:created', payload);
  }

  emitDiscussionCommentUpdated(payload: { discussionId: string; comment: unknown }) {
    this.emitIfReady('discussionComment:updated', payload);
  }

  emitDiscussionCommentDeleted(payload: {
    discussionId: string;
    commentId: string;
    commentsCount: number;
  }) {
    this.emitIfReady('discussionComment:deleted', payload);
  }


  emitNotificationCreated(userId: string, notification: unknown) {
    this.emitToUser(userId, 'notification:created', notification);
  }

  emitNotificationUpdated(userId: string, notification: unknown) {
    this.emitToUser(userId, 'notification:updated', notification);
  }

  emitNotificationsUnread(userId: string, unreadCount: number) {
    this.emitToUser(userId, 'notifications:unread', { unreadCount });
  }
}
