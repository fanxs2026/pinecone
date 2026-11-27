'use strict';
/**
 * Prisma schema 解析（供 verify-* 系列脚本共用）。
 *
 * 只关心「物理结构」：表名、列名、列类型、可空性、唯一约束、普通索引、外键、枚举值。
 * 关系字段（类型为另一个 model）会被剔除，只保留标量列与枚举列。
 */
const SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);

function parsePrisma(src) {
  const models = {};
  const enums = {};
  let cur = null;
  let curEnum = null;

  for (const line of src.split(/\r?\n/)) {
    const em = line.match(/^enum\s+(\w+)\s*\{/);
    if (em) { curEnum = em[1]; enums[curEnum] = []; continue; }
    const mm = line.match(/^model\s+(\w+)\s*\{/);
    if (mm) { cur = mm[1]; models[cur] = { table: mm[1], fields: [], attrs: [] }; continue; }
    if (/^\}/.test(line)) { cur = null; curEnum = null; continue; }
    if (curEnum) {
      const v = line.trim().match(/^([A-Z_][A-Z0-9_]*)$/);
      if (v) enums[curEnum].push(v[1]);
      continue;
    }
    if (!cur) continue;

    const mapm = line.match(/@@map\("([^"]+)"\)/);
    if (mapm) { models[cur].table = mapm[1]; continue; }
    if (/^\s*@@/.test(line)) { models[cur].attrs.push(line.trim()); continue; }

    const f = line.match(/^\s*(\w+)\s+([\w.]+)(\[\])?(\?)?(.*)$/);
    if (!f) continue;
    const mapped = f[5].match(/@map\("([^"]+)"\)/);
    models[cur].fields.push({
      name: f[1],
      rawType: f[2],
      isArray: !!f[3],
      isOptional: !!f[4],
      col: mapped ? mapped[1] : f[1],
      native: (f[5].match(/@db\.(\w+)/) || [])[1] || null,
      nativeArgs: (f[5].match(/@db\.\w+\(([^)]*)\)/) || [])[1] || null,
      isId: /@id\b/.test(f[5]),
      isUnique: /@unique\b/.test(f[5]),
      line: line.trim(),
    });
  }

  const modelNames = new Set(Object.keys(models));
  for (const d of Object.values(models)) {
    d.columns = d.fields.filter(
      (f) => !modelNames.has(f.rawType) && (SCALARS.has(f.rawType) || enums[f.rawType]),
    );
    d.relations = d.fields.filter((f) => modelNames.has(f.rawType) && !f.isArray && /@relation/.test(f.line));
    d.colMap = {};
    for (const f of d.fields) d.colMap[f.name] = f.col;
    // 期望的索引
    d.expectIndexes = [];
    d.expectUniques = [];
    for (const a of d.attrs) {
      const um = a.match(/^@@unique\(\[([^\]]+)\]/);
      if (um) {
        const phys = um[1].split(',').map((s) => s.trim().replace(/\(.*\)$/, '')).map((n) => d.colMap[n] || n);
        d.expectUniques.push({ name: d.table + '_' + phys.join('_') + '_key', cols: phys });
      }
      const ixm = a.match(/^@@index\(\[([^\]]+)\]/);
      if (ixm) {
        const phys = ixm[1].split(',').map((s) => s.trim().replace(/\(.*\)$/, '')).map((n) => d.colMap[n] || n);
        d.expectIndexes.push({ name: d.table + '_' + phys.join('_') + '_idx', cols: phys });
      }
    }
    for (const f of d.columns) {
      if (f.isUnique && !f.isId) d.expectUniques.push({ name: d.table + '_' + f.col + '_key', cols: [f.col] });
    }
    // 期望的外键在第二阶段计算（引用的 model 可能还没轮到）
    d.expectFks = [];
  }

  // 第二阶段：外键（此时所有 model 的 colMap / table 都已就绪）
  for (const d of Object.values(models)) {
    for (const rel of d.relations) {
      const m = rel.line.match(/fields:\s*\[([^\]]+)\].*?references:\s*\[([^\]]+)\]/);
      if (!m) continue;
      const fromCols = m[1].split(',').map((s) => s.trim()).map((n) => d.colMap[n] || n);
      const toCols = m[2].split(',').map((s) => s.trim());
      const refModel = rel.rawType;
      const refTable = models[refModel] ? models[refModel].table : refModel;
      for (let i = 0; i < fromCols.length; i++) {
        d.expectFks.push({
          name: d.table + '_' + fromCols[i] + '_fkey',
          col: fromCols[i],
          refTable,
          refCol: models[refModel] ? (models[refModel].colMap[toCols[i]] || toCols[i]) : toCols[i],
        });
      }
    }
  }

  return { models, enums };
}

/** Prisma 字段 → PostgreSQL 类型字符串（与 information_schema 的读法对齐） */
function expectPgType(f) {
  const base = expectPgScalar(f);
  return f.isArray ? base + '[]' : base;
}

function expectPgScalar(f) {
  if (f.rawType === 'String') {
    if (f.native === 'Uuid') return 'uuid';
    if (f.native === 'VarChar') return f.nativeArgs ? 'character varying(' + f.nativeArgs.replace(/\s+/g, '') + ')' : 'character varying';
    if (f.native === 'Char') return f.nativeArgs ? 'character(' + f.nativeArgs.replace(/\s+/g, '') + ')' : 'character';
    return 'text';
  }
  if (f.rawType === 'Int') return 'integer';
  if (f.rawType === 'BigInt') return 'bigint';
  if (f.rawType === 'Float') return 'double precision';
  if (f.rawType === 'Decimal') {
    if (f.nativeArgs) return 'numeric(' + f.nativeArgs.replace(/\s+/g, '') + ')';
    return 'numeric';
  }
  if (f.rawType === 'Boolean') return 'boolean';
  if (f.rawType === 'DateTime') {
    if (f.native === 'Date') return 'date';
    if (f.native === 'Timestamptz') return 'timestamp(3) with time zone';
    if (f.native === 'Time') return 'time(3) without time zone';
    return 'timestamp(3) without time zone';
  }
  if (f.rawType === 'Json') return 'jsonb';
  if (f.rawType === 'Bytes') return 'bytea';
  return 'public."' + f.rawType + '"';
}

function normType(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/public\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { parsePrisma, expectPgType, normType, SCALARS };
