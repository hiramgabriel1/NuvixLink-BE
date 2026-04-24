import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

function transformTags({ value }: { value: unknown }): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function transformIsDraft({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return undefined;
}

export class CreateDiscussionDto {
  @ApiProperty({ maxLength: 200, example: '¿Cómo estructuráis DTOs en NestJS?' })
  @IsString()
  @MaxLength(200)
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional({ maxLength: 8000, example: 'Contexto: APIs internas, equipo pequeño…' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['nestjs', 'tips'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(transformTags)
  tags?: string[];

  @ApiPropertyOptional({ default: false, description: 'Borrador: no entra al listado ni al socket' })
  @IsOptional()
  @IsBoolean()
  @Transform(transformIsDraft)
  isDraft?: boolean;
}
