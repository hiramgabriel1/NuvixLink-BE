import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';

export enum PostsListFilter {
  ALL = 'all',
  FOLLOWING = 'following',
}

export class PostsListQueryDto {
  @ApiPropertyOptional({
    enum: PostsListFilter,
    default: PostsListFilter.ALL,
    description:
      '`all`: todo el feed. `following`: solo posts de usuarios que **tú** sigues (requiere Bearer).',
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return PostsListFilter.ALL;
    }
    return value;
  })
  @IsEnum(PostsListFilter)
  filter!: PostsListFilter;
}
