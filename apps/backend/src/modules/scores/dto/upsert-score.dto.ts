import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertScoreDto {
  @IsIn(['IDEA', 'SUPPORT', 'FEATURE'])
  entityType!: 'IDEA' | 'SUPPORT' | 'FEATURE';

  @IsString()
  entityId!: string;

  @IsOptional()
  @IsIn(['RICE', 'ICE', 'CUSTOM'])
  model?: string;

  /** 维度值，如 { reach: 100, impact: 3, confidence: 0.8, effort: 2 }；RICE 下 reach 缺省自动取票数 */
  @IsObject()
  dimensions!: Record<string, number>;
}
