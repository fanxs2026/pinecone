'use strict';
/**
 * 任意数据库 ↔ prisma/schema.prisma 结构比对。
 *
 * 用途：把「库表结构」变成可验证的东西，而不是靠人看。
 *   · 开发库：node scripts/verify-db-schema.js
 *   · 任意库：PINE_VERIFY_DATABASE_URL=postgres://... node scripts/verify-db-schema.js
 *
 * 比对维度：表 / 列名 / 列类型 / 可空性 / 普通索引 / 唯一约束 / 外键 / 枚举值
 * 退出码：0 = 一致，1 = 有差异
 */
const fs = require('fs');
const path = require('path');
const { parsePrisma, expectPgType, normType } = require('./lib/prisma-schema');

const ROOT = path.resolve(__dirname, '..');

function readEnv() {
  const file = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 1) continue;
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function dbType(c) {
  if (c.data_type === 'ARRAY') return c.udt_name.replace(/^_/, '') + '[]';
  if (c.data_type === 'USER-DEFINED') return 'public."' + c.udt_name + '"';
  if (c.data_type === 'character varying' && c.character_maximum_length) {
    return 'character varying(' + c.character_maximum_length + ')';
  }
  if (c.data_type === 'character' && c.character_maximum_length) {
    return 'character(' + c.character_maximum_length + ')';
  }
  if (c.data_type === 'numeric' && c.numeric_precision) {
    return 'numeric(' + c.numeric_precision + ',' + (c.numeric_scale == null ? 0 : c.numeric_scale) + ')';
  }
  if (c.data_type === 'timestamp without time zone') {
    return 'timestamp(' + (c.datetime_precision == null ? 6 : c.datetime_precision) + ') without time zone';
  }
  if (c.data_type === 'timestamp with time zone') {
    return 'timestamp(' + (c.datetime_precision == null ? 6 : c.datetime_precision) + ') with time zone';
  }
  if (c.data_type === 'time without time zone') {
    return 'time(' + (c.datetime_precision == null ? 6 : c.datetime_precision) + ') without time zone';
  }
  return c.data_type;
}

(async () => {
  const argUrl = process.argv.find((a) => a.startsWith('--url='));
  const url =
    (argUrl && argUrl.slice(6)) ||
    process.env.PINE_VERIFY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    readEnv().DATABASE_URL;
  if (!url) { console.error('缺少数据库连接串（--url= / PINE_VERIFY_DATABASE_URL / .env DATABASE_URL）'); process.exit(1); }

  const { requirePg } = require('./lib/pg');
  const pg = requirePg(ROOT);
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const { models, enums } = parsePrisma(fs.readFileSync(path.join(ROOT, 'apps', 'backend', 'prisma', 'schema.prisma'), 'utf8'));

  const tblRows = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
  );
  const dbTables = new Set(tblRows.rows.map((r) => r.table_name));

  const colRows = await client.query(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable,
            character_maximum_length, numeric_precision, numeric_scale, datetime_precision
       FROM information_schema.columns WHERE table_schema='public'`,
  );
  const dbCols = {}; // table -> { col: {...} }
  for (const r of colRows.rows) {
    (dbCols[r.table_name] || (dbCols[r.table_name] = {}))[r.column_name] = r;
  }

  const idxRows = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`);
  const dbIndexes = new Set(idxRows.rows.map((r) => r.indexname));

  const conRows = await client.query(
    `SELECT contype, conname FROM pg_constraint WHERE connamespace='public'::regnamespace`,
  );
  const dbUniques = new Set();
  const dbPks = new Set();
  for (const r of conRows.rows) {
    if (r.contype === 'u') dbUniques.add(r.conname);
    if (r.contype === 'p') dbPks.add(r.conname);
  }

  const fkRows = await client.query(
    `SELECT c.conname AS name,
            (SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attnum=c.conkey[1]) AS col,
            c.confrelid::regclass::text AS ref_table,
            (SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.confrelid AND a.attnum=c.confkey[1]) AS ref_col,
            c.convalidated AS validated
       FROM pg_constraint c
      WHERE c.contype='f' AND c.connamespace='public'::regnamespace`,
  );
  const dbFks = new Map();
  for (const r of fkRows.rows) dbFks.set(r.name, r);

  const enumRows = await client.query(
    `SELECT t.typname AS name, e.enumlabel AS label
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname='public'
      ORDER BY t.typname, e.enumsortorder`,
  );
  const dbEnums = {};
  for (const r of enumRows.rows) (dbEnums[r.name] || (dbEnums[r.name] = [])).push(r.label);

  const problems = [];

  for (const [model, d] of Object.entries(models)) {
    const table = d.table;
    if (!dbTables.has(table)) { problems.push('[缺表] ' + table + '（model ' + model + '）'); continue; }
    const cols = dbCols[table] || {};

    for (const f of d.columns) {
      const c = cols[f.col];
      if (!c) { problems.push('[缺列] ' + table + '.' + f.col); continue; }

      const expect = expectPgType(f);
      const actual = dbType(c);
      if (normType(expect) !== normType(actual)) {
        problems.push('[类型] ' + table + '.' + f.col + ' 应为 ' + expect + '，实际 ' + actual);
      }

      // Prisma 的 list 字段（String[]）不产生 NOT NULL 约束，因此数组列不比对可空性
      if (!f.isArray) {
        const isNullable = c.is_nullable === 'YES';
        if (f.isOptional !== isNullable) {
          problems.push('[可空] ' + table + '.' + f.col + ' 应' + (f.isOptional ? '可空' : '非空') + '，实际' + (isNullable ? '可空' : '非空'));
        }
      }
    }

    for (const ix of d.expectIndexes) {
      if (!dbIndexes.has(ix.name)) problems.push('[缺索引] ' + ix.name);
    }
    for (const uq of d.expectUniques) {
      if (!dbIndexes.has(uq.name) && !dbUniques.has(uq.name)) problems.push('[缺唯一约束] ' + uq.name);
    }
    if (!dbPks.has(table + '_pkey')) problems.push('[缺主键] ' + table + '_pkey');

    for (const fk of d.expectFks) {
      const got = dbFks.get(fk.name);
      if (!got) { problems.push('[缺外键] ' + fk.name + '（' + table + '.' + fk.col + ' → ' + fk.refTable + '.' + fk.refCol + '）'); continue; }
      const refTable = got.ref_table.replace(/^public\./, '');
      if (got.col !== fk.col || refTable !== fk.refTable || got.ref_col !== fk.refCol) {
        problems.push('[外键不符] ' + fk.name + ' 期望 ' + fk.col + '→' + fk.refTable + '.' + fk.refCol +
          '，实际 ' + got.col + '→' + refTable + '.' + got.ref_col);
      }
      if (got.validated === false) problems.push('[外键未校验] ' + fk.name + '（NOT VALID）');
    }
  }

  for (const [name, vals] of Object.entries(enums)) {
    const actual = dbEnums[name];
    if (!actual) { problems.push('[缺枚举] public."' + name + '"'); continue; }
    const miss = vals.filter((v) => !actual.includes(v));
    if (miss.length) problems.push('[枚举缺值] ' + name + ': ' + miss.join(', '));
  }

  const shown = url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
  console.log('目标库: ' + shown);
  console.log('模型 ' + Object.keys(models).length + ' / 表 ' + dbTables.size + ' / 枚举 ' + Object.keys(enums).length);

  await client.end();

  if (problems.length) {
    console.error('');
    console.error('发现 ' + problems.length + ' 处不一致：');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('OK — 库结构与 prisma/schema.prisma 完全一致');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
