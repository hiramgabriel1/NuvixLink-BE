import { IsIn, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class CreateLibraryRecommendationDto {
  @IsIn(['npm', 'maven', 'nuget', 'cargo'])
  ecosystem: string;

  @IsString()
  @MaxLength(120)
  packageName: string;

  @IsUrl()
  packageUrl: string;

  @IsString()
  installCommand: string;

  @IsString()
  @MaxLength(260)
  description: string;

  @IsString()
  @MaxLength(220)
  useCase: string;

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

  authorId: string; // This will be set from the authenticated user
}