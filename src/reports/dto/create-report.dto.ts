import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? undefined : value;

export class CreateReportDto {
  @ApiPropertyOptional({
    example: 'ckx... (cuid)',
    description: 'ID de la publicación a reportar (alternativa a reportedUserId).',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  postId?: string;

  @ApiPropertyOptional({
    example: 'ckx... (cuid)',
    description: 'ID del usuario (perfil) a reportar (alternativa a postId).',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  reportedUserId?: string;

  @ApiProperty({ example: 'spam' })
  @IsString()
  @MaxLength(50)
  typeReport!: string;

  @ApiProperty({ maxLength: 150, example: 'User is spamming my DMs' })
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({ maxLength: 3000, example: 'Details about what happened...' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({
    example: 'reports/.../key.png o URL https://... (si no envias archivo por multipart)',
    description:
      'Clave o URL. Si subes un archivo en el campo "image" (multipart), se guarda en S3 bajo `S3_REPORTS_PREFIX` y este campo se ignora.',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(512)
  image?: string;

  @ApiPropertyOptional({ example: 'https://nuvix.dev/users/bad-actor' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\//i, { message: 'url debe comenzar con http:// o https://' })
  url?: string;

  @ApiPropertyOptional({ example: 'contact@nuvix.dev' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  emailToContact?: string;
}
