import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Muy buen aporte, gracias por compartirlo.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
