import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto';

/** Actualización parcial; no expone `isDraft` (los borradores van en `DraftPost`). */
export class UpdatePostDto extends PartialType(OmitType(CreatePostDto, ['isDraft'] as const)) {}
