import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * We allow either 'token' or 'captchaToken' to fix a 400 Bad Request 
 * missing-token validation error caused by frontend sending 'captchaToken'.
 */
export class VerifyTurnstileDto {
  @ApiPropertyOptional({
    description: 'Cloudflare Turnstile token generated on the client side',
    example: '0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  token?: string;

  @ApiPropertyOptional({
    description: 'Cloudflare Turnstile token, alternative field name',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  captchaToken?: string;

  @ApiPropertyOptional({
    description: 'Optional action name associated with the token',
  })
  @IsString()
  @IsOptional()
  action?: string;
}
