import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostLikesQueryDto } from './dto/post-likes-query.dto';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function s3PostMediaKeyPrefix(): string {
  const raw = process.env.S3_POSTS_FOLDER?.trim().replace(/^\//, '');
  if (!raw) {
    return 'post-media/';
  }
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/** Convierte `_count` de Prisma en campos explícitos por post (likes son por `postId` en la tabla `Like`). */
function postWithPublicCounts<T extends { _count: { likes: number; bookmarks: number } }>(post: T) {
  const { _count, ...rest } = post;
  return {
    ...rest,
    likesCount: _count.likes,
    bookmarksCount: _count.bookmarks,
  };
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
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
          acl: S3Service.profilePhotoUploadAcl(),
        });
        fromUploads.push(S3Service.publicUrlForObjectKey(s3ObjectKey));
      }
    }
    const media = [...(dto.media ?? []), ...fromUploads];
    return this.prisma.post
      .create({
        data: {
          authorId,
          title: dto.title,
          description: dto.description,
          media,
          website: dto.website,
          tags: dto.tags ?? [],
          isDraft: dto.isDraft ?? false,
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
            },
          },
        },
      })
      .then(postWithPublicCounts);
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

  findAll() {
    return this.prisma.post
      .findMany({
        where: { isDraft: false },
        orderBy: { createdAt: 'desc' },
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
            },
          },
        },
      })
      .then((rows) => rows.map(postWithPublicCounts));
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
          },
        },
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    return postWithPublicCounts(post);
  }
}
