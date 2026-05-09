import { IsIn, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class UpdateLibraryRecommendationDto {
  @IsIn(['npm', 'maven', 'nuget', 'cargo'])
  @IsOptional()
  ecosystem?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  packageName?: string;

  @IsUrl()
  @IsOptional()
  packageUrl?: string;

  @IsString()
  @IsOptional()
  installCommand?: string;

  @IsString()
  @MaxLength(260)
  @IsOptional()
  description?: string;

  @IsString()
  @MaxLength(220)
  @IsOptional()
  useCase?: string;

  @IsUrl()
  @IsOptional()
  docsUrl?: string;

  @IsUrl()
  @IsOptional()
  githubUrl?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  stars?: number;
}
