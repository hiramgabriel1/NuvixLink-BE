import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum SearchScope {
  ALL = 'all',
  USERS = 'users',
  POSTS = 'posts',
  DISCUSSIONS = 'discussions',
}

export class SearchQueryDto {
  @ApiPropertyOptional({
    description: 'Texto a buscar (username, título, descripción, tags).',
    example: 'hiram',
  })
  @IsString()
  q!: string;

  @ApiPropertyOptional({
    enum: SearchScope,
    default: SearchScope.ALL,
    description: 'Qué entidad buscar: `all`, `users`, `posts`, `discussions`.',
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return SearchScope.ALL;
    return value;
  })
  @IsEnum(SearchScope)
  scope!: SearchScope;

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    description: 'Offset para paginación (0, 5, 10…). `limit` es fijo a 5.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset?: number = 0;
}

