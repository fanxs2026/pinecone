import { IsUUID, IsArray, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../generated/enums';

export class CreateTransitionDto {
  @ApiProperty()
  @IsUUID()
  fromStatusId!: string;

  @ApiProperty()
  @IsUUID()
  toStatusId!: string;

  @ApiProperty({ required: false, isArray: true, enum: UserRole, default: ['ADMIN', 'MEMBER'] })
  @IsArray()
  @IsEnum(UserRole, { each: true })
  @IsOptional()
  allowedRoles?: UserRole[];
}
