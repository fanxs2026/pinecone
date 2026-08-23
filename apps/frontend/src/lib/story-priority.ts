// Story 优先级（P1-P5，默认 P3）——通用定义见 entity-priority.ts，本文件仅为向后兼容导出
export {
  ENTITY_PRIORITIES as STORY_PRIORITIES,
  ENTITY_PRIORITY_LABELS as STORY_PRIORITY_LABELS,
  ENTITY_PRIORITY_COLORS as STORY_PRIORITY_COLORS,
  entityPriorityOption as storyPriorityOption,
  entityPriorityLabel as storyPriorityLabel,
} from './entity-priority';
export type { EntityPriority as StoryPriority } from './entity-priority';
