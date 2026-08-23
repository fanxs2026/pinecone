import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { EnterpriseFeatureGuard } from './common/guards/enterprise-feature.guard';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ReleasesModule } from './modules/releases/releases.module';
import { IdeasModule } from './modules/ideas/ideas.module';
import { FeaturesModule } from './modules/features/features.module';
import { StoriesModule } from './modules/stories/stories.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { CommentsModule } from './modules/comments/comments.module';
import { RelationsModule } from './modules/relations/relations.module';
import { SupportsModule } from './modules/supports/supports.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TodoItemsModule } from './modules/todo-items/todo-items.module';
import { RegistrationAdminModule } from './modules/registration-admin/registration-admin.module';
import { EventsModule } from './modules/events/events.module';
import { TestCasesModule } from './modules/test-cases/test-cases.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { ImportsModule } from './modules/imports/imports.module';
import { TestAutomationModule } from './modules/test-automation/test-automation.module';
import { TestPlansModule } from './modules/test-plans/test-plans.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { SearchModule } from './modules/search/search.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { ShareModule } from './modules/share/share.module';
import { VotesModule } from './modules/votes/votes.module';
import { ScoresModule } from './modules/scores/scores.module';
import { ThemesModule } from './modules/themes/themes.module';
import { FeedbackPortalModule } from './modules/feedback-portal/feedback-portal.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { AutomationModule } from './modules/automation/automation.module';
import { ScheduleModule } from '@nestjs/schedule';
import { getEnterpriseModules } from './ee-gate';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule, AuthModule, WorkspacesModule,
    IdeasModule, ReleasesModule, FeaturesModule, StoriesModule,
    WorkflowsModule, TimeTrackingModule, RealtimeModule,
    ActivitiesModule, CommentsModule, RelationsModule, SupportsModule,
    UploadsModule, KnowledgeBaseModule, DashboardModule, TodoItemsModule, RegistrationAdminModule,
    EventsModule, TestCasesModule, MarketplaceModule, ImportsModule, TestAutomationModule, SprintsModule, SearchModule, ReportsModule, DashboardsModule, ShareModule, VotesModule, ScoresModule, ThemesModule, FeedbackPortalModule, NotificationsModule, TelemetryModule, TestPlansModule, AutomationModule,
    // 企业版模块：社区版（默认）下 getEnterpriseModules() 返回空数组，编译产物不含企业实现
    ...getEnterpriseModules(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global rate limiting (100 req/min per IP by default; auth endpoints are
    // tightened further via @Throttle on AuthController)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Phase 0-1: 全局默认拒绝认证——所有未标 @Public() 的端点要求有效 JWT，
    // 新模块不会因漏写守卫而裸奔（安全官 P0-1）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 企业版功能开关（社区版部署 → 标记 @EnterpriseFeature 的端点 403）
    { provide: APP_GUARD, useClass: EnterpriseFeatureGuard },
  ],
})
export class AppModule {}
