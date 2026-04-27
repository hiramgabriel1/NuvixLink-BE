import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChallengeMode } from '../../generated/prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChallengeDto {
  @ApiProperty({ example: '30 días de código' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ description: 'Fecha/hora límite para terminar el reto (ISO 8601)' })
  @IsDateString()
  endsAt!: string;

  @ApiProperty({ enum: ChallengeMode, description: 'SOLO = inscripción individual; TEAMS = equipos' })
  @IsEnum(ChallengeMode)
  mode!: ChallengeMode;

  @ApiPropertyOptional({ description: 'Si se omite o va vacío, el reto no tiene premio' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prizeDescription?: string;
}
