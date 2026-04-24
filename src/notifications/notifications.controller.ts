import { Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsListQueryDto } from './dto/notifications-list-query.dto';
import { NotificationsService } from './notifications.service';

type AuthRequest = Request & {
  user: {
    userId: string;
    email: string;
    username: string;
  };
};

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @ApiOperation({ summary: 'Listar notificaciones del usuario (más recientes primero)' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse({ description: 'data, total, unreadCount, limit, offset' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @Get()
  list(@Req() req: AuthRequest, @Query() q: NotificationsListQueryDto) {
    return this.notifications.list(
      req.user.userId,
      q.unreadOnly ?? false,
      q.limit ?? 20,
      q.offset ?? 0,
    );
  }

  @ApiOperation({ summary: 'Contador de no leídas (badge)' })
  @ApiOkResponse({ description: '{ unreadCount: number }' })
  @Get('unread-count')
  unreadCount(@Req() req: AuthRequest) {
    return this.notifications.getUnreadCount(req.user.userId);
  }

  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  @ApiNotFoundResponse()
  @Patch(':id/read')
  markRead(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.notifications.markAsRead(req.user.userId, id);
  }

  @ApiOperation({ summary: 'Marcar todas como leídas' })
  @Post('read-all')
  markAllRead(@Req() req: AuthRequest) {
    return this.notifications.markAllAsRead(req.user.userId);
  }
}
