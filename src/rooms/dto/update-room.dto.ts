import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateRoomDto {
  @ApiPropertyOptional({ example: 'equipe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'nom ne peut pas contenir uniquement des espaces' })
  @MaxLength(80)
  nom?: string;

  @ApiPropertyOptional({ enum: ['public', 'prive'] })
  @IsOptional()
  @IsIn(['public', 'prive'])
  visibilite?: 'public' | 'prive';
}
