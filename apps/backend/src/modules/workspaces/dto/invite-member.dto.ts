import { IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

enum InviteRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export class InviteMemberDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: InviteRole, default: InviteRole.MEMBER })
  @IsEnum(InviteRole)
  role: InviteRole = InviteRole.MEMBER as any;
}
