import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum TrendingBuildersBy {
  COMBINED = 'combined',
  FOLLOWERS = 'followers',
  LIKES = 'likes',
}

export class TrendingBuildersQueryDto {
  @ApiPropertyOptional({
    enum: TrendingBuildersBy,
    default: TrendingBuildersBy.COMBINED,
    description: 'Ranking strategy',
  })
  @IsOptional()
  @IsEnum(TrendingBuildersBy)
  by?: TrendingBuildersBy = TrendingBuildersBy.COMBINED;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10,
    description: 'Number of users to return',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

