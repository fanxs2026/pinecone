import { IsEmail, IsString, IsOptional, IsInt, Min, Max, IsDateString, IsBoolean, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetUserActiveDto {
  @ApiProperty({ description: 'true=启用 / false=禁用' })
  @IsBoolean()
  active!: boolean;
}

export class AddWhitelistDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateInviteCodeDto {
  @ApiPropertyOptional({ description: '自定义邀请码（留空自动生成；限 4-32 位字母数字）' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,32}$/, { message: 'Invite code must be 4-32 alphanumeric characters' })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Note must be at most 200 characters' })
  note?: string;

  @ApiPropertyOptional({ default: 1, description: '最大使用次数' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000, { message: 'maxUses must be at most 1000' })
  maxUses?: number;

  @ApiPropertyOptional({ description: '过期时间 (ISO)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateInviteCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
