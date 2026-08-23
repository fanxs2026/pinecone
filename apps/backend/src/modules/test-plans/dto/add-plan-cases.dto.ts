import { IsUUID, IsOptional, IsArray, ArrayMaxSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 向计划添加用例：按用例 id 列表，或按 releaseId 批量拉入该发布周期全部用例 */
export class AddPlanCasesDto {
  @ApiPropertyOptional({ type: [String], description: '用例 id 列表（与 releaseId 二选一）' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  testCaseIds?: string[];

  @ApiPropertyOptional({ description: '批量拉入该发布周期的全部用例（与 testCaseIds 二选一）' })
  @IsOptional()
  @IsUUID()
  releaseId?: string;
}
