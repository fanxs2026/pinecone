import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';

export class SubmitFeedbackDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string; // SUPPORT_REQUEST / BUG / FEATURE_REQUEST / ...

  @IsOptional()
  @IsEmail()
  voterEmail?: string; // feedbackPortalRequireEmail 时必填（服务端强制）

  @IsOptional()
  @IsString()
  voterName?: string;

  // 2026-08-15：算术验证码（防刷）
  @IsString()
  captchaId!: string;

  @IsString()
  captchaAnswer!: string;
}
