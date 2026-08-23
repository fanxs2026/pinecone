import apiClient from './api';
import type { AxiosRequestConfig } from 'axios';

// Paginated response from list endpoints
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}

// P3-7 修复：registration-admin 分页返回结构（page/pageSize 而非 skip/take）
export interface RegistrationPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Workspace
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  user: { id: string; email: string; name?: string };
}

export const workspaceApi = {
  list: (config?: AxiosRequestConfig) => apiClient.get<Workspace[]>('/workspaces', config),
  get: (id: string) => apiClient.get<Workspace>(`/workspaces/${id}`),
  create: (data: { name: string; slug: string; description?: string }) =>
    apiClient.post<Workspace>('/workspaces', data),
  update: (id: string, data: Partial<Workspace>) =>
    apiClient.patch<Workspace>(`/workspaces/${id}`, data),
  remove: (id: string) => apiClient.delete(`/workspaces/${id}`),
  members: (id: string) => apiClient.get<WorkspaceMember[]>(`/workspaces/${id}/members`),
  invite: (id: string, email: string, role: string) =>
    apiClient.post(`/workspaces/${id}/members`, { email, role }),
  updateRole: (id: string, userId: string, role: string) =>
    apiClient.patch(`/workspaces/${id}/members/${userId}/role`, { role }),
  removeMember: (id: string, userId: string) =>
    apiClient.delete(`/workspaces/${id}/members/${userId}`),
};

// Ideas
export interface Idea {
  id: string;
  workspaceId: string;
  code?: string;
  title: string;
  description?: string;
  category?: string;
  status: string;
  tags?: string[];
  assignee?: { id: string; email: string; name?: string };
  assigneeName?: string;
  assigneeId?: string | null;
  createdBy: { id: string; email: string; name?: string };
  createdAt: string;
  updatedAt: string;
  // P0 (2026-08-14)：票数/评分/主题（列表与详情聚合返回）
  voteCount?: number;
  score?: { model: string; weightedScore: number; dimensions: Record<string, number> } | null;
  themes?: { id: string; title: string }[];
}

export const ideaApi = {
  list: (wsId: string, params?: { status?: string; category?: string; search?: string; sortBy?: string; themeId?: string; minScore?: number }) =>
    apiClient.get<PaginatedResponse<Idea>>(`/workspaces/${wsId}/ideas`, { params }),
  get: (wsId: string, id: string) => apiClient.get<Idea>(`/workspaces/${wsId}/ideas/${id}`),
  create: (wsId: string, data: { title: string; description?: string; category?: string; status?: string; assigneeId?: string }) =>
    apiClient.post<Idea>(`/workspaces/${wsId}/ideas`, data),
  update: (wsId: string, id: string, data: Partial<Idea>) =>
    apiClient.patch<Idea>(`/workspaces/${wsId}/ideas/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/ideas/${id}`),
};

// Todo Items (per Idea)
export interface TodoItem {
  id: string;
  workspaceId: string;
  ideaId: string;
  title: string;
  description?: string | null;
  assigneeId: string;
  dueDate?: string | null;
  completedAt?: string | null;
  completedById?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; email: string; name?: string | null };
  createdBy?: { id: string; email: string; name?: string | null };
}

export const todoApi = {
  list: (wsId: string, ideaId: string) =>
    apiClient.get<TodoItem[]>(`/workspaces/${wsId}/ideas/${ideaId}/todos`),
  create: (wsId: string, ideaId: string, data: { title: string; description?: string; assigneeId: string; dueDate?: string }) =>
    apiClient.post<TodoItem>(`/workspaces/${wsId}/ideas/${ideaId}/todos`, data),
  update: (wsId: string, ideaId: string, todoId: string, data: { title?: string; description?: string; assigneeId?: string; dueDate?: string }) =>
    apiClient.patch<TodoItem>(`/workspaces/${wsId}/ideas/${ideaId}/todos/${todoId}`, data),
  setCompleted: (wsId: string, ideaId: string, todoId: string, completed: boolean) =>
    apiClient.patch<TodoItem>(`/workspaces/${wsId}/ideas/${ideaId}/todos/${todoId}/complete`, { completed }),
  remove: (wsId: string, ideaId: string, todoId: string) =>
    apiClient.delete(`/workspaces/${wsId}/ideas/${ideaId}/todos/${todoId}`),
};

// Registration Admin (whitelist + invite codes)
export interface InviteCode {
  id: string;
  code: string;
  note?: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt?: string | null;
  active: boolean;
  createdAt: string;
}

export interface WhitelistEntry {
  id: string;
  email: string;
  note?: string | null;
  createdAt: string;
}

export const registrationAdminApi = {
  mode: () => apiClient.get<{ mode: string }>('/registration-admin/mode'),
  listWhitelist: (params?: { page?: number; pageSize?: number; search?: string }) =>
    apiClient.get<RegistrationPage<WhitelistEntry>>('/registration-admin/whitelist', { params }),
  addWhitelist: (email: string, note?: string) =>
    apiClient.post('/registration-admin/whitelist', { email, note }),
  removeWhitelist: (id: string) => apiClient.delete(`/registration-admin/whitelist/${id}`),
  listInviteCodes: (params?: { page?: number; pageSize?: number; search?: string }) =>
    apiClient.get<RegistrationPage<InviteCode>>('/registration-admin/invite-codes', { params }),
  createInviteCode: (data: { code?: string; note?: string; maxUses?: number; expiresAt?: string }) =>
    apiClient.post('/registration-admin/invite-codes', data),
  updateInviteCode: (id: string, data: { active?: boolean; maxUses?: number; expiresAt?: string }) =>
    apiClient.patch(`/registration-admin/invite-codes/${id}`, data),
  deleteInviteCode: (id: string) => apiClient.delete(`/registration-admin/invite-codes/${id}`),
  listUsers: (params?: { page?: number; pageSize?: number; search?: string }) =>
    apiClient.get<RegistrationPage<AdminUser>>('/registration-admin/users', { params }),
  setUserActive: (id: string, active: boolean) =>
    apiClient.patch(`/registration-admin/users/${id}/status`, { active }),
};

// Admin user (registration-admin)
export interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  active: boolean;
  createdAt: string;
  _count?: { workspaceMembers: number; createdIdeas: number };
}

// Releases
export interface Release {
  id: string;
  workspaceId: string;
  name: string;
  version?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  stageDate?: string;
  productionDate?: string;
  status: string;
  totalCapacity?: number | null;
  createdAt: string;
  _count?: { features: number };
}

export const releaseApi = {
  list: (wsId: string) =>
    apiClient.get<PaginatedResponse<Release>>(`/workspaces/${wsId}/releases`),
  get: (wsId: string, id: string) =>
    apiClient.get<Release>(`/workspaces/${wsId}/releases/${id}`),
  create: (wsId: string, data: { name: string; version?: string; description?: string; startDate?: string; endDate?: string; stageDate?: string; productionDate?: string; totalCapacity?: number; dependsOnId?: string }) =>
    apiClient.post<Release>(`/workspaces/${wsId}/releases`, data),
  update: (wsId: string, id: string, data: Partial<Release>) =>
    apiClient.patch<Release>(`/workspaces/${wsId}/releases/${id}`, data),
  updateStatus: (wsId: string, id: string, status: string) =>
    apiClient.patch<Release>(`/workspaces/${wsId}/releases/${id}/status`, { status }),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/releases/${id}`),
};

// I6 CI 门禁 + 流水线（2026-08-18 P1）
export interface CiBuildItem {
  id: string;
  name: string;
  status: 'SUCCESS' | 'FAILURE' | 'UNSTABLE' | 'ABORTED';
  branch: string | null;
  commit: string | null;
  url: string | null;
  releaseId: string | null;
  configName: string | null;
  testRunCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}
export interface CiGateStatus {
  blocked: boolean;
  gateEnabled: boolean;
  latest?: { status: string; name: string; url: string | null };
}
export const ciApi = {
  builds: (wsId: string, releaseId?: string) =>
    apiClient.get<CiBuildItem[]>(`/workspaces/${wsId}/ci/builds`, { params: { releaseId } }),
  gateStatus: (wsId: string, releaseId?: string) =>
    apiClient.get<CiGateStatus>(`/workspaces/${wsId}/ci/gate-status`, { params: { releaseId } }),
};

// I11 插件市场（2026-08-18 P2）
export interface MarketplacePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  tags: string[];
  kind: 'WEBHOOK' | 'REPORT' | 'IMPORT' | 'KB' | 'OTHER';
  installed: boolean;
  installedAt: string | null;
}
export const marketplaceApi = {
  list: (wsId: string) => apiClient.get<MarketplacePlugin[]>(`/workspaces/${wsId}/marketplace/plugins`),
  install: (wsId: string, pluginId: string) =>
    apiClient.post(`/workspaces/${wsId}/marketplace/plugins/${pluginId}/install`),
  uninstall: (wsId: string, pluginId: string) =>
    apiClient.delete(`/workspaces/${wsId}/marketplace/plugins/${pluginId}`),
};

// Features
export interface Feature {
  id: string;
  workspaceId: string;
  code?: string;
  releaseId?: string | null;
  parentFeatureId?: string | null;
  isEpic?: boolean;
  title: string;
  description?: string;
  priority: string;
  status: string;
  tags?: string[];
  sortOrder: number;
  assignee?: { id: string; email: string; name?: string };
  assigneeName?: string;
  assigneeId?: string | null;
  createdBy?: { id: string; email: string; name?: string };
  release?: { id: string; name: string; version?: string; status?: string };
  stories?: Story[];
  _count?: { stories: number };
  effortEstimate?: number;
  effortUnit?: string;
  createdAt: string;
  updatedAt: string;
  // P0 (2026-08-14)：票数/评分/主题
  voteCount?: number;
  score?: { model: string; weightedScore: number; dimensions: Record<string, number> } | null;
  themes?: { id: string; title: string }[];
}

export const featureApi = {
  list: (wsId: string, params?: { releaseId?: string; status?: string; assigneeId?: string; priority?: string; parentFeatureId?: string; isEpic?: boolean; pageSize?: number; sortBy?: string; themeId?: string; minScore?: number }) =>
    apiClient.get<PaginatedResponse<Feature>>(`/workspaces/${wsId}/features`, { params }),
  get: (wsId: string, id: string) =>
    apiClient.get<Feature>(`/workspaces/${wsId}/features/${id}`),
  create: (wsId: string, data: { title: string; description?: string; releaseId?: string; priority?: string; assigneeId?: string; parentFeatureId?: string; isEpic?: boolean }) =>
    apiClient.post<Feature>(`/workspaces/${wsId}/features`, data),
  update: (wsId: string, id: string, data: Partial<Feature>) =>
    apiClient.patch<Feature>(`/workspaces/${wsId}/features/${id}`, data),
  updateSort: (wsId: string, id: string, sortOrder: number) =>
    apiClient.patch(`/workspaces/${wsId}/features/${id}/sort`, { sortOrder }),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/features/${id}`),
};

