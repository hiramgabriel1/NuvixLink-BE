import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @ApiOperation({
    summary: 'Buscar usuarios, posts y discusiones (paginado, 5 resultados)',
    description:
      'Paginación por `offset` (0, 5, 10…). El `limit` es fijo a 5. `scope=all|users|posts|discussions`.',
  })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'scope', required: false, enum: ['all', 'users', 'posts', 'discussions'] })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiOkResponse({
    description: 'Página de resultados mezclados (cada item incluye `type`)',
  })
  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }
}

