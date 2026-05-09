import { Module } from '@nestjs/common';
import { LibraryRecommendationsService } from './library-recommendations.service';
import { LibraryRecommendationsController } from './library-recommendations.controller';

@Module({
  controllers: [LibraryRecommendationsController],
  providers: [LibraryRecommendationsService],
})
export class LibraryRecommendationsModule {}