// Stories
export interface Story {
  id: string;
  workspaceId: string;
  featureId: string;
  releaseId?: string | null;
  sprintId?: string | null;
  code?: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  storyPoints?: number;
  priority: string;
  status: string;
  kind?: string; // FEATURE | DEFECT | CHORE（2026-08-15：缺陷/技术债子类型）
  sortOrder: number;
  assignee?: { id: string; email: string; name?: string };
  assigneeId?: string | null;
  createdBy?: { id: string; email: string; name?: string };
  feature?: { id: string; title: string };
  release?: { id: string; name: string; version?: string; status: string };
  estimateHours?: number;
  loggedHours?: number; // 2026-08-14：实际已记录工时合计（列表接口聚合返回）
  createdAt: string;
  updatedAt: string;
  parentId?: string | null;
  subtaskCount?: number;
  doneCount?: number;
}

export const storyApi = {
  list: (wsId: string, params?: { featureId?: string; status?: string; assigneeId?: string; priority?: string; sprintId?: string; backlog?: boolean; parentId?: string; pageSize?: number }) =>
    apiClient.get<PaginatedResponse<Story>>(`/workspaces/${wsId}/stories`, { params }),
  get: (wsId: string, id: string) =>
    apiClient.get<Story>(`/workspaces/${wsId}/stories/${id}`),
  create: (wsId: string, data: { featureId: string; title: string; description?: string; acceptanceCriteria?: string; storyPoints?: number; priority?: string; assigneeId?: string; estimateHours?: number; releaseId?: string; teamId?: string; sprintId?: string; parentId?: string }) =>
    apiClient.post<Story>(`/workspaces/${wsId}/stories`, data),
  update: (wsId: string, id: string, data: Partial<Story>) =>
    apiClient.patch<Story>(`/workspaces/${wsId}/stories/${id}`, data),
  updateSort: (wsId: string, id: string, sortOrder: number) =>
    apiClient.patch(`/workspaces/${wsId}/stories/${id}/sort`, { sortOrder }),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/stories/${id}`),
};

// Time Entries
export interface TimeEntry {
  id: string;
  storyId: string;
  userId: string;
  description: string;
  hours: number | string; // Prisma Decimal serializes as string via JSON
  date: string;
  billable: boolean;
  user?: { id: string; email: string; name?: string };
  story?: { id: string; title: string; code?: string | null; parentId?: string | null };
  entity?: { type: string; label: string | null }; // 2026-08-14：无 story 的实体绑定工时（IDEA/FEATURE/SUPPORT）
}

export const timeEntryApi = {
  list: (wsId: string, params?: { storyId?: string; userId?: string; entityType?: string; entityId?: string; from?: string; to?: string }) =>
    apiClient.get<PaginatedResponse<TimeEntry>>(`/workspaces/${wsId}/time-entries`, { params }),
  create: (wsId: string, data: { storyId?: string; entityType?: string; entityId?: string; description: string; hours: number; date: string; billable?: boolean }) =>
    apiClient.post<TimeEntry>(`/workspaces/${wsId}/time-entries`, data),
  update: (wsId: string, id: string, data: Partial<TimeEntry>) =>
    apiClient.patch<TimeEntry>(`/workspaces/${wsId}/time-entries/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/time-entries/${id}`),
};

// Workflows
export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  entityType: 'IDEA' | 'FEATURE' | 'STORY';
  statuses: StoryStatus[];
}

export interface StoryStatus {
  id: string;
  name: string;
  color: string;
  type: string;
  sortOrder: number;
  wipLimit?: number | null;
  transitionsFrom?: StatusTransition[];
  transitionsTo?: StatusTransition[];
}

export interface StatusTransition {
  id: string;
  fromStatusId: string;
  toStatusId: string;
  fromStatus?: StoryStatus;
  toStatus?: StoryStatus;
  allowedRoles: string[];
}

// Comments
export interface Comment {
  id: string;
  workspaceId: string;
  entityType: 'IDEA' | 'FEATURE' | 'STORY' | 'SUPPORT';
  entityId: string;
  content: string;
  userId: string;
  user: { id: string; email: string; name?: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommentPayload {
  entityType: string;
  entityId: string;
  content: string;
}

export const commentApi = {
  list: (wsId: string, entityType: string, entityId: string) =>
    apiClient.get<PaginatedResponse<Comment>>(`/workspaces/${wsId}/comments`, { params: { entityType, entityId } }),
  create: (wsId: string, data: CreateCommentPayload) =>
    apiClient.post<Comment>(`/workspaces/${wsId}/comments`, data),
  update: (wsId: string, id: string, content: string) =>
    apiClient.patch<Comment>(`/workspaces/${wsId}/comments/${id}`, { content }),
  remove: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/comments/${id}`),
};

// Notifications（P0-①：@提及 / 指派通知）
export interface AppNotification {
  id: string;
  workspaceId: string;
  userId: string;
  actor: { id: string; email: string; name?: string | null } | null;
  type: 'MENTION' | 'ASSIGNED' | 'STATUS_CHANGED';
  entityType: string;
  entityId: string;
  entityTitle?: string | null;
  snippet?: string | null;
  read: boolean;
  createdAt: string;
}
export const notificationsApi = {
  list: (wsId: string, params?: { page?: number; pageSize?: number }) =>
    apiClient.get<PaginatedResponse<AppNotification>>(`/workspaces/${wsId}/notifications`, { params }),
  count: (wsId: string) => apiClient.get<{ count: number }>(`/workspaces/${wsId}/notifications/count`),
  markRead: (wsId: string, id: string) =>
    apiClient.patch<AppNotification>(`/workspaces/${wsId}/notifications/${id}/read`),
  markAllRead: (wsId: string) => apiClient.post<{ ok: boolean }>(`/workspaces/${wsId}/notifications/read-all`),
};

// History
export interface HistoryEntry {
  id: string;
  workspaceId: string;
  userId: string | null;
  user: { id: string; email: string; name?: string } | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata: any;
  createdAt: string;
}

export const historyApi = {
  list: (wsId: string, entityType: string, entityId: string) =>
    apiClient.get<PaginatedResponse<HistoryEntry>>(`/workspaces/${wsId}/history`, { params: { entityType, entityId } }),
};

// Relations
export interface RelatedEntity {
  id: string;
  relationType: string;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedTitle: string;
  relatedCode?: string | null;
  direction: 'source' | 'target';
}

// Support
export interface Support {
  id: string;
  workspaceId: string;
  code?: string;
  title: string;
  description?: string;
  status: string;
  type: string;
  severity?: string | null; // 缺陷严重度（type=DEFECT 时有效）
  rootCause?: string | null; // 缺陷根因（选填）
  discoveryPhase?: string | null; // 缺陷发现阶段 TEST|PRODUCTION|CUSTOMER（type=DEFECT 时有效，G1-P1）
  releaseId?: string | null;
  tags?: string[];
  assignee?: { id: string; email: string; name?: string };
  assigneeName?: string;
  assigneeId?: string | null;
  createdBy: { id: string; email: string; name?: string };
  createdAt: string;
  updatedAt: string;
  // P0 (2026-08-14)：票数/评分/主题
  voteCount?: number;
  score?: { model: string; weightedScore: number; dimensions: Record<string, number> } | null;
  themes?: { id: string; title: string }[];
}

