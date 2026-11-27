'use strict';
/**
 * 便携版建库快照校验：scripts/portable/db/schema.sql 必须覆盖 prisma/schema.prisma 的
 * 全部物理结构。
 *
 * 为什么需要：便携版（Windows 包）不走 `prisma migrate deploy`，而是执行一份 pg_dump 快照。
 * 快照一旦落后于迁移，部署库就缺列 / 缺表 / 列类型不符，运行期表现为
 * `P2022: column ... does not exist` → 前端统一 internal server error，
 * 而且报错点离「建库」很远，极难定位。
 *
 * 实测事故（2026-11-26）：
 *   ① supports/features/stories 缺 due_date、saved_views 整表缺失 → 新建支持请求 500
 *   ② 4 张表 14 个列 text/uuid 不符 → 9 个外键建不出来
 *
 * 检查维度：表 / 列 / 列类型 / 普通索引 / 唯一约束 / 外键 / 枚举值
 * 同时识别 schema.sql 末尾「增量补齐区」的写法（ADD COLUMN / ALTER COLUMN TYPE / DO 块 FK）。
 *
 * 退出码：0 = 一致；1 = 有缺口（CI / verify.bat 应阻断）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRISMA_FILE = path.join(ROOT, 'apps', 'backend', 'prisma', 'schema.prisma');
const SQL_FILE = path.join(ROOT, 'scripts', 'portable', 'db', 'schema.sql');

const SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);

// ---------------------------------------------------------------- prisma

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
      (f) => !modelNames.has(f.rawType) && (SCALARS.has(f.rawType) || enums[f.rawType]) && !f.isArray,
    );
    d.relations = d.fields.filter((f) => modelNames.has(f.rawType) && !f.isArray && /@relation/.test(f.line));
    d.colMap = {};
    for (const f of d.fields) d.colMap[f.name] = f.col;
  }
  return { models, enums };
}

function expectPgType(f) {
  if (f.rawType === 'String') {
    if (f.native === 'Uuid') return 'uuid';
    if (f.native === 'VarChar') return 'character varying';
    if (f.native === 'Char') return 'character';
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
    if (f.native === 'Timestamptz') return 'timestamp with time zone';
    if (f.native === 'Time') return 'time';
    return 'timestamp(3) without time zone';
  }
  if (f.rawType === 'Json') return 'jsonb';
  if (f.rawType === 'Bytes') return 'bytea';
  return 'public."' + f.rawType + '"';
}

// ---------------------------------------------------------------- sql

/** 去掉行注释，避免注释里的示例语句被误解析 */
function stripComments(src) {
  return src.replace(/--[^\n]*/g, '');
}

