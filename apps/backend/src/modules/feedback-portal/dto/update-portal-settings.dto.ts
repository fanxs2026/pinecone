import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdatePortalSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireEmail?: boolean;

  @IsOptional()
  @IsIn(['SUPPORT', 'IDEA'])
  target?: 'SUPPORT' | 'IDEA';
}
