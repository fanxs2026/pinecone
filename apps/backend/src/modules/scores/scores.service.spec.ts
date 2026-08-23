import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ScoresService 单元测试（P2-6，2026-08-22）：评分保存/读取闭环 + 校验。
 * 用 jest.fn() mock PrismaService，不连真实 DB。
 * 与 scores.service.ts 的 as any 清理（P2-5）配对——行为不变的前提下提升类型与覆盖。
 */

function makePrismaMock() {
  return {
    workspace: { findUnique: jest.fn(), update: jest.fn() },
    vote: { count: jest.fn(), groupBy: jest.fn() },
    score: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    scoreHistory: { findMany: jest.fn(), create: jest.fn() },
    idea: { findFirst: jest.fn() },
    support: { findFirst: jest.fn() },
    feature: { findFirst: jest.fn() },
  } as unknown as PrismaService;
}

describe('ScoresService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: ScoresService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new ScoresService(prisma);
    jest.clearAllMocks();
  });

  describe('upsert', () => {
    it('非法 entityType → BadRequestException', async () => {
      await expect(
        service.upsert('ws', { entityType: 'BUG', entityId: 'e1', dimensions: {} }),
      ).rejects.toThrow(BadRequestException);
    });

    it('实体不存在 → NotFoundException', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.idea.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.support.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.feature.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.upsert('ws', { entityType: 'IDEA', entityId: 'missing', dimensions: {} }),
      ).rejects.toThrow(NotFoundException);
    });

    it('RICE 未手动填 reach → 自动取票数并标记 _reachAuto', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        scoringConfig: { model: 'RICE', dimensions: [] },
      });
      (prisma.idea.findFirst as jest.Mock).mockResolvedValue({ id: 'e1' });
      (prisma.vote.count as jest.Mock).mockResolvedValue(42);
      (prisma.score.upsert as jest.Mock).mockResolvedValue({
        id: 's1',
        model: 'RICE',
        weightedScore: 0,
        dimensions: {},
      });
      (prisma.scoreHistory.create as jest.Mock).mockResolvedValue({});

      const res = await service.upsert('ws', {
        entityType: 'IDEA',
        entityId: 'e1',
        // 不传 reach → 触发 RICE 自动取票数（reach:0 会被视为手动填写，不触发）
        dimensions: { impact: 3 },
      });

      expect(prisma.vote.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws', entityType: 'IDEA', entityId: 'e1' } }),
      );
      const callArgs = (prisma.score.upsert as jest.Mock).mock.calls[0][0];
      expect(callArgs.create.dimensions.reach).toBe(42);
      expect(callArgs.create.dimensions._reachAuto).toBe(true);
      // 返回体带加权分且未暴露内部标记
      expect(typeof res.weightedScore).toBe('number');
      expect((res as Record<string, unknown>)._reachAuto).toBeUndefined();
    });

    it('手动填 reach → 不覆盖、不标 _reachAuto', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        scoringConfig: { model: 'RICE', dimensions: [] },
      });
      (prisma.idea.findFirst as jest.Mock).mockResolvedValue({ id: 'e1' });
      (prisma.vote.count as jest.Mock).mockResolvedValue(999);
      (prisma.score.upsert as jest.Mock).mockResolvedValue({
        id: 's1',
        model: 'RICE',
        weightedScore: 0,
        dimensions: {},
      });
      (prisma.scoreHistory.create as jest.Mock).mockResolvedValue({});

      await service.upsert('ws', {
        entityType: 'IDEA',
        entityId: 'e1',
        dimensions: { reach: 100, impact: 3 },
      });

      const callArgs = (prisma.score.upsert as jest.Mock).mock.calls[0][0];
      expect(callArgs.create.dimensions.reach).toBe(100);
      expect(callArgs.create.dimensions._reachAuto).toBeUndefined();
    });
  });

  describe('updateConfig', () => {
    it('拒绝非法的 dimension weight', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.updateConfig('ws', {
          dimensions: [{ key: 'impact', label: 'I', weight: -1, scale: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('合法配置写回 workspace.scoringConfig', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});
      const next = await service.updateConfig('ws', {
        model: 'ICE',
        dimensions: [{ key: 'impact', label: 'Impact', weight: 1, scale: 1 }],
      });
      expect(next.model).toBe('ICE');
      expect(prisma.workspace.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { scoringConfig: expect.objectContaining({ model: 'ICE' }) } }),
      );
    });
  });

  describe('history', () => {
    it('从 dimensions 提取 reach', async () => {
      (prisma.scoreHistory.findMany as jest.Mock).mockResolvedValue([
        { weightedScore: 10, model: 'RICE', dimensions: { reach: 5 }, createdAt: new Date() },
      ]);
      const rows = await service.history('IDEA', 'e1');
      expect(rows[0].reach).toBe(5);
    });
  });

  describe('remove', () => {
    it('按 entityType/entityId 删除', async () => {
      (prisma.score.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      const res = await service.remove('ws', 'IDEA', 'e1');
      expect(prisma.score.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws', entityType: 'IDEA', entityId: 'e1' },
      });
      expect(res).toEqual({ ok: true });
    });
  });
});
