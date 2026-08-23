import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service';

/**
 * 事件总线（outbox）——全局模块。
 *
 * Webhook 交付（Phase 1）/ 审计日志（Phase 2）/ 通知扩展（Phase 3）
 * 三方共用的持久化事件流。业务 Service 在事务内 publish()，
 * 后台 consumer 通过 processPending() 拉取 PENDING 事件投递。
 */
@Global()
@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