export const supportApi = {
  list: (wsId: string, params?: { status?: string; search?: string; sortBy?: string; themeId?: string; minScore?: number }) =>
    apiClient.get<PaginatedResponse<Support>>(`/workspaces/${wsId}/supports`, { params }),
  get: (wsId: string, id: string) =>
    apiClient.get<Support>(`/workspaces/${wsId}/supports/${id}`),
  create: (wsId: string, data: { title: string; description?: string; status?: string; type?: string; assigneeId?: string; releaseId?: string }) =>
    apiClient.post<Support>(`/workspaces/${wsId}/supports`, data),
  update: (wsId: string, id: string, data: Partial<Support>) =>
    apiClient.patch<Support>(`/workspaces/${wsId}/supports/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/supports/${id}`),
};

// Test Cases (Phase 1: 轻量测试闭环)
export interface TestRun {
  id: string;
  testCaseId: string;
  releaseId?: string | null;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'UNTESTED';
  actualResult?: string;
  supportId?: string | null;
  executedBy?: { id: string; email: string; name?: string };
  executedAt?: string;
  createdAt: string;
  support?: { id: string; code?: string; title: string; status: string };
  release?: { id: string; name: string; version?: string };
}

export interface TestCase {
  id: string;
  workspaceId: string;
  code?: string;
  title: string;
  description?: string;
  type: string;
  steps?: { order?: number; action?: string; expected?: string }[];
  expectedResult?: string;
  priority: string;
  status: string;
  storyId?: string | null;
  releaseId?: string | null;
  createdBy?: { id: string; email: string; name?: string };
  story?: { id: string; title: string; code?: string };
  release?: { id: string; name: string; version?: string };
  testRuns?: TestRun[];
  _count?: { testRuns: number };
  createdAt: string;
  updatedAt: string;
}

export const testCaseApi = {
  list: (wsId: string, params?: { releaseId?: string; storyId?: string; status?: string; search?: string }) =>
    apiClient.get<PaginatedResponse<TestCase>>(`/workspaces/${wsId}/test-cases`, { params }),
  get: (wsId: string, id: string) =>
    apiClient.get<TestCase>(`/workspaces/${wsId}/test-cases/${id}`),
  create: (wsId: string, data: { title: string; description?: string; type?: string; steps?: { order?: number; action?: string; expected?: string }[]; expectedResult?: string; priority?: string; storyId?: string; releaseId?: string }) =>
    apiClient.post<TestCase>(`/workspaces/${wsId}/test-cases`, data),
  update: (wsId: string, id: string, data: Partial<TestCase>) =>
    apiClient.patch<TestCase>(`/workspaces/${wsId}/test-cases/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/test-cases/${id}`),
  markRun: (wsId: string, id: string, data: { status: 'PASS' | 'FAIL' | 'BLOCKED' | 'UNTESTED'; releaseId?: string; actualResult?: string }) =>
    apiClient.post<TestRun>(`/workspaces/${wsId}/test-cases/${id}/runs`, data),
  createDefect: (wsId: string, id: string, runId: string) =>
    apiClient.post<Support>(`/workspaces/${wsId}/test-cases/${id}/runs/${runId}/defect`),
};

// Attachments
export interface Attachment {
  id: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  uploadedBy: { id: string; email: string; name?: string };
  category: 'FILE' | 'SCREENSHOT';
  createdAt: string;
}

export const attachmentApi = {
  upload: (wsId: string, entityType: string, entityId: string, file: File, category: 'FILE' | 'SCREENSHOT' = 'FILE') => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<Attachment>(
      `/workspaces/${wsId}/uploads?entityType=${entityType}&entityId=${entityId}&category=${category}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
  list: (wsId: string, entityType: string, entityId: string) =>
    apiClient.get<Attachment[]>(`/workspaces/${wsId}/uploads`, { params: { entityType, entityId } }),
  remove: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/uploads/${id}`),
};

// Tags — get all tags used in workspace across entities
export const tagApi = {
  list: (wsId: string) =>
    apiClient.get<string[]>(`/workspaces/${wsId}/tags`),
};

export const relationApi = {
  promote: (wsId: string, id: string, data?: { releaseId?: string; priority?: string }) =>
    apiClient.post<Feature>(`/workspaces/${wsId}/ideas/${id}/promote`, data || {}),
  clone: (wsId: string, id: string) =>
    apiClient.post<Story>(`/workspaces/${wsId}/features/${id}/clone`),
  list: (wsId: string, entityType: string, entityId: string) =>
    apiClient.get<RelatedEntity[]>(`/workspaces/${wsId}/relations`, { params: { entityType, entityId } }),
  cloneSupportToIdea: (wsId: string, id: string) =>
    apiClient.post<Idea>(`/workspaces/${wsId}/supports/${id}/clone-to-idea`),
  cloneSupportToFeature: (wsId: string, id: string) =>
    apiClient.post<Feature>(`/workspaces/${wsId}/supports/${id}/clone-to-feature`),
  cloneSupportToStory: (wsId: string, id: string, data: { featureId: string }) =>
    apiClient.post<Story>(`/workspaces/${wsId}/supports/${id}/clone-to-story`, data),
};

export const workflowApi = {
  list: (wsId: string) => apiClient.get<Workflow[]>(`/workspaces/${wsId}/workflows`),
  get: (wsId: string, id: string) => apiClient.get<Workflow>(`/workspaces/${wsId}/workflows/${id}`),
  byEntity: (wsId: string, entityType: string) =>
    apiClient.get<Workflow>(`/workspaces/${wsId}/workflows/by-entity`, { params: { entityType } }),
  create: (wsId: string, data: { name: string; entityType: string }) =>
    apiClient.post<Workflow>(`/workspaces/${wsId}/workflows`, data),
  update: (wsId: string, id: string, data: Partial<Workflow>) =>
    apiClient.patch<Workflow>(`/workspaces/${wsId}/workflows/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/workflows/${id}`),
  addStatus: (wsId: string, workflowId: string, data: { name: string; color?: string; type?: string }) =>
    apiClient.post(`/workspaces/${wsId}/workflows/${workflowId}/statuses`, data),
  updateStatus: (wsId: string, statusId: string, data: { name?: string; color?: string; wipLimit?: number | null }) =>
    apiClient.patch(`/workspaces/${wsId}/workflows/statuses/${statusId}`, data),
  removeStatus: (wsId: string, statusId: string) =>
    apiClient.delete(`/workspaces/${wsId}/workflows/statuses/${statusId}`),
  reorderStatuses: (wsId: string, workflowId: string, statusOrder: { id: string; sortOrder: number }[]) =>
    apiClient.patch(`/workspaces/${wsId}/workflows/${workflowId}/statuses/reorder`, statusOrder),
  addTransition: (wsId: string, data: { fromStatusId: string; toStatusId: string; allowedRoles?: string[] }) =>
    apiClient.post(`/workspaces/${wsId}/workflows/transitions`, data),
  removeTransition: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/workflows/transitions/${id}`),
};

// 自动化规则（设置页；查看 VIEWER / 管理 ADMIN）
export interface AutomationRule {
  id: string;
  workspaceId: string;
  name: string;
  entityType: string;
  trigger: 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED';
  triggerValue?: string | null;
  actions: Array<{ type: 'NOTIFY' | 'SET_STATUS'; target?: string; message?: string; status?: string }>;
  enabled: boolean;
  createdAt: string;
}
export const automationApi = {
  list: (wsId: string) => apiClient.get<AutomationRule[]>(`/workspaces/${wsId}/automation-rules`),
  create: (wsId: string, data: Partial<AutomationRule>) =>
    apiClient.post<AutomationRule>(`/workspaces/${wsId}/automation-rules`, data),
  update: (wsId: string, id: string, data: Partial<AutomationRule>) =>
    apiClient.patch<AutomationRule>(`/workspaces/${wsId}/automation-rules/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/automation-rules/${id}`),
};

// 团队（P0-④ 项目/团队级权限；查看 VIEWER / 管理 ADMIN）
export interface Team {
  id: string;
  name: string;
  description?: string | null;
  memberCount?: number;
  members?: Array<{ userId: string; email: string; name?: string | null }>;
}
export const teamsApi = {
  list: (wsId: string) => apiClient.get<Team[]>(`/workspaces/${wsId}/teams`),
  create: (wsId: string, data: { name: string; description?: string }) =>
    apiClient.post<Team>(`/workspaces/${wsId}/teams`, data),
  update: (wsId: string, id: string, data: { name?: string; description?: string }) =>
    apiClient.patch<Team>(`/workspaces/${wsId}/teams/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/teams/${id}`),
  addMember: (wsId: string, id: string, userId: string) =>
    apiClient.post(`/workspaces/${wsId}/teams/${id}/members`, { userId }),
  removeMember: (wsId: string, id: string, userId: string) =>
    apiClient.delete(`/workspaces/${wsId}/teams/${id}/members/${userId}`),
};

// ============================================================
// 代码仓库集成（P1-⑥/P1-C：GITHUB/GITLAB/GITEE）
// ============================================================
export type VcsProvider = 'GITHUB' | 'GITLAB' | 'GITEE';
export interface GithubConfigSummary {
  id: string;
  provider: VcsProvider;
  repoFullName: string;
  enabled: boolean;
  createdAt: string;
  _count?: { links: number };
}
export interface GithubLinkItem {
  id: string;
  githubType: 'COMMIT' | 'PR';
  prNumber?: number | null;
  commitSha?: string | null;
  title?: string | null;
  state?: string | null;
  url?: string | null;
  author?: string | null;
  createdAt: string;
  config?: { repoFullName: string };
}
export interface GithubConfigCreated {
  id: string;
  provider: VcsProvider;
  repoFullName: string;
  webhookSecret: string;
  webhookUrl: string;
}
export const githubApi = {
  configs: (wsId: string) => apiClient.get<GithubConfigSummary[]>(`/workspaces/${wsId}/github/configs`),
  addConfig: (wsId: string, repoFullName: string, provider: VcsProvider = 'GITHUB') =>
    apiClient.post<GithubConfigCreated>(`/workspaces/${wsId}/github/configs`, { repoFullName, provider }),
  removeConfig: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/github/configs/${id}`),
  links: (wsId: string, entityType: string, entityId: string) =>
    apiClient.get<GithubLinkItem[]>(`/workspaces/${wsId}/github/links`, { params: { entityType, entityId } }),
};

