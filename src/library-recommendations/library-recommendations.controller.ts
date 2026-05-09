import { Body, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibraryRecommendationsService } from './library-recommendations.service';
import { CreateLibraryRecommendationDto } from './dto/create-library-recommendation.dto';
import { QueryLibraryRecommendationsDto } from './dto/query-library-recommendations.dto';
import { VoteLibraryRecommendationDto } from './dto/vote-library-recommendation.dto';
import { ReportLibraryRecommendationDto } from './dto/report-library-recommendation.dto';

@Controller('library-recommendations')
export class LibraryRecommendationsController {
  constructor(private readonly libraryRecommendationsService: LibraryRecommendationsService) {}

  @Get()
  async findAll(@Query() query: QueryLibraryRecommendationsDto) {
    return this.libraryRecommendationsService.findAll(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createDto: CreateLibraryRecommendationDto) {
    return this.libraryRecommendationsService.create(createDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    return this.libraryRecommendationsService.remove(id);
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  async vote(@Param('id') id: string, @Body() voteDto: VoteLibraryRecommendationDto) {
    return this.libraryRecommendationsService.vote(id, voteDto);
  }

  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  async report(@Param('id') id: string, @Body() reportDto: ReportLibraryRecommendationDto) {
    return this.libraryRecommendationsService.report(id, reportDto);
  }
}