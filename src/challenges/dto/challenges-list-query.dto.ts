import { ApiPropertyOptional } from '@nestjs/swagger';
import { ChallengeMode } from '../../generated/prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ChallengesListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Cursor (id del último item de la página anterior)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: ChallengeMode })
  @IsOptional()
  @IsEnum(ChallengeMode)
  mode?: ChallengeMode;
}
