import { EventsService } from '../modules/events/events.service';

/**
 * 实体事件统一发布（P2 集成生态：Webhook 事件覆盖补全）。
 * 所有核心实体（Idea/Feature/Story/Support/Release）在创建与状态变更时
 * 调用本 helper 写入 outbox，供 Webhook 订阅（事件名 ENTITY.CREATED /
 * ENTITY.STATUS_CHANGED）。
 */

export interface EventEntityLike {
  id: string;
  code?: string | null;
  title: string;
}

/** 发布「实体创建」事件 */
export async function publishEntityCreated(
  events: EventsService,
  workspaceId: string,
  entityType: string,
  entity: EventEntityLike,
): Promise<void> {
  await events.publish({
    workspaceId,
    entityType,
    entityId: entity.id,
    action: 'CREATED',
    payload: { code: entity.code ?? null, title: entity.title },
  });
}

/** 发布「状态变更」事件（from → to） */
export async function publishStatusChanged(
  events: EventsService,
  workspaceId: string,
  entityType: string,
  entity: EventEntityLike,
  from: string,
  to: string,
): Promise<void> {
  await events.publish({
    workspaceId,
    entityType,
    entityId: entity.id,
    action: 'STATUS_CHANGED',
    payload: { code: entity.code ?? null, title: entity.title, from, to },
  });
}