// Sprint 迭代（P1-① 迭代规划 + Backlog）
export interface Sprint {
  id: string;
  releaseId?: string | null;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  goal?: string | null;
  status: string;
  sortOrder?: number;
  storyCount?: number;
  doneCount?: number;
  totalPoints?: number;
}
export const sprintsApi = {
  list: (wsId: string, params?: { releaseId?: string }) =>
    apiClient.get<Sprint[]>(`/workspaces/${wsId}/sprints`, { params }),
  stats: (wsId: string, id: string) =>
    apiClient.get<{ id: string; name: string; status: string; totalPoints: number; storyCount: number; doneCount: number; inProgressCount: number; progress: number }>(
      `/workspaces/${wsId}/sprints/${id}/stats`,
    ),
  create: (wsId: string, data: { name: string; releaseId?: string; startDate?: string; endDate?: string; goal?: string }) =>
    apiClient.post<Sprint>(`/workspaces/${wsId}/sprints`, data),
  update: (wsId: string, id: string, data: Partial<Sprint>) =>
    apiClient.patch<Sprint>(`/workspaces/${wsId}/sprints/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/sprints/${id}`),
};

// ============================================================
// Global Search (P1-⑨ Cmd+K)
// ============================================================
export interface SearchResultItem {
  entityType: 'STORY' | 'IDEA' | 'FEATURE' | 'SUPPORT';
  id: string;
  code?: string | null;
  title: string;
  status: string;
  parentId?: string | null;
}
export const searchApi = {
  global: (wsId: string, q: string) =>
    apiClient.get<{ query: string; results: SearchResultItem[] }>(`/workspaces/${wsId}/search`, {
      params: { q },
    }),
};

// ============================================================
// Share (P2-⑭ 访客分享)
// ============================================================
export interface ShareLinkView {
  workspaceName: string;
  entityType: string;
  entity: any;
  brandTitle?: string | null;
  brandColor?: string | null;
  viewMode?: string;
  // P1-D：RELEASE 叙事视图增强
  featureGroups?: { key: string; label: string; items: any[] }[];
  releaseMeta?: { milestone?: string | null; narrative?: string | null };
  releases?: { id: string; name: string; version?: string | null; status: string; milestone?: string | null; startDate?: string | null; endDate?: string | null; _count?: { features: number } }[];
}

export const shareApi = {
  create: (wsId: string, entityType: string, entityId: string, opts?: { days?: number; brandTitle?: string; brandColor?: string; viewMode?: string }) =>
    apiClient.post<{ token: string; expiresAt: string | null }>(`/workspaces/${wsId}/share`, {
      entityType,
      entityId,
      days: opts?.days,
      brandTitle: opts?.brandTitle,
      brandColor: opts?.brandColor,
      viewMode: opts?.viewMode,
    }),
  revoke: (wsId: string, entityType: string, entityId: string) =>
    apiClient.delete(`/workspaces/${wsId}/share`, { data: { entityType, entityId } }),
  view: (token: string, includeSiblings = false) =>
    apiClient.get<ShareLinkView>(`/share/${token}`, { params: includeSiblings ? { includeSiblings: 'true' } : {} }),
};

// ============================================================
// OKR (P3-A 目标对齐)
// ============================================================
export interface OkrLinkedEntity {
  id: string;
  entityType: string;
  entityId: string;
  entity?: { id: string; title: string; code?: string; status?: string };
}

export interface OkrKeyResult {
  id: string;
  objectiveId: string;
  title: string;
  target?: string | null;
  sortOrder: number;
  progress: number;
  itemCount: number;
  linked: OkrLinkedEntity[];
}

export interface OkrObjective {
  id: string;
  title: string;
  period?: string | null;
  status: string;
  progress: number;
  keyResults: OkrKeyResult[];
}

/** OKR 反向溯源：实体 → 所属目标 */
export interface OkrEntityLink {
  keyResultItemId: string;
  keyResultId: string;
  keyResultTitle: string;
  keyResultTarget?: string | null;
  objectiveId: string;
  objectiveTitle: string;
  objectivePeriod?: string | null;
  objectiveStatus: string;
}

export const okrApi = {
  listObjectives: (wsId: string, includeArchived = false) =>
    apiClient.get<OkrObjective[]>(`/workspaces/${wsId}/okr/objectives`, {
      params: { includeArchived },
    }),
  createObjective: (wsId: string, data: { title: string; period?: string }) =>
    apiClient.post<OkrObjective>(`/workspaces/${wsId}/okr/objectives`, data),
  updateObjective: (wsId: string, id: string, data: Partial<OkrObjective>) =>
    apiClient.patch<OkrObjective>(`/workspaces/${wsId}/okr/objectives/${id}`, data),
  removeObjective: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/okr/objectives/${id}`),
  addKeyResult: (wsId: string, objectiveId: string, data: { title: string; target?: string }) =>
    apiClient.post(`/workspaces/${wsId}/okr/objectives/${objectiveId}/key-results`, data),
  updateKeyResult: (wsId: string, id: string, data: { title?: string; target?: string }) =>
    apiClient.patch(`/workspaces/${wsId}/okr/key-results/${id}`, data),
  removeKeyResult: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/okr/key-results/${id}`),
  linkItem: (wsId: string, krId: string, entityType: 'FEATURE' | 'STORY' | 'RELEASE', entityId: string) =>
    apiClient.post(`/workspaces/${wsId}/okr/key-results/${krId}/items`, { entityType, entityId }),
  unlinkItem: (wsId: string, krId: string, entityType: string, entityId: string) =>
    apiClient.delete(`/workspaces/${wsId}/okr/key-results/${krId}/items`, { data: { entityType, entityId } }),
  findByEntity: (wsId: string, entityType: 'FEATURE' | 'STORY' | 'RELEASE', entityId: string) =>
    apiClient.get<OkrEntityLink[]>(`/workspaces/${wsId}/okr/by-entity`, { params: { entityType, entityId } }),
};

// ============================================================
// Telemetry (P3-B 用量统计 + 方案 B 更新检查通道)
// ============================================================
export interface InstanceHeartbeat {
  id: string;
  instanceId: string;
  version?: string | null;
  edition: string;
  lastSeenAt: string;
  checkCount: number;
}

export const telemetryApi = {
  checkUpdate: (instanceId: string, version: string, edition: string) =>
    apiClient.get<{ latest: string; changelog: string; updateAvailable: boolean }>('/telemetry/updates/check', {
      params: { instanceId, version, edition },
    }),
  listInstances: (page = 1, pageSize = 50) =>
    apiClient.get<{ items: InstanceHeartbeat[]; total: number; active30d: number; active7d: number }>(
      '/telemetry/instances',
      { params: { page, pageSize } },
    ),
  summary: () => apiClient.get('/telemetry/summary'),
};

// P2-①：License 管理统一走 axios 拦截器（自动携带 httpOnly cookie token + 401 自动刷新），
// 修复原页面直接读 localStorage.getItem('pinecone_token') 永远为 null 导致的 401。
export interface LicenseItem {
  id: string;
  customerName: string;
  customerEmail: string;
  licenseKey: string;
  edition: string;
  seats: number;
  issuedAt: string;
  expiresAt: string;
  status: string;
  lastSeenAt?: string | null;
  lastVersion?: string | null;
  notes?: string | null;
}

