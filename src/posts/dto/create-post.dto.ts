import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

const emptyToUndef = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? undefined : value;

/** JSON array, o string JSON, o "a, b" (multipart / form). */
function transformStringList({ value }: { value: unknown }): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('[')) {
      try {
        const p: unknown = JSON.parse(t);
        if (Array.isArray(p)) {
          return p.map(String).map((s) => s.trim()).filter(Boolean);
        }
      } catch {
        return undefined;
      }
    }
    return t
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

export class CreatePostDto {
  @ApiProperty({ maxLength: 150, example: 'How I built my portfolio with NestJS' })
  @Transform(emptyToUndef)
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({
    maxLength: 3000,
    example: 'A short write-up about architecture decisions and deployment.',
  })
  @Transform(emptyToUndef)
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'En JSON, array de URLs o claves. En multipart, opcional; las subidas de archivo se añaden al final.',
  })
  @Transform(transformStringList)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media?: string[];

  @ApiPropertyOptional({ example: 'https://nuvix.dev' })
  @Transform(emptyToUndef)
  @IsOptional()
  @IsString()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ type: [String], example: ['nestjs', 'backend', 'typescript'] })
  @Transform(transformStringList)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: false })
  @Transform(transformIsDraft)
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;
}

