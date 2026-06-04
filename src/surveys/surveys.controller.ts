import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post as HttpPost,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AppError, ErrorCode } from '../common/errors';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { SurveysListQueryDto } from './dto/surveys-list-query.dto';
import { SurveysService } from './surveys.service';

type AuthRequest = Request & {
  user: {
    userId: string;
    email: string;
    username: string;
  };
};

@ApiTags('Surveys')
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @ApiOperation({ summary: 'Create a new survey' })
  @ApiBearerAuth()
  @ApiBody({ type: CreateSurveyDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiCreatedResponse({ description: 'Survey created successfully' })
  @UseGuards(JwtAuthGuard)
  @HttpPost()
  create(@Req() req: AuthRequest, @Body() dto: CreateSurveyDto) {
    if (!dto.options || dto.options.length < 2) {
      AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Survey must have at least 2 options');
    }
    return this.surveysService.create(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'List all surveys (paginated)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiOkResponse({ description: 'Paginated list of surveys with vote results' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@Query() query: SurveysListQueryDto) {
    return this.surveysService.findAll(query);
  }

  @ApiOperation({ summary: 'Get a survey by id' })
  @ApiOkResponse({ description: 'Survey retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Survey not found' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.surveysService.findOne(id);
  }

  @ApiOperation({ summary: 'Delete a survey (author only)' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Survey not found' })
  @ApiForbiddenResponse({ description: 'Authenticated user is not the survey author' })
  @ApiOkResponse({ description: 'Survey deleted' })
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.surveysService.delete(req.user.userId, id);
  }

  @ApiOperation({ summary: 'Vote on a survey' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Survey not found' })
  @ApiOkResponse({ description: 'Vote applied successfully' })
  @UseGuards(JwtAuthGuard)
  @HttpPost(':id/vote')
  vote(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { option: string }) {
    if (!body?.option) {
      AppError.badRequest(ErrorCode.VALIDATION_FAILED, 'Option is required');
    }
    return this.surveysService.vote(req.user.userId, id, body.option);
  }

  @ApiOperation({ summary: 'Remove your vote from a survey' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Vote not found' })
  @ApiOkResponse({ description: 'Vote removed successfully' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Delete(':id/vote')
  unvote(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.surveysService.unvote(req.user.userId, id);
  }
}
