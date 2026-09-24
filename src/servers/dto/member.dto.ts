import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'user-2' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  utilisateurId!: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['membre', 'moderateur'] })
  @IsIn(['membre', 'moderateur'])
  role!: 'membre' | 'moderateur';
}

export class DiscoverServersQueryDto {
  @ApiPropertyOptional({
    example: 'projet',
    description: 'Filtre sur le nom (contient, insensible à la casse).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(80)
  q?: string;
}
