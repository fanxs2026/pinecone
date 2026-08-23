import { IsIn, IsString, IsOptional, IsEmail } from 'class-validator';

export class PortalVoteDto {
  @IsIn(['IDEA', 'SUPPORT', 'FEATURE'])
  entityType!: 'IDEA' | 'SUPPORT' | 'FEATURE';

  @IsString()
  entityId!: string;

  @IsOptional()
  @IsEmail()
  voterEmail?: string;

  @IsOptional()
  @IsString()
  voterName?: string;

  // 2026-08-15：算术验证码（防刷）
  @IsString()
  captchaId!: string;

  @IsString()
  captchaAnswer!: string;
}
