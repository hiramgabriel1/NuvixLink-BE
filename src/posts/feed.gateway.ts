import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { getCorsOrigins } from '../cors-origins';

/**
 * Eventos: `post:created`, `comment:created`, `comment:updated`, `comment:deleted`.
 * Cliente: `io(url, { withCredentials: true })` y `socket.on('...', …)`.
 */
@WebSocketGateway({
  cors: { origin: getCorsOrigins(), credentials: true },
  transports: ['websocket', 'polling'],
})
export class FeedGateway {
  private readonly logger = new Logger(FeedGateway.name);

  @WebSocketServer()
  server!: Server;

  private emitIfReady(event: string, payload: unknown) {
    if (!this.server) {
      this.logger.warn(`WebSocket server not ready, skip ${event}`);
      return;
    }
    this.server.emit(event, payload);
  }

  /** Solo posts publicados (no borradores), tras persistir. */
  emitPostCreated(post: unknown) {
    this.emitIfReady('post:created', post);
  }

  /**
   * `comment` misma forma que un ítem de `GET /posts/:postId/comments` → `items[]`.
   * `commentsCount`: total en el post tras crear (para badges).
   */
  emitCommentCreated(payload: { postId: string; comment: unknown; commentsCount: number }) {
    this.emitIfReady('comment:created', payload);
  }

  emitCommentUpdated(payload: { postId: string; comment: unknown }) {
    this.emitIfReady('comment:updated', payload);
  }

  /** Tras borrar; `commentsCount` es el total que queda en el post. */
  emitCommentDeleted(payload: { postId: string; commentId: string; commentsCount: number }) {
    this.emitIfReady('comment:deleted', payload);
  }
}
