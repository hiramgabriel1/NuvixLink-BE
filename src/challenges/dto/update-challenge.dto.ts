import { ApiPropertyOptional } from '@nestjs/swagger';
import { ChallengeMode } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateChallengeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ enum: ChallengeMode })
  @IsOptional()
  @IsEnum(ChallengeMode)
  mode?: ChallengeMode;

  @ApiPropertyOptional({ description: 'null explícito no soportado en JSON; envía string vacío para quitar premio' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prizeDescription?: string;
}
