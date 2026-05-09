import { IsString, MaxLength } from 'class-validator';

export class ReportLibraryRecommendationDto {
  @IsString()
  @MaxLength(500)
  reason!: string;

  userId!: string; // This will be set from the authenticated user
}