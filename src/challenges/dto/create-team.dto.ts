import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @ApiPropertyOptional({ example: 'Los undefined' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
