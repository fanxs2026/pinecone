import { parseEntityFilter } from './entity-filter';

describe('parseEntityFilter', () => {
  it('空值与非法 JSON 一律视为无筛选', () => {
    expect(parseEntityFilter(undefined)).toBeNull();
    expect(parseEntityFilter('')).toBeNull();
    expect(parseEntityFilter('   ')).toBeNull();
    expect(parseEntityFilter('{bad json')).toBeNull();
    expect(parseEntityFilter('[]')).toBeNull();
    expect(parseEntityFilter('"str"')).toBeNull();
  });

  it('解析状态与优先级数组', () => {
    const f = parseEntityFilter(JSON.stringify({ status: ['OPEN', 'DONE'], priority: ['P1'] }));
    expect(f?.status).toEqual(['OPEN', 'DONE']);
    expect(f?.priority).toEqual(['P1']);
  });

  it('单值自动包成数组', () => {
    const f = parseEntityFilter(JSON.stringify({ status: 'OPEN' }));
    expect(f?.status).toEqual(['OPEN']);
  });

  it('去重并丢弃非字符串项', () => {
    const f = parseEntityFilter(JSON.stringify({ status: ['OPEN', 'OPEN', 1, null, 'DONE'] }));
    expect(f?.status).toEqual(['OPEN', 'DONE']);
  });

  it('保留未指派特殊值', () => {
    const f = parseEntityFilter(JSON.stringify({ assigneeId: ['unassigned', 'u1'] }));
    expect(f?.assigneeId).toEqual(['unassigned', 'u1']);
  });

  it('过滤不合法的自定义属性 key', () => {
    const f = parseEntityFilter(
      JSON.stringify({
        customFields: { env: ['prod'], 'Bad-Key': ['x'], '1abc': ['y'] },
      }),
    );
    expect(f?.customFields).toEqual({ env: ['prod'] });
  });

  it('自定义属性值类型不限字符串', () => {
    const f = parseEntityFilter(JSON.stringify({ customFields: { score: [3], flag: [true] } }));
    expect(f?.customFields?.score).toEqual([3]);
    expect(f?.customFields?.flag).toEqual([true]);
  });

  it('未知字段被忽略', () => {
    const f = parseEntityFilter(JSON.stringify({ unknown: ['x'], status: ['OPEN'] }));
    expect(f).toEqual({ status: ['OPEN'] });
  });

  it('无有效条件时返回 null', () => {
    expect(parseEntityFilter(JSON.stringify({ status: [] }))).toBeNull();
    expect(parseEntityFilter(JSON.stringify({ customFields: {} }))).toBeNull();
  });

  it('超长输入直接放弃解析', () => {
    const huge = JSON.stringify({ status: ['A'.repeat(9000)] });
    expect(parseEntityFilter(huge)).toBeNull();
  });
});
