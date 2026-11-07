import { Module } from '@nestjs/common';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

/** 列表保存视图：按实体类型保存筛选条件与列配置 */
@Module({
  controllers: [SavedViewsController],
  providers: [SavedViewsService],
  exports: [SavedViewsService],
})
export class SavedViewsModule {}
