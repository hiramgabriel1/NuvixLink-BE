import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { type Express, Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateDraftPostDto } from './dto/create-draft-post.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { DraftPostsListQueryDto } from './dto/draft-posts-list-query.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { UpdateDraftPostDto } from './dto/update-draft-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostCommentsQueryDto } from './dto/post-comments-query.dto';
import { PostLikesQueryDto } from './dto/post-likes-query.dto';
import { PostsListQueryDto } from './dto/posts-list-query.dto';
import { PostsService } from './posts.service';

const MAX_POST_IMAGES = 20;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type AuthRequest = Request & {
  user: {
    userId: string;
    email: string;
    username: string;
  };
};

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @ApiOperation({
    summary: 'Create a new post',
    description:
      '**application/json** (campo `media` opcional: URLs o claves ya subidas) o **multipart/form-data** con el mismo cuerpo de texto y, opcionalmente, uno o varios archivos de imagen en el campo **`files`** (se suben a S3, prefijo `S3_POSTS_FOLDER`, por defecto `post-media/`; las URLs públicas se añaden a `media`).',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiBody({ type: CreatePostDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiCreatedResponse({ description: 'Post created successfully' })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', MAX_POST_IMAGES, {
      limits: { fileSize: MAX_IMAGE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
        if (!ok) {
          cb(
            new BadRequestException('Solo se permiten imágenes JPEG, PNG, GIF o WebP en el post'),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  @HttpPost()
  create(
    @Req() req: AuthRequest,
    @Body() dto: CreatePostDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.postsService.create(req.user.userId, dto, files);
  }

  @ApiOperation({
    summary: 'List published posts (paginado)',
    description:
      '**`filter=all`** (por defecto): feed público. **`filter=following`**: solo quienes sigues; requiere `Authorization: Bearer` (sin token → 401).\n\n' +
      '**Paginación:** `limit` (default 20, max 100), `offset` (0, 20, 40…). Respuesta: `{ data, limit, offset, filter }`. Si `data.length < limit`, no hay más páginas.\n\n' +
      '**Orden:** `createdAt` desc, desempate `id` desc (offset estable frente a empates; con posts nuevos concurrentes puede haber duplicados o saltos entre páginas — el front puede deduplicar por `id`, p. ej. con eventos `post:created`).',
  })
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'following'] })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiBearerAuth()
  @ApiOkResponse({
    description: 'Lista paginada en `data`; cada post incluye author, likesCount, bookmarksCount, commentsCount',
  })
  @ApiUnauthorizedResponse({
    description: 'Solo si usas filter=following sin token o con token inválido',
  })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(
    @Query() query: PostsListQueryDto,
    @Req() req: Request & { user?: AuthRequest['user'] },
  ) {
    return this.postsService.findAll(query, req.user?.userId);
  }

  @ApiOperation({ summary: 'List my bookmarked posts' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiOkResponse({ description: 'Bookmarks retrieved successfully' })
  @UseGuards(JwtAuthGuard)
  @Get('bookmarks/me')
  findMyBookmarks(@Req() req: AuthRequest) {
    return this.postsService.findMyBookmarks(req.user.userId);
  }

  @ApiOperation({
    summary: 'Listar mis borradores de post',
    description: 'Paginado por `limit` / `offset`. Orden: `updatedAt` desc.',
  })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiOkResponse({ description: 'Lista de filas `DraftPost`' })
  @UseGuards(JwtAuthGuard)
  @Get('drafts/me')
  listMyDrafts(@Req() req: AuthRequest, @Query() query: DraftPostsListQueryDto) {
    return this.postsService.listMyDrafts(req.user.userId, query);
  }

  @ApiOperation({
    summary: 'Crear borrador',
    description:
      'Igual que crear post: JSON o **multipart/form-data** con `files` opcionales. Todos los campos son opcionales.',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiBody({ type: CreateDraftPostDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiCreatedResponse({ description: 'Borrador creado' })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', MAX_POST_IMAGES, {
      limits: { fileSize: MAX_IMAGE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
        if (!ok) {
          cb(
            new BadRequestException('Solo se permiten imágenes JPEG, PNG, GIF o WebP en el post'),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  @HttpPost('drafts')
  createDraft(
    @Req() req: AuthRequest,
    @Body() dto: CreateDraftPostDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.postsService.createDraft(req.user.userId, dto, files);
  }

  @ApiOperation({ summary: 'Obtener un borrador (solo el autor)' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Borrador no encontrado' })
  @UseGuards(JwtAuthGuard)
  @Get('drafts/:draftId')
  getDraft(@Req() req: AuthRequest, @Param('draftId') draftId: string) {
    return this.postsService.getDraft(req.user.userId, draftId);
  }

  @ApiOperation({ summary: 'Actualizar borrador (solo el autor)' })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiBody({ type: UpdateDraftPostDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Borrador no encontrado' })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', MAX_POST_IMAGES, {
      limits: { fileSize: MAX_IMAGE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
        if (!ok) {
          cb(
            new BadRequestException('Solo se permiten imágenes JPEG, PNG, GIF o WebP en el post'),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  @Patch('drafts/:draftId')
  updateDraft(
    @Req() req: AuthRequest,
    @Param('draftId') draftId: string,
    @Body() dto: UpdateDraftPostDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.postsService.updateDraft(req.user.userId, draftId, dto, files);
  }

  @ApiOperation({ summary: 'Eliminar borrador (solo el autor)' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Borrador no encontrado' })
  @UseGuards(JwtAuthGuard)
  @Delete('drafts/:draftId')
  deleteDraft(@Req() req: AuthRequest, @Param('draftId') draftId: string) {
    return this.postsService.deleteDraft(req.user.userId, draftId);
  }

  @ApiOperation({
    summary: 'Publicar borrador',
    description:
      'Crea un `Post` publicado (`isDraft: false`), emite el evento de feed y elimina el borrador. Requiere `title` no vacío.',
  })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Borrador no encontrado' })
  @ApiOkResponse({ description: 'Post publicado (misma forma que crear post publicado)' })
  @UseGuards(JwtAuthGuard)
  @HttpPost('drafts/:draftId/publish')
  publishDraft(@Req() req: AuthRequest, @Param('draftId') draftId: string) {
    return this.postsService.publishDraft(req.user.userId, draftId);
  }

  @ApiOperation({ summary: 'List users who liked a post' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiOkResponse({ description: 'Paginated like list with user summaries' })
  @Get(':postId/likes')
  getLikesForPost(@Param('postId') postId: string, @Query() query: PostLikesQueryDto) {
    return this.postsService.getLikesForPost(postId, query);
  }

  @ApiOperation({
    summary: 'List comments on a post (published posts only)',
    description: 'Default **5** items per request; use `offset` (and optional `limit`) for more pages.',
  })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiOkResponse({ description: 'Comments page (oldest first)' })
  @Get(':postId/comments')
  getCommentsForPost(@Param('postId') postId: string, @Query() query: PostCommentsQueryDto) {
    return this.postsService.getCommentsForPost(postId, query);
  }

  @ApiOperation({ summary: 'Add a comment to a post' })
  @ApiBody({ type: CreateCommentDto })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post not found (or draft)' })
  @ApiCreatedResponse({ description: 'Comment created' })
  @UseGuards(JwtAuthGuard)
  @HttpPost(':postId/comments')
  createComment(
    @Req() req: AuthRequest,
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.postsService.createComment(req.user.userId, postId, dto);
  }

  @ApiOperation({ summary: 'Editar tu comentario' })
  @ApiBody({ type: UpdateCommentDto })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post o comentario no encontrado' })
  @ApiForbiddenResponse({ description: 'No eres el autor del comentario' })
  @ApiOkResponse({ description: 'Comentario actualizado' })
  @UseGuards(JwtAuthGuard)
  @Patch(':postId/comments/:commentId')
  updateComment(
    @Req() req: AuthRequest,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.postsService.updateComment(req.user.userId, postId, commentId, dto);
  }

  @ApiOperation({ summary: 'Eliminar tu comentario' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post o comentario no encontrado' })
  @ApiForbiddenResponse({ description: 'No eres el autor del comentario' })
  @ApiOkResponse({ description: 'Comentario eliminado' })
  @UseGuards(JwtAuthGuard)
  @Delete(':postId/comments/:commentId')
  deleteComment(
    @Req() req: AuthRequest,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.postsService.deleteComment(req.user.userId, postId, commentId);
  }

  @ApiOperation({ summary: 'Like a post' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post not found (or draft)' })
  @ApiOkResponse({
    description: 'Like applied',
    schema: { example: { liked: true, likesCount: 12 } },
  })
  @UseGuards(JwtAuthGuard)
  @HttpPost(':postId/like')
  likePost(@Req() req: AuthRequest, @Param('postId') postId: string) {
    return this.postsService.likePost(req.user.userId, postId);
  }

  @ApiOperation({ summary: 'Remove your like from a post' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiOkResponse({
    description: 'Like removed',
    schema: { example: { liked: false, likesCount: 11 } },
  })
  @UseGuards(JwtAuthGuard)
  @Delete(':postId/like')
  unlikePost(@Req() req: AuthRequest, @Param('postId') postId: string) {
    return this.postsService.unlikePost(req.user.userId, postId);
  }

  @ApiOperation({ summary: 'Save a post to my bookmarks' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiCreatedResponse({
    description: 'Post bookmarked successfully',
    schema: { example: { bookmarked: true } },
  })
  @UseGuards(JwtAuthGuard)
  @HttpPost(':postId/bookmark')
  bookmarkPost(@Req() req: AuthRequest, @Param('postId') postId: string) {
    return this.postsService.bookmarkPost(req.user.userId, postId);
  }

  @ApiOperation({ summary: 'Remove a post from my bookmarks' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiOkResponse({
    description: 'Bookmark removed successfully',
    schema: { example: { bookmarked: false } },
  })
  @UseGuards(JwtAuthGuard)
  @Delete(':postId/bookmark')
  removeBookmark(@Req() req: AuthRequest, @Param('postId') postId: string) {
    return this.postsService.removeBookmark(req.user.userId, postId);
  }

  @ApiOperation({
    summary: 'Editar post publicado (solo el autor)',
    description:
      'Actualización parcial. JSON o **multipart/form-data** con `files` opcional (se añaden a `media`). Si envías `media`, reemplaza la lista y se concatenan las subidas. Posts con `isDraft: true` no se editan aquí (404).',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiBody({ type: UpdatePostDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post no encontrado o es borrador en tabla Post' })
  @ApiForbiddenResponse({ description: 'No eres el autor del post' })
  @ApiOkResponse({ description: 'Post actualizado (misma forma que GET /posts/:id)' })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', MAX_POST_IMAGES, {
      limits: { fileSize: MAX_IMAGE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
        if (!ok) {
          cb(
            new BadRequestException('Solo se permiten imágenes JPEG, PNG, GIF o WebP en el post'),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  @Patch(':postId')
  updatePost(
    @Req() req: AuthRequest,
    @Param('postId') postId: string,
    @Body() dto: UpdatePostDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.postsService.updatePost(req.user.userId, postId, dto, files);
  }

  @ApiOperation({ summary: 'Delete a post (author only)' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiForbiddenResponse({ description: 'Authenticated user is not the post author' })
  @ApiOkResponse({
    description: 'Post deleted',
    schema: { example: { deleted: true, id: 'clh...' } },
  })
  @UseGuards(JwtAuthGuard)
  @Delete(':postId')
  deletePost(@Req() req: AuthRequest, @Param('postId') postId: string) {
    return this.postsService.deletePost(req.user.userId, postId);
  }

  @ApiOperation({ summary: 'Get a post by id' })
  @ApiOkResponse({ description: 'Post retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }
}

