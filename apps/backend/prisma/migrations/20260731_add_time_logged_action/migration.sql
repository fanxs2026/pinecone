-- AlterEnum: ActionType 增加 TIME_LOGGED，用于在记录工时时向活动流写入审计记录
ALTER TYPE "ActionType" ADD VALUE 'TIME_LOGGED';