export const licenseApi = {
  list: (params: { search?: string; status?: string }) =>
    apiClient.get<{ items: LicenseItem[]; total: number; page: number; pageSize: number }>('/admin/licenses', {
      params,
    }),
  create: (data: { customerName: string; customerEmail: string; edition?: string; seats?: number; days: number }) =>
    apiClient.post<LicenseItem>('/admin/licenses', data),
  renew: (id: string, days: number, seats?: number) =>
    apiClient.patch<LicenseItem>(`/admin/licenses/${id}/renew`, { days, seats }),
  revoke: (id: string) => apiClient.delete(`/admin/licenses/${id}`),
};

// ============================================================
// Reports (P1-⑧ 仪表盘报表 / G1-P0 报表补强)
// ============================================================
export interface SprintProgressItem {
  id: string;
  name: string;
  status: string;
  total: number;
  done: number;
  percent: number;
}
export interface TrendPoint {
  date: string;
  [key: string]: number | string;
}
export interface ReportsOverview {
  days: number;
  sprintProgress: SprintProgressItem[];
  testTrend: TrendPoint[];
  defectTrend: TrendPoint[];
}

// ── G1-P0：燃尽图 / 速率图 / 工时报表 ──
export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}
export interface BurndownReport {
  sprint: { id: string; name: string; status: string; startDate: string | null; endDate: string | null };
  metric: 'points' | 'hours';
  totalScope: number;
  totalDays: number;
  points: BurndownPoint[];
}

export interface VelocityItem {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  completedPoints: number;
  completedCount: number;
  avgPoints: number;
}
export interface VelocityReport {
  window: number;
  items: VelocityItem[];
  totals: { sprints: number; points: number; count: number; avgPerSprint: number };
}

export interface TimeReportItem {
  key: string;
  estimatedHours: number;
  actualHours: number;
  variance: number;
}
export interface TimeReport {
  groupBy: 'person' | 'feature' | 'release';
  items: TimeReportItem[];
  totals: { estimatedHours: number; actualHours: number };
}

// ── G1-P1/P2：产品发现 / 发布质量 / 透视表 ──
export interface DiscoveryReport {
  topEntities: Array<{ type: 'IDEA' | 'SUPPORT' | 'FEATURE'; items: Array<{ id: string; title: string; votes: number }> }>;
  themes: Array<{ id: string; title: string; color: string | null; entityCount: number; votes: number }>;
  scoreDistribution: Array<{
    model: string;
    count: number;
    avg: number;
    max: number;
    min: number;
    distribution: Array<{ label: string; count: number }>;
  }>;
  conversion: {
    total: number;
    defectCount: number;
    defectRate: number;
    openDefects: number;
    severity: Record<string, number>;
    phases: Record<string, number>;
  };
}

export interface ReleaseQuality {
  id: string;
  name: string;
  version: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  productionDate: string | null;
  testStats: { total: number; pass: number; fail: number; blocked: number; untested: number; passRate: number };
  defects: {
    total: number;
    open: number;
    severity: Record<string, number>;
    testFound: number;
    escaped: number;
    escapeRate: number;
    mttrHours: number;
  };
}
export interface QualityReport {
  releases: ReleaseQuality[];
  selected: ReleaseQuality | null;
}

// I5 测试覆盖率报表（2026-08-18 P1）
export interface CoverageRelease {
  id: string;
  name: string;
  version: string | null;
  total: number;
  covered: number;
  rate: number;
}
export interface CoverageReport {
  total: number;
  covered: number;
  coverageRate: number;
  byRelease: CoverageRelease[];
  byType: Array<{ type: string; total: number; covered: number; rate: number }>;
  uncovered: Array<{ id: string; code: string | null; title: string; release: string | null }>;
}

export interface PivotCell {
  colKey: string;
  value: number;
}
export interface PivotMatrix {
  entity: string;
  rowField: string;
  colField: string;
  rowKeys: string[];
  colKeys: string[];
  matrix: Array<{ rowKey: string; cells: PivotCell[]; rowTotal: number }>;
  colTotals: Array<{ colKey: string; value: number }>;
  grandTotal: number;
}

export const reportsApi = {
  overview: (wsId: string, days?: number) =>
    apiClient.get<ReportsOverview>(`/workspaces/${wsId}/reports/overview`, { params: { days } }),
  burndown: (wsId: string, sprintId: string) =>
    apiClient.get<BurndownReport>(`/workspaces/${wsId}/reports/burndown/${sprintId}`),
  velocity: (wsId: string, window?: number) =>
    apiClient.get<VelocityReport>(`/workspaces/${wsId}/reports/velocity`, { params: { window } }),
  time: (wsId: string, groupBy: 'person' | 'feature' | 'release') =>
    apiClient.get<TimeReport>(`/workspaces/${wsId}/reports/time`, { params: { groupBy } }),
  discovery: (wsId: string) => apiClient.get<DiscoveryReport>(`/workspaces/${wsId}/reports/discovery`),
  quality: (wsId: string, releaseId?: string) =>
    apiClient.get<QualityReport>(`/workspaces/${wsId}/reports/quality`, { params: { releaseId } }),
  coverage: (wsId: string, releaseId?: string) =>
    apiClient.get<CoverageReport>(`/workspaces/${wsId}/reports/coverage`, { params: { releaseId } }),
  pivot: (wsId: string, body: { entity: 'STORY' | 'SUPPORT' | 'IDEA'; rowField: string; colField: string }) =>
    apiClient.post<PivotMatrix>(`/workspaces/${wsId}/reports/pivot`, body),
};

// ── G1-P1-③ 自定义仪表盘 + P2-③ 定时订阅 ──
export interface DashboardCard {
  id: string;
  type: 'VELOCITY' | 'TIME' | 'DISCOVERY' | 'QUALITY';
  title?: string;
  params?: Record<string, unknown>;
}
export interface Dashboard {
  id: string;
  workspaceId: string;
  name: string;
  config: { cards: DashboardCard[] };
  createdAt: string;
  updatedAt: string;
}
export interface ReportSubscription {
  id: string;
  workspaceId: string;
  name: string;
  schedule: 'DAILY' | 'WEEKLY';
  enabled: boolean;
  createdAt: string;
}

export const dashboardsApi = {
  get: (wsId: string) => apiClient.get<Dashboard | null>(`/workspaces/${wsId}/dashboard`),
  save: (wsId: string, body: { name?: string; config: { cards: DashboardCard[] } }) =>
    apiClient.put<Dashboard>(`/workspaces/${wsId}/dashboard`, body),
  // P1 多仪表盘（2026-08-19）
  list: (wsId: string) => apiClient.get<Dashboard[]>(`/workspaces/${wsId}/dashboards`),
  create: (wsId: string, body: { name: string }) =>
    apiClient.post<Dashboard>(`/workspaces/${wsId}/dashboards`, body),
  update: (wsId: string, id: string, body: { name?: string; config?: { cards: DashboardCard[] } }) =>
    apiClient.put<Dashboard>(`/workspaces/${wsId}/dashboards/${id}`, body),
  remove: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/dashboards/${id}`),
  listSubscriptions: (wsId: string) =>
    apiClient.get<ReportSubscription[]>(`/workspaces/${wsId}/report-subscriptions`),
  createSubscription: (wsId: string, body: { name: string; schedule?: 'DAILY' | 'WEEKLY' }) =>
    apiClient.post<ReportSubscription>(`/workspaces/${wsId}/report-subscriptions`, body),
  updateSubscription: (wsId: string, id: string, body: { name?: string; schedule?: 'DAILY' | 'WEEKLY'; enabled?: boolean }) =>
    apiClient.patch<ReportSubscription>(`/workspaces/${wsId}/report-subscriptions/${id}`, body),
  deleteSubscription: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/report-subscriptions/${id}`),
};

