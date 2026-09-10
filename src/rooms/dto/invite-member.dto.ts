import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'user-2' })
  @IsString()
  @IsNotEmpty()
  utilisateurId!: string;
}
