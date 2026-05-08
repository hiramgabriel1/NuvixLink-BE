import { BadRequestException, Body, Controller, Logger, Post, Req } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Request } from 'express';
import { VerifyTurnstileDto } from './dto/verify-turnstile.dto';
import { TurnstileService, TurnstileVerifyResponse } from './turnstile.service';

@ApiTags('Turnstile')
@Controller('turnstile')
export class TurnstileController {
  private readonly logger = new Logger(TurnstileController.name);

  constructor(
    private readonly turnstileService: TurnstileService
  ) {}

  @ApiOperation({
    summary: 'Verify a Cloudflare Turnstile token',
    description:
      'Receives a client token and forwards it to Cloudflare using the backend secret. Returns Cloudflare response as-is.',
  })
  @ApiBody({ type: VerifyTurnstileDto })
  @ApiOkResponse({
    description: 'Cloudflare verification payload (proxied without changes).',
  })
  @ApiBadRequestResponse({
    description: 'Missing or invalid token.',
    schema: { example: { error: 'missing-token' } },
  })
  @ApiBadGatewayResponse({
    description: 'Upstream verification failed.',
    schema: { example: { error: 'turnstile-upstream' } },
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error.',
    schema: { example: { error: 'internal' } },
  })
  @Post('verify')
  async verify(@Body() body: unknown, @Req() req: Request): Promise<TurnstileVerifyResponse> {
    const dto = this.validateBody(body);
    const token = dto.token || dto.captchaToken;
    if (!token) {
      throw new BadRequestException({ error: 'missing-token' });
    }
    return this.turnstileService.verifyToken(token, req.ip);
  }

  private validateBody(body: unknown): VerifyTurnstileDto {
    const dto = plainToInstance(VerifyTurnstileDto, body);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

   if (errors.length > 0) {
    // LOGUEA EL ERROR REAL AQUÍ
    this.logger.error('Validation Failed:', JSON.stringify(errors, null, 2));
    
    // Opcional: devuelve el error detallado al cliente en DEV
    throw new BadRequestException({ 
      error: 'validation-failed', 
      details: errors.map(e => e.constraints) 
    });
  }

    return dto;
  }
}
