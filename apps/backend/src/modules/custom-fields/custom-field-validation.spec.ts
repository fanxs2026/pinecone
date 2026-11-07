import {
  DEFAULT_CUSTOM_FIELD_LIMIT,
  MAX_CUSTOM_FIELD_LIMIT,
  getCustomFieldLimit,
  isIsoDate,
  isTypeChangeAllowed,
  isValidFieldKey,
  normalizeCustomFields,
  parseOptions,
  type CustomFieldDef,
} from './custom-field-validation';

function def(overrides: Partial<CustomFieldDef> & Pick<CustomFieldDef, 'key' | 'type'>): CustomFieldDef {
  return {
    label: overrides.key,
    isRequired: false,
    isActive: true,
    ...overrides,
  };
}

describe('custom-field-validation', () => {
  describe('parseOptions', () => {
    it('丢弃结构不合法的选项', () => {
      expect(parseOptions([{ value: 'prod', label: '生产' }, { value: '' }, null, 'x'])).toEqual([
        { value: 'prod', label: '生产' },
      ]);
    });

    it('非数组输入返回空数组', () => {
      expect(parseOptions(null)).toEqual([]);
      expect(parseOptions({ value: 'a' })).toEqual([]);
    });

    it('缺少 label 时用 value 兜底', () => {
      expect(parseOptions([{ value: 'dev' }])).toEqual([{ value: 'dev', label: 'dev' }]);
    });
  });

  describe('isIsoDate', () => {
    it('接受合法日期', () => {
      expect(isIsoDate('2026-11-02')).toBe(true);
      expect(isIsoDate('2024-02-29')).toBe(true);
    });

    it('拒绝不存在的日期', () => {
      expect(isIsoDate('2026-02-30')).toBe(false);
      expect(isIsoDate('2025-02-29')).toBe(false);
      expect(isIsoDate('2026-13-01')).toBe(false);
    });

    it('拒绝非标准格式', () => {
      expect(isIsoDate('2026/11/02')).toBe(false);
      expect(isIsoDate('2026-11-2')).toBe(false);
    });
  });

  describe('isValidFieldKey', () => {
    it('接受小写字母开头与下划线数字', () => {
      expect(isValidFieldKey('affect_version')).toBe(true);
      expect(isValidFieldKey('env2')).toBe(true);
    });

    it('拒绝大写、数字开头与超长值', () => {
      expect(isValidFieldKey('Env')).toBe(false);
      expect(isValidFieldKey('2env')).toBe(false);
      expect(isValidFieldKey('a'.repeat(41))).toBe(false);
    });
  });

  describe('normalizeCustomFields', () => {
    it('丢弃未定义的 key', () => {
      const result = normalizeCustomFields([def({ key: 'env', type: 'TEXT' })], {
        env: '生产',
        unknown: 'x',
      }, { requireAll: true });
      expect(result.errors).toEqual([]);
      expect(result.value).toEqual({ env: '生产' });
    });

    it('文本类型做 trim，空串视为未填', () => {
      const result = normalizeCustomFields([def({ key: 'note', type: 'TEXT' })], { note: '  hi  ' }, {
        requireAll: true,
      });
      expect(result.value).toEqual({ note: 'hi' });

      const empty = normalizeCustomFields([def({ key: 'note', type: 'TEXT' })], { note: '   ' }, {
        requireAll: true,
      });
      expect(empty.value).toEqual({});
      expect(empty.errors).toEqual([]);
    });

    it('必填缺失时给出可读错误', () => {
      const result = normalizeCustomFields(
        [def({ key: 'customer', label: '客户名', type: 'TEXT', isRequired: true })],
        {},
        { requireAll: true },
      );
      expect(result.errors).toEqual(['「客户名」为必填项']);
    });

    it('requireAll 为 false 时不校验必填', () => {
      const result = normalizeCustomFields(
        [def({ key: 'customer', type: 'TEXT', isRequired: true })],
        {},
        { requireAll: false },
      );
      expect(result.errors).toEqual([]);
    });

    it('数字类型接受数字字符串并归一为 number', () => {
      const result = normalizeCustomFields([def({ key: 'n', type: 'NUMBER' })], { n: ' 12.5 ' }, {
        requireAll: true,
      });
      expect(result.value).toEqual({ n: 12.5 });
    });

    it('数字类型拒绝非数字', () => {
      const result = normalizeCustomFields([def({ key: 'n', type: 'NUMBER' })], { n: 'abc' }, {
        requireAll: true,
      });
      expect(result.errors.length).toBe(1);
    });

    it('单选必须命中选项', () => {
      const d = def({ key: 'env', type: 'SELECT', options: [{ value: 'prod' }, { value: 'dev' }] });
      expect(normalizeCustomFields([d], { env: 'prod' }, { requireAll: true }).value).toEqual({
        env: 'prod',
      });
      expect(normalizeCustomFields([d], { env: 'staging' }, { requireAll: true }).errors.length).toBe(1);
    });

    it('多选去重并校验每项', () => {
      const d = def({ key: 'tags', type: 'MULTI_SELECT', options: [{ value: 'a' }, { value: 'b' }] });
      expect(normalizeCustomFields([d], { tags: ['a', 'a', 'b'] }, { requireAll: true }).value).toEqual({
        tags: ['a', 'b'],
      });
      expect(normalizeCustomFields([d], { tags: ['a', 'z'] }, { requireAll: true }).errors.length).toBe(1);
    });

    it('链接类型要求 http/https', () => {
      const d = def({ key: 'doc', type: 'URL' });
      expect(normalizeCustomFields([d], { doc: 'https://example.com' }, { requireAll: true }).value).toEqual({
        doc: 'https://example.com',
      });
      expect(normalizeCustomFields([d], { doc: 'javascript:alert(1)' }, { requireAll: true }).errors.length).toBe(1);
      expect(normalizeCustomFields([d], { doc: 'example.com' }, { requireAll: true }).errors.length).toBe(1);
    });

    it('勾选类型只接受布尔值', () => {
      const d = def({ key: 'flag', type: 'CHECKBOX' });
      expect(normalizeCustomFields([d], { flag: false }, { requireAll: true }).value).toEqual({
        flag: false,
      });
      expect(normalizeCustomFields([d], { flag: 'true' }, { requireAll: true }).errors.length).toBe(1);
    });

    it('日期类型校验真实日历', () => {
      const d = def({ key: 'd', type: 'DATE' });
      expect(normalizeCustomFields([d], { d: '2026-11-02' }, { requireAll: true }).value).toEqual({
        d: '2026-11-02',
      });
      expect(normalizeCustomFields([d], { d: '2026-02-30' }, { requireAll: true }).errors.length).toBe(1);
    });

    it('一次返回全部错误，不是遇到第一个就停', () => {
      const result = normalizeCustomFields(
        [
          def({ key: 'a', label: 'A', type: 'TEXT', isRequired: true }),
          def({ key: 'b', label: 'B', type: 'NUMBER' }),
        ],
        { b: 'xx' },
        { requireAll: true },
      );
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('isTypeChangeAllowed', () => {
    it('同类型允许', () => {
      expect(isTypeChangeAllowed('TEXT', 'TEXT')).toBe(true);
    });

    it('文本族内互转允许', () => {
      expect(isTypeChangeAllowed('TEXT', 'URL')).toBe(true);
      expect(isTypeChangeAllowed('URL', 'TEXT')).toBe(true);
    });

    it('跨族变更拒绝', () => {
      expect(isTypeChangeAllowed('TEXT', 'NUMBER')).toBe(false);
      expect(isTypeChangeAllowed('SELECT', 'MULTI_SELECT')).toBe(false);
    });
  });

  describe('getCustomFieldLimit', () => {
    const original = process.env.CUSTOM_FIELD_LIMIT;

    afterEach(() => {
      if (original === undefined) delete process.env.CUSTOM_FIELD_LIMIT;
      else process.env.CUSTOM_FIELD_LIMIT = original;
    });

    it('未配置时取默认值', () => {
      delete process.env.CUSTOM_FIELD_LIMIT;
      expect(getCustomFieldLimit()).toBe(DEFAULT_CUSTOM_FIELD_LIMIT);
      expect(DEFAULT_CUSTOM_FIELD_LIMIT).toBe(20);
    });

    it('配置合法值时生效', () => {
      process.env.CUSTOM_FIELD_LIMIT = '35';
      expect(getCustomFieldLimit()).toBe(35);
    });

    it('非法值回退默认值', () => {
      process.env.CUSTOM_FIELD_LIMIT = 'abc';
      expect(getCustomFieldLimit()).toBe(DEFAULT_CUSTOM_FIELD_LIMIT);
      process.env.CUSTOM_FIELD_LIMIT = '0';
      expect(getCustomFieldLimit()).toBe(DEFAULT_CUSTOM_FIELD_LIMIT);
      process.env.CUSTOM_FIELD_LIMIT = '2.5';
      expect(getCustomFieldLimit()).toBe(DEFAULT_CUSTOM_FIELD_LIMIT);
    });

    it('超过天花板回退默认值', () => {
      process.env.CUSTOM_FIELD_LIMIT = String(MAX_CUSTOM_FIELD_LIMIT + 1);
      expect(getCustomFieldLimit()).toBe(DEFAULT_CUSTOM_FIELD_LIMIT);
    });

    it('允许取到天花板', () => {
      process.env.CUSTOM_FIELD_LIMIT = String(MAX_CUSTOM_FIELD_LIMIT);
      expect(getCustomFieldLimit()).toBe(MAX_CUSTOM_FIELD_LIMIT);
    });
  });
});
