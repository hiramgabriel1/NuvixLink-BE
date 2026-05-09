import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibraryRecommendationsService } from './library-recommendations.service';
import { CreateLibraryRecommendationDto } from './dto/create-library-recommendation.dto';
import { QueryLibraryRecommendationsDto } from './dto/query-library-recommendations.dto';
import { VoteLibraryRecommendationDto } from './dto/vote-library-recommendation.dto';
import { ReportLibraryRecommendationDto } from './dto/report-library-recommendation.dto';

interface AuthRequest {
  user?: {
    userId: string;
    email: string;
    username: string;
  };
}

@Controller('library-recommendations')
export class LibraryRecommendationsController {
  constructor(private readonly libraryRecommendationsService: LibraryRecommendationsService) {}

  @Get()
  async findAll(@Query() query: QueryLibraryRecommendationsDto) {
    return this.libraryRecommendationsService.findAll(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: AuthRequest, @Body() createDto: CreateLibraryRecommendationDto) {
    const authorId = req.user?.userId;
    if (!authorId) {
      throw new Error('User not authenticated');
    }
    return this.libraryRecommendationsService.create({ ...createDto, authorId });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Request() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return this.libraryRecommendationsService.remove(id, userId);
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  async vote(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() voteDto: VoteLibraryRecommendationDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return this.libraryRecommendationsService.vote(id, { ...voteDto, userId });
  }

  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  async report(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() reportDto: ReportLibraryRecommendationDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return this.libraryRecommendationsService.report(id, { ...reportDto, userId });
  }
}