// ============================================================
// Imports (方向1-② CSV 导入)
// ============================================================
export interface ImportJobSummary {
  id: string;
  entityType: string;
  fileName: string;
  rowCount: number;
  status: 'PREVIEW' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  successCount: number;
  failCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface ImportJobDetail extends ImportJobSummary {
  columnHeaders: string[];
  preview: Record<string, string>[];
  errors?: { row: number; message: string }[];
}

export interface ImportRunResult {
  id: string;
  status: ImportJobDetail['status'];
  successCount: number;
  failCount: number;
  errors: { row: number; message: string }[];
}

export const importApi = {
  list: (wsId: string) =>
    apiClient.get<ImportJobSummary[]>(`/workspaces/${wsId}/imports`),
  upload: (wsId: string, entityType: string, file: File) => {
    const form = new FormData();
    form.append('entityType', entityType);
    form.append('file', file);
    return apiClient.post<{ id: string; entityType: string; columnHeaders: string[]; rowCount: number; preview: Record<string, string>[] }>(
      `/workspaces/${wsId}/imports/csv/upload`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
  run: (wsId: string, jobId: string, mapping: Record<string, { field: string; valueMap?: Record<string, string> }>, defaults?: Record<string, unknown>) =>
    apiClient.post<ImportRunResult>(`/workspaces/${wsId}/imports/${jobId}/run`, { mapping, defaults }),
  get: (wsId: string, jobId: string) =>
    apiClient.get<ImportJobDetail>(`/workspaces/${wsId}/imports/${jobId}`),
  // 2026-08-14：Excel 模板下载（axios blob，自动携带 httpOnly cookie 认证）
  template: (wsId: string, entityType: string) =>
    apiClient.get<Blob>(`/workspaces/${wsId}/imports/template?entityType=${entityType}`, { responseType: 'blob' }),
};

// Trash (Phase 2-② 软删除回收站)
export interface TrashItem {
  id: string;
  code?: string | null;
  title: string;
  deletedAt: string;
}
export interface TrashBundle {
  ideas: TrashItem[];
  features: TrashItem[];
  stories: TrashItem[];
  supports: TrashItem[];
  testCases: TrashItem[];
}
export const trashApi = {
  list: (wsId: string) =>
    apiClient.get<TrashBundle>(`/workspaces/${wsId}/trash`),
  restore: (wsId: string, entityType: string, entityId: string) =>
    apiClient.post(`/workspaces/${wsId}/trash/restore`, { entityType, entityId }),
  // 2026-08-14：自动清理设置 + 手动清理
  settings: (wsId: string) =>
    apiClient.get<{ purgeEnabled: boolean; purgeDays: number }>(`/workspaces/${wsId}/trash/settings`),
  updateSettings: (wsId: string, data: { purgeEnabled?: boolean; purgeDays?: number }) =>
    apiClient.put<{ purgeEnabled: boolean; purgeDays: number }>(`/workspaces/${wsId}/trash/settings`, data),
  purge: (wsId: string, entityType: string, ids: string[]) =>
    apiClient.post<{ entityType: string; purged: number }>(`/workspaces/${wsId}/trash/purge`, { entityType, ids }),
};

// Gantt (Phase 3-③ 只读甘特)
export interface GanttRelease {
  id: string;
  name: string;
  version?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  stageDate?: string | null;
  productionDate?: string | null;
  dependsOnId?: string | null;
  dependsOnName?: string | null;
  storyCount: number;
  featureCount: number;
  supportCount: number;
}
export const ganttApi = {
  list: (wsId: string) =>
    apiClient.get<GanttRelease[]>(`/workspaces/${wsId}/releases/gantt`),
};

// AI 摘要 (Phase 3-②)
export interface AiSummaryResult {
  source: 'llm' | 'template';
  summary: string;
}

// I1 知识库 AI 问答（2026-08-18 P0）
export interface KbAskSource {
  pageId: string;
  title: string;
  slug: string;
  excerpt: string;
}
export interface KbAskResult {
  source: 'llm' | 'no-key' | 'degraded' | 'empty';
  answer: string;
  sources: KbAskSource[];
}
export const aiApi = {
  summarize: (wsId: string, scope: 'WORKSPACE' | 'RELEASE', releaseId?: string) =>
    apiClient.post<AiSummaryResult>(`/workspaces/${wsId}/ai/summarize`, { scope, releaseId }),
  decomposeStory: (wsId: string, storyId: string) =>
    apiClient.post<{ source: 'llm' | 'heuristic'; suggestions: string[] }>(
      `/workspaces/${wsId}/ai/decompose-story`,
      { storyId },
    ),
  clusterThemes: (wsId: string) =>
    apiClient.post<AiClusterResult>(`/workspaces/${wsId}/ai/cluster-themes`),
  insights: (wsId: string) =>
    apiClient.post<AiInsightsResult>(`/workspaces/${wsId}/ai/insights`),
  weeklyReport: (wsId: string, range?: { from?: string; to?: string }) =>
    apiClient.post<AiWeeklyReport>(`/workspaces/${wsId}/ai/weekly-report`, range ?? {}),
  kbAsk: (wsId: string, question: string) =>
    apiClient.post<KbAskResult>(`/workspaces/${wsId}/ai/kb-ask`, { question }),
};

// P1 AI：聚类 / 洞察 / 周报
export interface AiClusterItem {
  entityType: 'SUPPORT' | 'IDEA';
  entityId: string;
}
export interface AiClusterSuggestion {
  title: string;
  summary: string;
  items: AiClusterItem[];
}
export interface AiClusterResult {
  source: 'llm' | 'heuristic' | 'empty';
  suggestions: AiClusterSuggestion[];
}
export interface AiInsight {
  kind: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  count: number;
}
export interface AiInsightsResult {
  source: 'llm' | 'rules';
  insights: AiInsight[];
  summary: string | null;
  doneStories: number;
}
export interface AiWeeklyReport {
  source: 'llm' | 'template';
  period: { from: string; to: string };
  report: string;
}

// 测试自动化集成 (Phase 4: JUnit CI 结果同步)
export interface JunitImportReport {
  parsed: number;
  matched: number;
  created: number;
  runs: number;
  summary: { PASS: number; FAIL: number; BLOCKED: number };
  detail: { name: string; status: string; action: 'matched' | 'created'; testCaseCode?: string | null }[];
  errors: { name: string; message: string }[];
}
export const testAutomationApi = {
  importJunit: (wsId: string, file: File, opts: { releaseId?: string; autoCreate?: boolean }) => {
    const form = new FormData();
    form.append('file', file);
    const params = new URLSearchParams();
    if (opts.releaseId) params.set('releaseId', opts.releaseId);
    if (opts.autoCreate) params.set('autoCreate', 'true');
    const qs = params.toString();
    return apiClient.post<JunitImportReport>(
      `/workspaces/${wsId}/test-automation/junit${qs ? `?${qs}` : ''}`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
};

// TestPlan (Phase 4 命名计划实体)
export interface TestPlanSummary {
  id: string;
  name: string;
  status: string;
  releaseId?: string | null;
  _count: { cases: number };
  release?: { name: string; version?: string | null } | null;
}
export interface TestPlanDetail extends TestPlanSummary {
  description?: string | null;
  cases: { id: string; testCase: { id: string; code?: string | null; title: string; type: string; priority: string } }[];
  progress: { total: number; PASS: number; FAIL: number; BLOCKED: number; UNTESTED: number; passRate: number };
}
export const testPlanApi = {
  list: (wsId: string, releaseId?: string) =>
    apiClient.get<TestPlanSummary[]>(`/workspaces/${wsId}/test-plans`, { params: releaseId ? { releaseId } : {} }),
  get: (wsId: string, id: string) =>
    apiClient.get<TestPlanDetail>(`/workspaces/${wsId}/test-plans/${id}`),
  create: (wsId: string, data: { name: string; releaseId?: string; description?: string }) =>
    apiClient.post(`/workspaces/${wsId}/test-plans`, data),
  update: (wsId: string, id: string, data: { name?: string; releaseId?: string | null; description?: string }) =>
    apiClient.patch(`/workspaces/${wsId}/test-plans/${id}`, data),
  updateStatus: (wsId: string, id: string, status: string) =>
    apiClient.patch(`/workspaces/${wsId}/test-plans/${id}/status`, { status }),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/test-plans/${id}`),
  addCases: (wsId: string, id: string, data: { testCaseIds?: string[]; releaseId?: string }) =>
    apiClient.post(`/workspaces/${wsId}/test-plans/${id}/cases`, data),
  removeCase: (wsId: string, id: string, testCaseId: string) =>
    apiClient.delete(`/workspaces/${wsId}/test-plans/${id}/cases/${testCaseId}`),
  startRun: (wsId: string, id: string, releaseId: string) =>
    apiClient.post(`/workspaces/${wsId}/test-plans/${id}/start-run?releaseId=${releaseId}`),
  walkthrough: (wsId: string, id: string) =>
    apiClient.get<TestPlanWalkthrough>(`/workspaces/${wsId}/test-plans/${id}/walkthrough`),
};

// P1-B：走查页数据
export interface TestPlanWalkthroughItem {
  index: number;
  testCaseId: string;
  code?: string | null;
  title: string;
  type: string;
  priority: string;
  description?: string | null;
  expectedResult?: string | null;
  steps?: { order?: number; action?: string; expected?: string }[] | null;
  runId?: string | null;
  status: string;
  actualResult?: string | null;
  supportId?: string | null;
}
export interface TestPlanWalkthrough {
  plan: { id: string; name: string; description?: string | null; status: string; release?: { id: string; name: string; version?: string | null } | null };
  total: number;
  items: TestPlanWalkthroughItem[];
}

// ============================================================
// Knowledge Base
// ============================================================

export interface KbSpace {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  sortOrder: number;
  visibility?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  _count?: { pages: number };
}

export interface KbPage {
  id: string;
  workspaceId: string;
  spaceId?: string;
  parentId?: string;
  path?: string;
  sortOrder: number;
  title: string;
  slug: string;
  content?: any; // Tiptap JSON
  contentText?: string;
  status: string; // draft | published | archived
  version: number;
  visibility?: string; // SPACE | PRIVATE（G1 P1-B）
  allowedRoleIds?: string[]; // PRIVATE 时可见角色
  authorId: string;
  updaterId?: string;
  author: { id: string; email: string; name?: string };
  updater?: { id: string; email: string; name?: string };
  tags?: { tag: KbTag }[];
  space?: KbSpace;
  createdAt: string;
  updatedAt: string;
  _count?: { children: number; comments: number };
}

// G1 知识库 P1-A：页面↔工作项关联 / P2-A：版本
export interface KbPageLink {
  id: string;
  pageId: string;
  entityType: string;
  entityId: string;
  linkType: string;
  entityTitle?: string | null;
  createdAt: string;
}
export interface KbPageVersion {
  id: string;
  version: number;
  contentSnapshot?: any;
  editor?: { id: string; email: string; name?: string };
  createdAt: string;
}
export interface EntitySearchItem {
  id: string;
  title: string;
  code?: string | null;
  status?: string | null;
}

export interface KbPageTreeNode {
  id: string;
  title: string;
  slug: string;
  parentId?: string;
  path?: string;
  sortOrder: number;
  status: string;
  spaceId?: string;
  _count?: { children: number };
}

export interface KbComment {
  id: string;
  workspaceId: string;
  pageId: string;
  parentId?: string;
  authorId: string;
  body: string;
  author: { id: string; email: string; name?: string };
  createdAt: string;
  updatedAt: string;
}

export interface KbTag {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  color?: string;
  _count?: { pages: number };
}

export const kbSpacesApi = {
  list: (wsId: string) =>
    apiClient.get<{ items: KbSpace[]; total: number }>(`/workspaces/${wsId}/kb/spaces`),
  get: (wsId: string, spaceId: string) =>
    apiClient.get<KbSpace>(`/workspaces/${wsId}/kb/spaces/${spaceId}`),
  create: (wsId: string, data: { name: string; slug?: string; icon?: string; description?: string }) =>
    apiClient.post<KbSpace>(`/workspaces/${wsId}/kb/spaces`, data),
  update: (wsId: string, spaceId: string, data: Partial<KbSpace>) =>
    apiClient.patch<KbSpace>(`/workspaces/${wsId}/kb/spaces/${spaceId}`, data),
  remove: (wsId: string, spaceId: string) =>
    apiClient.delete(`/workspaces/${wsId}/kb/spaces/${spaceId}`),
};

export const kbPagesApi = {
  list: (wsId: string, params?: { spaceId?: string; parentId?: string }) =>
    apiClient.get<{ items: KbPage[]; total: number }>(`/workspaces/${wsId}/kb/pages`, { params }),
  tree: (wsId: string, spaceId: string) =>
    apiClient.get<KbPageTreeNode[]>(`/workspaces/${wsId}/kb/spaces/${spaceId}/pages`),
  get: (wsId: string, pageId: string) =>
    apiClient.get<KbPage>(`/workspaces/${wsId}/kb/pages/${pageId}`),
  create: (wsId: string, data: { spaceId?: string; parentId?: string; title: string; slug?: string; content?: any; contentText?: string; status?: string }) =>
    apiClient.post<KbPage>(`/workspaces/${wsId}/kb/pages`, data),
  update: (wsId: string, pageId: string, data: Partial<KbPage>) =>
    apiClient.patch<KbPage>(`/workspaces/${wsId}/kb/pages/${pageId}`, data),
  move: (wsId: string, pageId: string, data: { parentId?: string | null; sortOrder?: number }) =>
    apiClient.patch<KbPage>(`/workspaces/${wsId}/kb/pages/${pageId}/move`, data),
  // G1 P1-A 关联
  links: (wsId: string, pageId: string) =>
    apiClient.get<KbPageLink[]>(`/workspaces/${wsId}/kb/pages/${pageId}/links`),
  linkEntity: (wsId: string, pageId: string, data: { entityType: string; entityId: string; linkType?: string }) =>
    apiClient.post<KbPageLink>(`/workspaces/${wsId}/kb/pages/${pageId}/links`, data),
  removeLink: (wsId: string, pageId: string, linkId: string) =>
    apiClient.delete(`/workspaces/${wsId}/kb/pages/${pageId}/links/${linkId}`),
  entityPages: (wsId: string, entityType: string, entityId: string) =>
    apiClient.get<Array<{ id: string; linkType: string; page: { id: string; title: string; slug: string; status: string; spaceId?: string | null; updatedAt: string } }>>(
      `/workspaces/${wsId}/kb/entity-pages`,
      { params: { entityType, entityId } },
    ),
  searchEntities: (wsId: string, entityType: string, q?: string) =>
    apiClient.get<EntitySearchItem[]>(`/workspaces/${wsId}/kb/entity-search`, { params: { entityType, q } }),
  createFromEntity: (wsId: string, data: { entityType: string; entityId: string; spaceId?: string }) =>
    apiClient.post<KbPage>(`/workspaces/${wsId}/kb/pages/from-entity`, data),
  // G1 P2-A 版本
  versions: (wsId: string, pageId: string) =>
    apiClient.get<KbPageVersion[]>(`/workspaces/${wsId}/kb/pages/${pageId}/versions`),
  rollback: (wsId: string, pageId: string, version: number) =>
    apiClient.post<KbPage>(`/workspaces/${wsId}/kb/pages/${pageId}/rollback/${version}`),
  remove: (wsId: string, pageId: string) =>
    apiClient.delete(`/workspaces/${wsId}/kb/pages/${pageId}`),
};

export const kbCommentsApi = {
  list: (wsId: string, pageId: string) =>
    apiClient.get<{ items: KbComment[]; total: number }>(`/workspaces/${wsId}/kb/pages/${pageId}/comments`),
  create: (wsId: string, data: { pageId: string; parentId?: string; body: string }) =>
    apiClient.post<KbComment>(`/workspaces/${wsId}/kb/comments`, data),
  remove: (wsId: string, commentId: string) =>
    apiClient.delete(`/workspaces/${wsId}/kb/comments/${commentId}`),
};

export const kbTagsApi = {
  list: (wsId: string) =>
    apiClient.get<KbTag[]>(`/workspaces/${wsId}/kb/tags`),
  upsert: (wsId: string, data: { name: string; color?: string }) =>
    apiClient.post<KbTag>(`/workspaces/${wsId}/kb/tags`, data),
  addToPage: (wsId: string, pageId: string, tagId: string) =>
    apiClient.post(`/workspaces/${wsId}/kb/pages/${pageId}/tags`, { tagId }),
  removeFromPage: (wsId: string, pageId: string, tagId: string) =>
    apiClient.delete(`/workspaces/${wsId}/kb/pages/${pageId}/tags/${tagId}`),
};

export const kbTemplatesApi = {
  list: (wsId: string) =>
    apiClient.get<KbPage[]>(`/workspaces/${wsId}/kb/templates`),
  use: (wsId: string, templateId: string, data: { spaceId?: string; parentId?: string; title: string }) =>
    apiClient.post<KbPage>(`/workspaces/${wsId}/kb/templates/${templateId}/use`, data),
};

export const kbSearchApi = {
  search: (wsId: string, query: string) =>
    apiClient.get(`/workspaces/${wsId}/kb/search`, { params: { q: query } }),
};

export const kbExportApi = {
  export: (wsId: string, pageId: string, format: string) =>
    apiClient.get<{ filename: string; content: string }>(`/workspaces/${wsId}/kb/pages/${pageId}/export`, { params: { format } }),
};

export const uploadApi = {
  upload: (wsId: string, entityType: string, entityId: string, file: File, category = 'FILE') => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post(`/workspaces/${wsId}/uploads`, form, {
      params: { entityType, entityId, category },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: (wsId: string, entityType: string, entityId: string) =>
    apiClient.get<Attachment[]>(`/workspaces/${wsId}/uploads`, { params: { entityType, entityId } }),
  remove: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/uploads/${id}`),
};

// Dashboard
export interface EntityStat {
  total: number;
  open: number;
}

export interface DashboardStats {
  entities: {
    ideas: EntityStat;
    features: EntityStat;
    stories: EntityStat;
    supports: EntityStat;
    releases: EntityStat;
  };
  thisWeek: { created: number };
  thisMonth: { hours: number };
  recentActivities: Array<{
    id: string;
    entityType: string;
    entityId: string;
    entityCode: string | null;
    entityTitle: string | null;
    action: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    user: { id: string; email: string; name?: string } | null;
  }>;
}

export const dashboardApi = {
  stats: (workspaceId: string) =>
    apiClient.get<DashboardStats>(`/workspaces/${workspaceId}/dashboard/stats`),
};

// SSO/OIDC 企业登录配置（设置页管理；CRUD 需 ADMIN）
export interface SsoProvider {
  providerType?: string;
  idpMetadataXml?: string | null;
  spEntityId?: string | null;
  id: string;
  name: string;
  issuer?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  scopes?: string | null;
  domainWhitelist?: string[] | null;
  active?: boolean;
  createdAt?: string;
}
export interface SsoProviderInput {
  name: string;
  type?: 'OIDC' | 'SAML';
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  idpMetadataXml?: string;
  spEntityId?: string;
  domainWhitelist?: string[];
  active?: boolean;
}
export const ssoProviderApi = {
  list: (wsId: string) =>
    apiClient.get<SsoProvider[]>(`/workspaces/${wsId}/sso-providers`),
  create: (wsId: string, data: SsoProviderInput) =>
    apiClient.post<{ id: string; name: string; clientSecret?: string }>(`/workspaces/${wsId}/sso-providers`, data),
  update: (wsId: string, id: string, data: Partial<SsoProviderInput>) =>
    apiClient.patch<SsoProvider>(`/workspaces/${wsId}/sso-providers/${id}`, data),
  remove: (wsId: string, id: string) =>
    apiClient.delete(`/workspaces/${wsId}/sso-providers/${id}`),
};

// SCIM 2.0 预配配置（设置页企业登录页签；ADMIN）
export interface ScimConfig {
  enabled: boolean;
  groupRoleMappings?: Array<{ groupName: string; role: string }>;
  endpoint: string;
  hasToken: boolean;
}
export const scimApi = {
  config: (wsId: string) => apiClient.get<ScimConfig>(`/workspaces/${wsId}/scim/config`),
  generateToken: (wsId: string) => apiClient.post<{ token: string; enabled: boolean }>(`/workspaces/${wsId}/scim/config/token`),
  updateConfig: (wsId: string, data: { enabled?: boolean; groupRoleMappings?: Array<{ groupName: string; role: string }> }) =>
    apiClient.patch<ScimConfig>(`/workspaces/${wsId}/scim/config`, data),
};

// Webhook 端点管理（设置页；CRUD 需 ADMIN）
export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events?: string[] | null;
  format?: string;
  active?: boolean;
  lastStatus?: string | null;
  lastDeliveredAt?: string | null;
  createdAt?: string;
}
export const webhookApi = {
  list: (wsId: string) => apiClient.get<WebhookEndpoint[]>(`/workspaces/${wsId}/webhooks`),
  create: (wsId: string, data: { name: string; url: string; events?: string[]; format?: string; secret?: string }) =>
    apiClient.post<{ id: string; name: string; secret?: string }>(`/workspaces/${wsId}/webhooks`, data),
  update: (wsId: string, id: string, data: Partial<{ name: string; url: string; events: string[]; format: string; active: boolean }>) =>
    apiClient.patch<WebhookEndpoint>(`/workspaces/${wsId}/webhooks/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/webhooks/${id}`),
  deliverPending: (wsId: string) => apiClient.post(`/workspaces/${wsId}/webhooks/deliver-pending`),
};

// 审计日志（平台系统管理员）
export interface AuditLogEntry {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  /** 2026-08-19：操作人姓名（后端已扁平化返回） */
  userName?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  /** 2026-08-19：实体业务编号（如 {SLUG}-{P}-{SEQ} / {WS}-TC-{seq}） */
  entityCode?: string | null;
  /** 2026-08-19：实体标题（code 为空时的可读兜底） */
  entityTitle?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
}
export interface AuditQueryResult {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}
export const auditApi = {
  query: (params: Record<string, string | undefined>) =>
    apiClient.get<AuditQueryResult>('/admin/audit-logs', { params }),
  exportCsv: (params?: Record<string, string | undefined>) =>
    apiClient.get('/admin/audit-logs/export', { params, responseType: 'blob' }),
};

// ============================================================
// P0：投票 + 评分 + 主题 + 反馈门户 (2026-08-14)
// ============================================================
export const votesApi = {
  vote: (wsId: string, entityType: string, entityId: string) =>
    apiClient.post(`/workspaces/${wsId}/votes`, { entityType, entityId }),
  unvote: (wsId: string, entityType: string, entityId: string) =>
    apiClient.delete(`/workspaces/${wsId}/votes`, { data: { entityType, entityId } }),
  counts: (wsId: string, entityType: string, ids: string[]) =>
    apiClient.get<Record<string, number>>(`/workspaces/${wsId}/votes/counts`, {
      params: { entityType, ids: ids.join(',') },
    }),
};

export interface ScoringConfig {
  model: 'RICE' | 'ICE' | 'CUSTOM';
  dimensions: { key: string; label: string; weight: number; scale: number }[];
}

export const scoresApi = {
  config: (wsId: string) =>
    apiClient.get<ScoringConfig>(`/workspaces/${wsId}/scores/config`),
  updateConfig: (wsId: string, data: Partial<ScoringConfig>) =>
    apiClient.put<ScoringConfig>(`/workspaces/${wsId}/scores/config`, data),
  save: (wsId: string, data: { entityType: string; entityId: string; model?: string; dimensions: Record<string, number> }) =>
    apiClient.post(`/workspaces/${wsId}/scores`, data),
  remove: (wsId: string, entityType: string, entityId: string) =>
    apiClient.delete(`/workspaces/${wsId}/scores`, { params: { entityType, entityId } }),
  get: (wsId: string, entityType: string, entityId: string) =>
    apiClient.get(`/workspaces/${wsId}/scores`, { params: { entityType, entityId } }),
  // I7 评分历史（趋势曲线）
  history: (wsId: string, entityType: string, entityId: string, take = 30) =>
    apiClient.get<Array<{ weightedScore: number; model: string; reach: number | null; createdAt: string }>>(
      `/workspaces/${wsId}/scores/history`,
      { params: { entityType, entityId, take } },
    ),
};

export interface Theme {
  id: string;
  workspaceId: string;
  title: string;
  description?: string | null;
  color?: string | null;
  linkedCount: number;
  voteCount: number;
  entities: { entityType: string; entityId: string; title: string }[];
  createdAt: string;
}

export const themesApi = {
  list: (wsId: string) => apiClient.get<Theme[]>(`/workspaces/${wsId}/themes`),
  create: (wsId: string, data: { title: string; description?: string; color?: string }) =>
    apiClient.post<Theme>(`/workspaces/${wsId}/themes`, data),
  update: (wsId: string, id: string, data: Partial<{ title: string; description: string; color: string }>) =>
    apiClient.patch<Theme>(`/workspaces/${wsId}/themes/${id}`, data),
  remove: (wsId: string, id: string) => apiClient.delete(`/workspaces/${wsId}/themes/${id}`),
  link: (wsId: string, id: string, entityType: string, entityId: string) =>
    apiClient.post(`/workspaces/${wsId}/themes/${id}/entities`, { entityType, entityId }),
  unlink: (wsId: string, id: string, entityType: string, entityId: string) =>
    apiClient.delete(`/workspaces/${wsId}/themes/${id}/entities`, { data: { entityType, entityId } }),
  promote: (wsId: string, id: string, targetType: 'FEATURE' | 'IDEA', releaseId?: string) =>
    apiClient.post(`/workspaces/${wsId}/themes/${id}/promote`, { targetType, releaseId }),
};

export interface FeedbackPortalItem {
  id: string;
  code?: string | null;
  title: string;
  description?: string | null;
  status: string;
  tags?: string[];
  voteCount: number;
  themes: string[];
  createdAt: string;
}
export interface FeedbackPortalView {
  workspaceName: string;
  requireEmail: boolean;
  target: 'SUPPORT' | 'IDEA';
  items: FeedbackPortalItem[];
}

export interface FeedbackPortalSettings {
  enabled: boolean;
  token: string | null;
  requireEmail: boolean;
  target: 'SUPPORT' | 'IDEA';
  portalUrl: string | null;
}

export const feedbackPortalApi = {
  view: (token: string) => apiClient.get<FeedbackPortalView>(`/feedback/${token}`),
  captcha: (token: string) =>
    apiClient.get<{ captchaId: string; question: string }>(`/feedback/${token}/captcha`),
  submit: (token: string, data: { title: string; description?: string; type?: string; voterEmail?: string; voterName?: string; captchaId: string; captchaAnswer: string }) =>
    apiClient.post(`/feedback/${token}`, data),
  vote: (token: string, data: { entityType: string; entityId: string; voterEmail?: string; voterName?: string; captchaId: string; captchaAnswer: string }) =>
    apiClient.post(`/feedback/${token}/vote`, data),
  // 工作区侧设置（ADMIN）
  settings: (wsId: string) =>
    apiClient.get<FeedbackPortalSettings>(`/workspaces/${wsId}/feedback-portal/settings`),
  updateSettings: (wsId: string, data: { enabled?: boolean; requireEmail?: boolean; target?: 'SUPPORT' | 'IDEA' }) =>
    apiClient.put<FeedbackPortalSettings>(`/workspaces/${wsId}/feedback-portal/settings`, data),
  regenerateToken: (wsId: string) =>
    apiClient.post<FeedbackPortalSettings>(`/workspaces/${wsId}/feedback-portal/token`),
};

// ===== 平台级 SMTP 配置（2026-08-21，REGISTRATION_ADMIN_EMAILS 管理）=====
export interface SmtpConfigView {
  configured: boolean;
  source: 'db' | 'env' | 'none';
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  hasPass: boolean;
}

export const smtpSettingsApi = {
  get: () => apiClient.get<SmtpConfigView>('/admin/settings/smtp'),
  save: (data: { host: string; port: number; user: string; pass?: string; from?: string }) =>
    apiClient.put<SmtpConfigView>('/admin/settings/smtp', data),
  sendTest: () => apiClient.post<{ ok: boolean; message: string }>('/admin/settings/smtp/test'),
};
