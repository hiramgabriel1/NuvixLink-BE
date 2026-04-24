import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum DiscussionsListFilter {
  ALL = 'all',
  FOLLOWING = 'following',
}

export class DiscussionsListQueryDto {
  @ApiPropertyOptional({
    enum: DiscussionsListFilter,
    default: DiscussionsListFilter.ALL,
    description:
      '`all` o `following` (requiere Bearer).',
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return DiscussionsListFilter.ALL;
    }
    return value;
  })
  @IsEnum(DiscussionsListFilter)
  filter!: DiscussionsListFilter;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
