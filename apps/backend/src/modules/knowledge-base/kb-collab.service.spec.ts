import { KbCollabService } from './kb-collab.service';

/**
 * P0 测试集（2026-08-19 上线前全检）：KB 协同房间授权（I13）——
 * 跨工作区拒绝 / 非成员拒绝 / 成员放行 / 无 userId 拒绝。mock Prisma，不连 WS/DB。
 */
describe('KbCollabService.authorizeCollab (I13)', () => {
  let service: any;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      kbPage: { findUnique: jest.fn() },
      workspaceMember: { findFirst: jest.fn() },
    };
    service = new KbCollabService({} as any, prisma);
  });

  it('rejects when page does not exist', async () => {
    prisma.kbPage.findUnique.mockResolvedValue(null);
    await expect(service.authorizeCollab('u1', 'p1')).resolves.toBe(false);
  });

  it('rejects cross-workspace user (not a member)', async () => {
    prisma.kbPage.findUnique.mockResolvedValue({ workspaceId: 'ws-A' });
    prisma.workspaceMember.findFirst.mockResolvedValue(null);
    await expect(service.authorizeCollab('u1', 'p1')).resolves.toBe(false);
  });

  it('allows workspace member', async () => {
    prisma.kbPage.findUnique.mockResolvedValue({ workspaceId: 'ws-A' });
    prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'm1' });
    await expect(service.authorizeCollab('u1', 'p1')).resolves.toBe(true);
  });

  it('rejects when userId missing (no JWT payload)', async () => {
    await expect(service.authorizeCollab(undefined, 'p1')).resolves.toBe(false);
  });
});
