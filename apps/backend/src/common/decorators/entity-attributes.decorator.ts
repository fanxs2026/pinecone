import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, Matches } from 'class-validator';

/**
 * 四类实体（需求 / 功能 / 任务 / 支持请求）共用的属性字段装饰器。
 *
 * 集中在一处声明，避免四个 DTO 各写一份导致校验口径漂移——
 * 这类字段一旦漏掉某个 DTO，对应实体会因为全局 ValidationPipe 的
 * forbidNonWhitelisted 直接返回 400，表现是「这个实体写不进自定义属性」。
 */

/** 自定义属性值：key 为字段定义中的 key，未定义的 key 由服务端丢弃 */
export function CustomFieldsProperty() {
  return applyDecorators(
    ApiPropertyOptional({
      description: '自定义属性值，key 为字段定义中的 key；未定义的 key 会被服务端丢弃',
      type: Object,
    }),
    IsOptional(),
    IsObject(),
  );
}

/** 承诺完成日：只接受 YYYY-MM-DD，null 表示清空 */
export function DueDateProperty() {
  return applyDecorators(
    ApiPropertyOptional({
      description: '承诺完成日（YYYY-MM-DD），null 表示清空',
      example: '2026-11-30',
    }),
    IsOptional(),
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate 需为 YYYY-MM-DD' }),
  );
}
