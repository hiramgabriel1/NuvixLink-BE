import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({ example: 'spam' })
  @IsString()
  @MaxLength(50)
  typeReport!: string;

  @ApiProperty({ maxLength: 150, example: 'User is spamming my DMs' })
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({ maxLength: 3000, example: 'Details about what happened...' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/screenshot.png or photos/user/key.png' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  image?: string;

  @ApiPropertyOptional({ example: 'https://nuvix.dev/users/bad-actor' })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({ example: 'contact@nuvix.dev' })
  @IsOptional()
  @IsEmail()
  emailToContact?: string;
}
