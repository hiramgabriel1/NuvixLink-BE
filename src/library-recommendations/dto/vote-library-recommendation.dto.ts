import { IsIn } from 'class-validator';

export class VoteLibraryRecommendationDto {
  @IsIn([1, -1])
  value!: 1 | -1;

  userId!: string; // This will be set from the authenticated user
}