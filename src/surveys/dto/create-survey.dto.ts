import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSurveyDto {
  @ApiProperty({ maxLength: 500, example: '¿Cuál es tu framework favorito?' })
  @IsString()
  @MaxLength(500)
  @MinLength(1)
  questionSurvey!: string;

  @ApiProperty({ type: [String], example: ['React', 'Angular', 'Vue', 'Svelte'], minItems: 2, maxItems: 10 })
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  options!: string[];
}
