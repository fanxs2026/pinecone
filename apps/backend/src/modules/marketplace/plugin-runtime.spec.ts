import { executePluginHook, validateManifest } from './plugin-runtime';

/**
 * P0 测试集（2026-08-19 上线前全检）：插件 vm 沙箱隔离（B2 回归）。
 * 负例：恶意插件尝试访问 process/require/宿主逃逸必须失败。
 */
describe('plugin-runtime sandbox (B2)', () => {
  it('sandbox has no process (escape attempt returns undefined/blocked)', async () => {
    const code = `
      module.exports = {
        async onEvent() {
          let probe;
          try { probe = typeof process; } catch (e) { probe = 'threw'; }
          return { probe };
        }
      };
    `;
    const out = await executePluginHook(code, 'onEvent', {});
    expect((out as any)?.probe).toBe('undefined');
  });

  it('constructor-chain escape attempt is contained (vm realm only)', async () => {
    const code = `
      module.exports = {
        async onEvent() {
          try {
            const fn = ({}).constructor.constructor;
            const res = fn('return process')();
            return { escaped: res && typeof res === 'object' ? 'LEAKED' : 'no-process' };
          } catch (e) {
            return { escaped: 'blocked:' + e.message };
          }
        }
      };
    `;
    const out = await executePluginHook(code, 'onEvent', {});
    // 在 vm 域内 process 未定义 → 构造函数抛 ReferenceError → 被 catch
    expect(String((out as any)?.escaped)).not.toContain('LEAKED');
  });

  it('plugin without implemented hook → undefined (no-op)', async () => {
    const out = await executePluginHook('module.exports = { other() { return 1; } };', 'onEvent', {});
    expect(out).toBeUndefined();
  });

  it('boot error surfaces as thrown Error', async () => {
    const code = `throw new Error('boom-at-boot');`;
    await expect(executePluginHook(code, 'onEvent', {})).rejects.toThrow('boom-at-boot');
  });

  it('console.log inside sandbox does not crash and returns result', async () => {
    const code = `
      module.exports = {
        async onEvent(ctx) {
          console.log('hello', ctx.eventName);
          return { url: undefined, done: true };
        }
      };
    `;
    const out = await executePluginHook(code, 'onEvent', { eventName: 'TEST.CREATED' });
    expect((out as any)?.done).toBe(true);
  });

  it('validateManifest rejects malformed manifests', () => {
    expect(validateManifest({ id: 'x' })).toBe(false);
    expect(validateManifest({ id: 'x', name: 'n', version: '1', description: 'd', hooks: [], code: 'c' })).toBe(true);
  });
});
