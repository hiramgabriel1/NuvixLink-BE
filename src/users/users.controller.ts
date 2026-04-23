import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TrendingBuildersBy, TrendingBuildersQueryDto } from './dto/trending-builders-query.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get trending builders by followers and/or post likes' })
  @ApiQuery({
    name: 'by',
    required: false,
    enum: TrendingBuildersBy,
    description: 'Ranking strategy: combined, followers, or likes',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of users returned (1-100)',
  })
  @ApiOkResponse({
    description: 'Trending builders computed successfully',
    schema: {
      example: {
        by: 'combined',
        limit: 10,
        totalCandidates: 24,
        items: [
          {
            id: 'clx...',
            username: 'hiramdev',
            photoKey: 'users/clx/profile.png',
            position: 'Backend Engineer',
            description: 'Building APIs',
            followersCount: 120,
            likesReceivedCount: 430,
            score: 550,
          },
        ],
      },
    },
  })
  @Get('trending-builders')
  getTrendingBuilders(@Query() query: TrendingBuildersQueryDto) {
    return this.usersService.getTrendingBuilders(query);
  }
}

