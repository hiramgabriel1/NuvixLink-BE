import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../common/errors';
import { randomBytes } from 'crypto';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateReportDto } from './dto/create-report.dto';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Carpeta bajo el bucket, desde `S3_REPORTS_PREFIX` (ej. `reports/` o `mod/reports/`). */
function s3ReportsKeyPrefix(): string {
  const raw = process.env.S3_REPORTS_PREFIX?.trim();
  if (!raw) {
    return 'reports/';
  }
  return raw.endsWith('/') ? raw : `${raw}/`;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async create(reporterId: string, dto: CreateReportDto, file?: Express.Multer.File) {
    let imageKey: string | undefined = dto.image?.trim() || undefined;

    if (file) {
      if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
        AppError.badRequest(
          ErrorCode.REPORT_IMAGE_TYPE_INVALID,
          'Tipo de imagen no permitido (usa JPEG, PNG, GIF o WebP)',
        );
      }
      const ext = this.extensionForImage(file.mimetype, file.originalname);
      const objectKey = `${s3ReportsKeyPrefix()}${reporterId}/${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
      const { key } = await this.s3.putObject({
        key: objectKey,
        body: file.buffer,
        contentType: file.mimetype,
      });
      imageKey = key;
    }

    return this.prisma.report.create({
      data: {
        reporterId,
        typeReport: dto.typeReport,
        title: dto.title,
        description: dto.description,
        image: imageKey,
        url: dto.url,
        emailToContact: dto.emailToContact,
      },
    });
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
}
