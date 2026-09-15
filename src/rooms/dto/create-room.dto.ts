import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: 'general' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nom!: string;

  @ApiPropertyOptional({ enum: ['public', 'prive'], default: 'public' })
  @IsOptional()
  @IsIn(['public', 'prive'])
  visibilite?: 'public' | 'prive';
}
