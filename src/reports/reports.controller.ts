import {
  Body,
  Controller,
  Post as HttpPost,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Express } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppError, ErrorCode } from '../common/errors';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportsService } from './reports.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type AuthRequest = Request & {
  user: {
    userId: string;
    email: string;
    username: string;
  };
};

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @ApiOperation({
    summary: 'Reportar una publicación o un perfil',
    description:
      'Acepta **application/json** o **multipart/form-data**. Debes enviar **postId** (para reportar una publicación) o **reportedUserId** (para reportar un perfil). El campo `image` es opcional: puedes enviar una clave S3/URL (JSON) o subir un archivo en **`image`** (multipart; se sube a S3 y se persiste la clave). Si envías archivo, se ignora el `image` string del body.',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBearerAuth()
  @ApiBody({ type: CreateReportDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiCreatedResponse({ description: 'Report saved' })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_IMAGE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
        if (!ok) {
          cb(
            AppError.httpBadRequest(
              ErrorCode.REPORT_IMAGE_TYPE_INVALID,
              'Solo se permiten imágenes JPEG, PNG, GIF o WebP',
            ),
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
    @Body() dto: CreateReportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.reportsService.create(req.user.userId, dto, file);
  }
}
