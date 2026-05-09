import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryLibraryRecommendationsDto {
  @IsIn(['npm', 'maven', 'nuget', 'cargo'])
  @IsOptional()
  ecosystem?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsIn(['newest', 'votes'])
  @IsOptional()
  sort?: 'newest' | 'votes';

  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}