function parseSql(rawSrc) {
  const src = stripComments(rawSrc);
  const tables = {};
  const types = {};
  const indexes = new Set();
  const constraints = new Set();

  const re = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\."?(\w+)"?\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(src))) {
    const table = m[1];
    tables[table] = [];
    types[table] = {};
    for (const line of m[2].split(/\r?\n/)) {
      const t = line.trim();
      if (!t || /^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(t)) continue;
      const c = t.match(/^"?(\w+)"?\s+(.+)$/);
      if (!c) continue;
      const col = c[1];
      // 类型 = 到 DEFAULT / NOT NULL / PRIMARY KEY / REFERENCES / COLLATE 之前的部分
      const typeStr = c[2]
        .split(/\s+(?:DEFAULT|NOT\s+NULL|PRIMARY\s+KEY|REFERENCES|COLLATE|GENERATED)\b/i)[0]
        .replace(/,\s*$/, '')
        .trim();
      tables[table].push(col);
      types[table][col] = typeStr;
    }
  }

  // 增量补齐区：ADD COLUMN / ALTER COLUMN ... TYPE
  for (const stmt of src.split(/;\s*(?:\r?\n|$)/)) {
    const tm = stmt.match(/ALTER TABLE\s+(?:ONLY\s+)?public\."?(\w+)"?\s+([\s\S]*)/);
    if (!tm) continue;
    const table = tm[1];
    const body = tm[2];
    if (!tables[table]) { tables[table] = []; types[table] = {}; }
    for (const a of body.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?\s+([^,;\n]+)/gi)) {
      if (!tables[table].includes(a[1])) tables[table].push(a[1]);
      types[table][a[1]] = a[2].trim();
    }
    for (const a of body.matchAll(/ALTER COLUMN\s+"?(\w+)"?\s+TYPE\s+(.+?)(?:\s+USING\b|,|\n|$)/gi)) {
      types[table][a[1]] = a[2].trim();
    }
  }

  for (const im of src.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?"?([\w]+)"?\s+ON\s+public\."?(\w+)"?/gi)) {
    indexes.add(im[1]);
  }
  for (const cm of src.matchAll(/ADD CONSTRAINT\s+"?([\w]+)"?/gi)) constraints.add(cm[1]);

  // DO 块里动态添加的外键：('table', 'col', 'refTable', 'refCol', 'CASCADE')
  const dynamicFks = [];
  for (const fm of src.matchAll(/\('(\w+)',\s*'(\w+)',\s*'(\w+)',\s*'(\w+)',\s*'[A-Z ]+'\)/g)) {
    dynamicFks.push({ table: fm[1], col: fm[2] });
  }

  const enumValues = {};
  for (const tm of src.matchAll(/CREATE TYPE public\."(\w+)" AS ENUM \(([\s\S]*?)\);/g)) {
    enumValues[tm[1]] = [...tm[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }

  return { tables, types, indexes, constraints, dynamicFks, enumValues };
}

// ---------------------------------------------------------------- compare

function normType(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/public\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const { models, enums } = parsePrisma(fs.readFileSync(PRISMA_FILE, 'utf8'));
const sql = parseSql(fs.readFileSync(SQL_FILE, 'utf8'));

const problems = [];
const dynamicFkKeys = new Set(sql.dynamicFks.map((x) => x.table + '|' + x.col));

for (const [model, d] of Object.entries(models)) {
  const table = d.table;
  const cols = sql.tables[table];
  if (!cols) { problems.push('缺表 public.' + table + '（model ' + model + '）'); continue; }

  const missing = d.columns.filter((c) => !cols.includes(c.col)).map((c) => c.col);
  if (missing.length) problems.push('缺列 public.' + table + ': ' + missing.join(', '));

  for (const f of d.columns) {
    const actual = sql.types[table] && sql.types[table][f.col];
    if (!actual) continue;
    const expect = expectPgType(f);
    if (normType(expect) !== normType(actual)) {
      problems.push('列类型不符 public.' + table + '.' + f.col + ': 应为 ' + expect + '，实际 ' + actual);
    }
  }

  for (const a of d.attrs) {
    const um = a.match(/^@@unique\(\[([^\]]+)\]/);
    if (um) {
      const phys = um[1].split(',').map((s) => s.trim().replace(/\(.*\)$/, '')).map((n) => d.colMap[n] || n);
      const nm = table + '_' + phys.join('_') + '_key';
      if (!sql.indexes.has(nm) && !sql.constraints.has(nm)) problems.push('缺唯一约束 ' + nm);
    }
    const ixm = a.match(/^@@index\(\[([^\]]+)\]/);
    if (ixm) {
      const phys = ixm[1].split(',').map((s) => s.trim().replace(/\(.*\)$/, '')).map((n) => d.colMap[n] || n);
      const nm = table + '_' + phys.join('_') + '_idx';
      if (!sql.indexes.has(nm)) problems.push('缺索引 ' + nm);
    }
  }

  for (const f of d.columns) {
    if (f.isUnique && !f.isId) {
      const nm = table + '_' + f.col + '_key';
      if (!sql.indexes.has(nm) && !sql.constraints.has(nm)) problems.push('缺唯一约束 ' + nm);
    }
  }

  for (const rel of d.relations) {
    const colsM = rel.line.match(/fields:\s*\[([^\]]+)\]/);
    if (!colsM) continue;
    for (const cn of colsM[1].split(',').map((s) => s.trim())) {
      const col = d.colMap[cn] || cn;
      const nm = table + '_' + col + '_fkey';
      const ok = sql.constraints.has(nm) || dynamicFkKeys.has(table + '|' + col);
      if (!ok) problems.push('缺外键 ' + nm);
    }
  }
}

for (const [name, vals] of Object.entries(enums)) {
  const sv = sql.enumValues[name];
  if (!sv) { problems.push('缺枚举类型 public."' + name + '"'); continue; }
  const miss = vals.filter((v) => !sv.includes(v));
  if (miss.length) problems.push('枚举缺值 ' + name + ': ' + miss.join(', '));
}

if (problems.length) {
  console.error('[portable-schema] schema.sql 与 prisma/schema.prisma 不一致（' + problems.length + ' 处）：');
  for (const p of problems) console.error('  - ' + p);
  console.error('');
  console.error('修复：在 scripts/portable/db/schema.sql 末尾「增量补齐区」追加等价幂等 DDL，');
  console.error('      并在 scripts/portable/db/patches/ 放一份补丁供存量库升级。');
  process.exit(1);
}

console.log(
  '[portable-schema] OK — 结构与 prisma 模型一致（' +
    Object.keys(models).length + ' models / ' +
    Object.keys(sql.tables).length + ' tables / ' +
    Object.keys(enums).length + ' enums）',
);
