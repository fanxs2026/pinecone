import { IsString, IsOptional, IsIn, IsBoolean, IsObject, MinLength, MaxLength } from 'class-validator';

// G1-P1-③ 自定义仪表盘 / G1-P2-③ 定时订阅 DTO（2026-08-16）

export class UpsertDashboardDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class CreateSubscriptionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY'])
  schedule?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY'])
  schedule?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
