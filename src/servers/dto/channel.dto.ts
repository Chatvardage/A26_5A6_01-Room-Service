import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const NIVEAUX = ['tous', 'moderateurs'] as const;

export class CreateChannelDto {
  @ApiProperty({ example: 'général' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nom!: string;

  @ApiPropertyOptional({
    enum: NIVEAUX,
    default: 'tous',
    description: 'Qui voit le salon.',
  })
  @IsOptional()
  @IsIn(NIVEAUX)
  acces?: (typeof NIVEAUX)[number];

  @ApiPropertyOptional({
    enum: NIVEAUX,
    default: 'tous',
    description: 'Qui peut écrire dans le salon (ex. #annonces : moderateurs).',
  })
  @IsOptional()
  @IsIn(NIVEAUX)
  ecriture?: (typeof NIVEAUX)[number];
}

export class UpdateChannelDto {
  @ApiPropertyOptional({ example: 'équipe' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nom?: string;

  @ApiPropertyOptional({ enum: NIVEAUX })
  @IsOptional()
  @IsIn(NIVEAUX)
  acces?: (typeof NIVEAUX)[number];

  @ApiPropertyOptional({ enum: NIVEAUX })
  @IsOptional()
  @IsIn(NIVEAUX)
  ecriture?: (typeof NIVEAUX)[number];

  @ApiPropertyOptional({ description: 'Ordre dans la liste des salons.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;
}
