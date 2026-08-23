import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

// 2026-08-16 G1-P1/P2 报表：透视表 DTO（白名单校验，service 内再做维度二次校验）

export class PivotReportDto {
  @IsIn(['STORY', 'SUPPORT', 'IDEA'])
  entity!: 'STORY' | 'SUPPORT' | 'IDEA';

  @IsString()
  rowField!: string;

  @IsString()
  colField!: string;
}

export class QualityReportQuery {
  @IsOptional()
  @IsUUID()
  releaseId?: string;
}
