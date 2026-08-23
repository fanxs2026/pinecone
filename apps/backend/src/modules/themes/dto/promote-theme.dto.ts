import { IsIn, IsOptional, IsString } from 'class-validator';

export class PromoteThemeDto {
  @IsIn(['FEATURE', 'IDEA'])
  targetType!: 'FEATURE' | 'IDEA';

  @IsOptional()
  @IsString()
  releaseId?: string;
}
