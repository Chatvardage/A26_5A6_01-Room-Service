import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: 'general' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'nom ne peut pas contenir uniquement des espaces' })
  @MaxLength(80)
  nom!: string;

  @ApiPropertyOptional({ enum: ['public', 'prive'], default: 'public' })
  @IsOptional()
  @IsIn(['public', 'prive'])
  visibilite?: 'public' | 'prive';
}
