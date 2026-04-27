import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type Request } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChallengesService } from './challenges.service';
import { ChallengesListQueryDto } from './dto/challenges-list-query.dto';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';

type AuthRequest = Request & {
  user: { userId: string; email: string; username: string };
};

@ApiTags('Challenges')
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar retos' })
  @ApiOkResponse({ description: 'Página de retos' })
  list(@Query() query: ChallengesListQueryDto) {
    return this.challengesService.list(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiOperation({ summary: 'Crear un reto' })
  @ApiCreatedResponse({ description: 'Reto creado' })
  create(@Req() req: AuthRequest, @Body() dto: CreateChallengeDto) {
    return this.challengesService.create(req.user.userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un reto por id' })
  getOne(@Param('id') id: string) {
    return this.challengesService.getById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar reto (solo creador)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateChallengeDto) {
    return this.challengesService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar reto (solo creador)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.challengesService.remove(id, req.user.userId);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inscribirse (modo SOLO)' })
  @ApiUnauthorizedResponse()
  joinSolo(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.challengesService.joinSolo(id, req.user.userId);
  }

  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desinscribirse (modo SOLO)' })
  @ApiUnauthorizedResponse()
  leaveSolo(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.challengesService.leaveSolo(id, req.user.userId);
  }

  @Post(':id/teams')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear equipo (modo TEAMS); te añade como primer miembro' })
  @ApiUnauthorizedResponse()
  createTeam(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: CreateTeamDto) {
    return this.challengesService.createTeam(id, req.user.userId, dto);
  }

  @Post(':id/teams/:teamId/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unirse a un equipo (modo TEAMS)' })
  @ApiUnauthorizedResponse()
  joinTeam(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('teamId') teamId: string,
  ) {
    return this.challengesService.joinTeam(id, teamId, req.user.userId);
  }

  @Delete(':id/teams/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Salir del equipo (modo TEAMS). Si el equipo queda vacío, se elimina' })
  @ApiUnauthorizedResponse()
  leaveTeam(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.challengesService.leaveTeam(id, req.user.userId);
  }
}
