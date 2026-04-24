import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post as HttpPost,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateCommentDto } from '../posts/dto/create-comment.dto';
import { PostCommentsQueryDto } from '../posts/dto/post-comments-query.dto';
import { PostLikesQueryDto } from '../posts/dto/post-likes-query.dto';
import { UpdateCommentDto } from '../posts/dto/update-comment.dto';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { DiscussionsListQueryDto } from './dto/discussions-list-query.dto';
import { UpdateDiscussionDto } from './dto/update-discussion.dto';
import { DiscussionsService } from './discussions.service';

type AuthRequest = Request & {
  user: {
    userId: string;
    email: string;
    username: string;
  };
};

@ApiTags('Discussions')
@Controller('discussions')
export class DiscussionsController {
  constructor(private readonly discussionsService: DiscussionsService) {}

  @ApiOperation({
    summary: 'Crear una discusión (sin imágenes; título + descripción opcional + tags)',
  })
  @ApiBearerAuth()
  @ApiBody({ type: CreateDiscussionDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiCreatedResponse({ description: 'Discusión creada' })
  @UseGuards(JwtAuthGuard)
  @HttpPost()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthRequest, @Body() dto: CreateDiscussionDto) {
    return this.discussionsService.create(req.user.userId, dto);
  }

  @ApiOperation({
    summary: 'Listar discusiones publicadas (paginado)',
    description:
      '`filter=following` requiere Bearer. Respuesta `{ data, limit, offset, filter }`.',
  })
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'following'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Solo si filter=following sin token o con token inválido',
  })
  @ApiOkResponse({ description: 'Página de discusiones' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(
    @Query() query: DiscussionsListQueryDto,
    @Req() req: Request & { user?: AuthRequest['user'] },
  ) {
    return this.discussionsService.findAll(query, req.user?.userId);
  }

  @ApiOperation({ summary: 'Likes a una discusión' })
  @ApiNotFoundResponse({ description: 'Discusión no encontrada' })
  @Get(':discussionId/likes')
  getLikes(
    @Param('discussionId') discussionId: string,
    @Query() query: PostLikesQueryDto,
  ) {
    return this.discussionsService.getLikesForDiscussion(discussionId, query);
  }

  @ApiOperation({ summary: 'Comentarios de una discusión' })
  @ApiNotFoundResponse({ description: 'Discusión no encontrada' })
  @Get(':discussionId/comments')
  getComments(
    @Param('discussionId') discussionId: string,
    @Query() query: PostCommentsQueryDto,
  ) {
    return this.discussionsService.getCommentsForDiscussion(discussionId, query);
  }

  @ApiOperation({ summary: 'Añadir comentario' })
  @ApiBody({ type: CreateCommentDto })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Discusión no encontrada' })
  @UseGuards(JwtAuthGuard)
  @HttpPost(':discussionId/comments')
  createComment(
    @Req() req: AuthRequest,
    @Param('discussionId') discussionId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.discussionsService.createComment(req.user.userId, discussionId, dto);
  }

  @ApiOperation({ summary: 'Editar comentario (solo autor)' })
  @ApiBody({ type: UpdateCommentDto })
  @ApiBearerAuth()
  @ApiForbiddenResponse({ description: 'No eres el autor' })
  @UseGuards(JwtAuthGuard)
  @Patch(':discussionId/comments/:commentId')
  updateComment(
    @Req() req: AuthRequest,
    @Param('discussionId') discussionId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.discussionsService.updateComment(req.user.userId, discussionId, commentId, dto);
  }

  @ApiOperation({ summary: 'Borrar comentario (solo autor)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':discussionId/comments/:commentId')
  deleteComment(
    @Req() req: AuthRequest,
    @Param('discussionId') discussionId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.discussionsService.deleteComment(req.user.userId, discussionId, commentId);
  }

  @ApiOperation({ summary: 'Like' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpPost(':discussionId/like')
  like(
    @Req() req: AuthRequest,
    @Param('discussionId') discussionId: string,
  ) {
    return this.discussionsService.likeDiscussion(req.user.userId, discussionId);
  }

  @ApiOperation({ summary: 'Quitar like' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':discussionId/like')
  unlike(
    @Req() req: AuthRequest,
    @Param('discussionId') discussionId: string,
  ) {
    return this.discussionsService.unlikeDiscussion(req.user.userId, discussionId);
  }

  @ApiOperation({ summary: 'Editar discusión (solo autor)' })
  @ApiBody({ type: UpdateDiscussionDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDiscussionDto,
  ) {
    return this.discussionsService.updateDiscussion(req.user.userId, id, dto);
  }

  @ApiOperation({ summary: 'Eliminar discusión (solo autor)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.discussionsService.deleteDiscussion(req.user.userId, id);
  }

  @ApiOperation({ summary: 'Obtener discusión por id' })
  @ApiNotFoundResponse({ description: 'No encontrada' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.discussionsService.findOne(id);
  }
}
