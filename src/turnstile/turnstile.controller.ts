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
  
    throw new BadRequestException({ 
      error: 'validation-failed',
      // Only return property and constraints to avoid leaking potentially sensitive info in the error response
      details: errors.map(e => ({ property: e.property, constraints: e.constraints }))
    });
  }

    return dto;
  }
}
