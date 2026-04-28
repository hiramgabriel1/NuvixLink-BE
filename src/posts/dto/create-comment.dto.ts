import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Muy buen aporte, gracias por compartirlo.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  /** Si se envía, este comentario es respuesta a otro (mismo post o discusión). Debe existir y pertenecer al mismo recurso. */
  @ApiPropertyOptional({ example: 'clxxxxxxxxxxxxxxxxxxxxxxxx' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
