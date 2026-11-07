import { Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

/**
 * 工作区自定义属性。
 *
 * 服务导出给 Ideas / Features / Stories / Supports 四个模块使用，
 * 保证「按定义校验值」的口径只有一处。
 */
@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
