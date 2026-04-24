import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { PostLikesQueryDto } from './dto/post-likes-query.dto';
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

  @ApiOperation({ summary: 'List published posts' })
  @ApiOkResponse({ description: 'Posts retrieved successfully' })
  @Get()
  findAll() {
    return this.postsService.findAll();
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

  @ApiOperation({ summary: 'List users who liked a post' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiOkResponse({ description: 'Paginated like list with user summaries' })
  @Get(':postId/likes')
  getLikesForPost(@Param('postId') postId: string, @Query() query: PostLikesQueryDto) {
    return this.postsService.getLikesForPost(postId, query);
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

  @ApiOperation({ summary: 'Get a post by id' })
  @ApiOkResponse({ description: 'Post retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }
}

