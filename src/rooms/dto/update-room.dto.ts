import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateRoomDto {
  @ApiPropertyOptional({ example: 'equipe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nom?: string;

  @ApiPropertyOptional({ enum: ['public', 'prive'] })
  @IsOptional()
  @IsIn(['public', 'prive'])
  visibilite?: 'public' | 'prive';
}
