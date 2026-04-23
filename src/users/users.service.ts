import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TrendingBuildersBy, TrendingBuildersQueryDto } from './dto/trending-builders-query.dto';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Prefijo bajo el bucket (`S3_USERS_FOLDER`; por defecto `profile-media/`). */
function s3ProfileMediaKeyPrefix(): string {
  const raw = process.env.S3_USERS_FOLDER?.trim().replace(/^\//, '');
  if (!raw) {
    return 'profile-media/';
  }
  return raw.endsWith('/') ? raw : `${raw}/`;
}

type TrendingBuilder = {
  id: string;
  username: string;
  photoKey: string | null;
  position: string | null;
  description: string | null;
  followersCount: number;
  likesReceivedCount: number;
  score: number;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        photoKey: true,
        position: true,
        description: true,
        techStack: true,
        socialLinks: true,
        websiteUrl: true,
        isVerified: true,
        createdAt: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async getMyProfileWithBookmarks(userId: string) {
    const profile = await this.getMyProfile(userId);

    const bookmarks = await this.prisma.bookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        createdAt: true,
        post: {
          include: {
            author: {
              select: { id: true, username: true, photoKey: true },
            },
            _count: {
              select: { likes: true, bookmarks: true },
            },
          },
        },
      },
    });

    return {
      ...profile,
      bookmarks,
    };
  }

  async getProfileByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        photoKey: true,
        position: true,
        description: true,
        techStack: true,
        socialLinks: true,
        websiteUrl: true,
        createdAt: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ) {
    const techList = dto.techStack ?? dto.techStacks;

    const hasText =
      dto.position !== undefined ||
      dto.description !== undefined ||
      dto.websiteUrl !== undefined ||
      techList !== undefined ||
      dto.socialLinks !== undefined ||
      dto.username !== undefined;

    if (!file && !hasText) {
      throw new BadRequestException('Nada que actualizar: envia al menos un campo o un archivo de foto');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, photoKey: true, username: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    if (dto.username !== undefined) {
      const next = dto.username.trim();
      if (next !== existing.username) {
        const taken = await this.prisma.user.findFirst({
          where: { username: next, NOT: { id: userId } },
          select: { id: true },
        });
        if (taken) {
          throw new ConflictException('Ese nombre de usuario ya está en uso');
        }
      }
    }

    let publicPhotoToStore: string | undefined;
    if (file) {
      if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
        throw new BadRequestException('Tipo de imagen no permitido (usa JPEG, PNG, GIF o WebP)');
      }
      const ext = this.extensionForImage(file.mimetype, file.originalname);
      const s3ObjectKey = `${s3ProfileMediaKeyPrefix()}${userId}/${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
      await this.s3.putObject({
        key: s3ObjectKey,
        body: file.buffer,
        contentType: file.mimetype,
        acl: S3Service.profilePhotoUploadAcl(),
      });
      publicPhotoToStore = S3Service.publicUrlForObjectKey(s3ObjectKey);
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.websiteUrl !== undefined) data.websiteUrl = dto.websiteUrl;
    if (techList !== undefined) data.techStack = { set: techList };
    if (dto.socialLinks !== undefined) data.socialLinks = dto.socialLinks as Prisma.InputJsonValue;
    if (dto.username !== undefined) data.username = dto.username.trim();
    if (publicPhotoToStore !== undefined) data.photoKey = publicPhotoToStore;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nada que actualizar: envia al menos un campo o un archivo de foto');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    if (file && publicPhotoToStore) {
      const toDelete = S3Service.objectKeyFromStoredUserPhoto(existing.photoKey);
      if (toDelete) {
        void this.s3.deleteObjectBestEffort({ key: toDelete });
      }
    }

    return this.getMyProfileWithBookmarks(userId);
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

  async getTrendingBuilders(query: TrendingBuildersQueryDto) {
    const by = query.by ?? TrendingBuildersBy.COMBINED;
    const limit = query.limit ?? 10;

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        photoKey: true,
        position: true,
        description: true,
        _count: {
          select: {
            followers: true,
          },
        },
      },
    });

    const postLikes = await this.prisma.post.findMany({
      where: { isDraft: false },
      select: {
        authorId: true,
        _count: {
          select: {
            likes: true,
          },
        },
      },
    });

    const likesByAuthor = postLikes.reduce<Record<string, number>>((acc, post) => {
      acc[post.authorId] = (acc[post.authorId] ?? 0) + post._count.likes;
      return acc;
    }, {});

    const builders: TrendingBuilder[] = users.map((user) => {
      const followersCount = user._count.followers;
      const likesReceivedCount = likesByAuthor[user.id] ?? 0;
      const score =
        by === TrendingBuildersBy.FOLLOWERS
          ? followersCount
          : by === TrendingBuildersBy.LIKES
            ? likesReceivedCount
            : followersCount + likesReceivedCount;

      return {
        id: user.id,
        username: user.username,
        photoKey: user.photoKey,
        position: user.position,
        description: user.description,
        followersCount,
        likesReceivedCount,
        score,
      };
    });

    const trending = builders
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.followersCount !== a.followersCount) return b.followersCount - a.followersCount;
        return b.likesReceivedCount - a.likesReceivedCount;
      })
      .slice(0, limit);

    return {
      by,
      limit,
      totalCandidates: builders.length,
      items: trending,
    };
  }
}

