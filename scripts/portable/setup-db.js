'use strict';
/**
 * Pinecone portable edition - first-run database setup.
 *
 * Creates roles + database, then applies db/schema.sql, then writes the
 * resulting credentials into .env.
 *
 * Why Node + the bundled `pg` driver instead of psql:
 *   - the package already ships `pg` (backend dependency), psql may not be on PATH
 *   - passwords never pass through batch/CLI quoting, so no escaping bugs
 *   - schema.sql stays a plain, auditable SQL file that ops can read or hand-edit
 *
 * Usage:  setup-db.bat            (interactive)
 *         setup-db.bat --force    (re-apply even if tables already exist)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const PKG = path.resolve(__dirname, '..');
const ENV_FILE = path.join(PKG, '.env');
const SCHEMA_FILE = path.join(PKG, 'db', 'schema.sql');
const READY_MARKER = path.join(PKG, '.db-ready');
const FORCE = process.argv.includes('--force');
const RESET_PASSWORDS = process.argv.includes('--reset-passwords');

const pg = require(path.join(PKG, 'apps', 'backend', 'node_modules', 'pg'));

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const currentEnv = readEnvFile(ENV_FILE);

// ---------------------------------------------------------------- prompts

function ask(question, defaultValue) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const suffix = defaultValue ? ' [' + defaultValue + ']' : '';
    rl.question(question + suffix + ': ', (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/** Hidden input (passwords). Falls back to visible input when stdin is not a TTY. */
function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question + ': ');
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }
    const stdin = process.stdin;
    let buf = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buf.trim());
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

/** Non-interactive path for unattended installs: env var wins over the prompt. */
async function askOrEnv(envKey, question, defaultValue) {
  if (process.env[envKey]) return process.env[envKey];
  return ask(question, defaultValue);
}

async function askOrEnvHidden(envKey, question) {
  if (process.env[envKey]) return process.env[envKey];
  return askHidden(question);
}

// ---------------------------------------------------------------- helpers

function rewriteEnv(updates) {
  const src = fs.readFileSync(ENV_FILE, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
    if (!m || !(m[1] in updates)) return line;
    seen.add(m[1]);
    return m[1] + '=' + updates[m[1]];
  });
  for (const key of Object.keys(updates)) {
    if (!seen.has(key)) out.push(key + '=' + updates[key]);
  }
  fs.writeFileSync(ENV_FILE, out.join(eol), 'utf8');
}

function fatal(msg) {
  console.error('\n[setup-db] ERROR: ' + msg);
  process.exit(1);
}

function friendly(host, port, user, err) {
  const code = err && err.code;
  if (code === 'ECONNREFUSED') {
    return (
      'Cannot reach PostgreSQL at ' + host + ':' + port + '. ' +
      'Make sure the PostgreSQL service is running (services.msc -> postgresql-x64-*).'
    );
  }
  if (code === '28P01') return 'Wrong password for user "' + user + '".';
  if (code === '3D000') return 'Database does not exist.';
  if (code === '28000') return 'Role "' + user + '" is not allowed to log in (check pg_hba.conf).';
  return err && err.message ? err.message : String(err);
}

// ---------------------------------------------------------------- main

(async function main() {
  if (!fs.existsSync(SCHEMA_FILE)) fatal('db/schema.sql is missing from the package.');
  if (!fs.existsSync(ENV_FILE)) fatal('.env is missing. Run start.bat once to generate it.');

  console.log('');
  console.log('Pinecone - database setup');
  console.log('=========================');
  console.log('This creates the roles, the database and all tables, then writes');
  console.log('the credentials into .env. Run it once per machine.');
  console.log('');

  const host = await askOrEnv('PINE_SETUP_HOST', 'PostgreSQL host', '127.0.0.1');
  const port = await askOrEnv('PINE_SETUP_PORT', 'PostgreSQL port', '5432');
  const superUser = await askOrEnv('PINE_SETUP_SUPERUSER', 'Superuser name', 'postgres');
  const superPass = await askOrEnvHidden('PINE_SETUP_SUPERPASS', 'Superuser password');

  if (!superPass) fatal('superuser password is required');

  const dbName = await askOrEnv('PINE_SETUP_DB', 'Target database name', 'pinecone');
  const appUser = 'pinecone_app';
  const adminUser = 'pinecone_admin';

  const suggested = crypto.randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  const appPass = await askOrEnv('PINE_SETUP_APPPASS', 'Password for ' + appUser, suggested);
  const adminPass = await askOrEnv('PINE_SETUP_ADMINPASS', 'Password for ' + adminUser, appPass);

  const admin = new pg.Client({
    host,
    port: Number(port),
    user: superUser,
    password: superPass,
    database: 'postgres',
    connectionTimeoutMillis: 8000,
  });

  console.log('\n[setup-db] connecting as ' + superUser + ' ...');
  try {
    await admin.connect();
  } catch (e) {
    fatal(friendly(host, port, superUser, e));
  }

  const q = (sql, params) => admin.query(sql, params);

  // ---- roles
  for (const [role, pass, isSuper] of [
    [appUser, appPass, false],
    [adminUser, adminPass, true],
  ]) {
    const exists = await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (exists.rowCount) {
      // Never silently rotate an existing role's password: re-running setup on a
      // machine that already works must be a no-op for credentials.
      if (RESET_PASSWORDS) {
        console.log('[setup-db] role exists, resetting password: ' + role);
        await q('ALTER ROLE ' + role + ' WITH LOGIN PASSWORD ' + quote(pass));
      } else {
        console.log('[setup-db] role exists, password unchanged: ' + role);
      }
    } else {
      console.log('[setup-db] creating role: ' + role);
      await q(
        'CREATE ROLE ' + role + ' WITH LOGIN ' + (isSuper ? 'SUPERUSER ' : '') + 'PASSWORD ' + quote(pass)
      );
    }
  }

  // ---- database
  const dbExists = await q('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!dbExists.rowCount) {
    console.log('[setup-db] creating database: ' + dbName + ' (owner ' + appUser + ')');
    await q('CREATE DATABASE "' + dbName + '" OWNER ' + appUser + ' ENCODING \'UTF8\'');
  } else {
    console.log('[setup-db] database already exists: ' + dbName);
  }

  await admin.end();

  // ---- schema, applied as the owning role so every object belongs to it
  const owner = new pg.Client({
    host,
    port: Number(port),
    user: appUser,
    password: appPass,
    database: dbName,
    connectionTimeoutMillis: 8000,
  });
  try {
    await owner.connect();
  } catch (e) {
    fatal(friendly(host, port, appUser, e));
  }

  const existing = await owner.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const tableCount = existing.rows[0].n;
  if (tableCount > 0 && !FORCE) {
    console.log('\n[setup-db] database already has ' + tableCount + ' tables.');
    console.log('[setup-db] nothing to do. Use --force to re-apply schema.sql.');
  } else {
    // pg_dump >= 17.6 emits psql meta-commands (\restrict / \unrestrict) that are
    // not valid SQL. Strip any backslash command line defensively so the file
    // stays executable by any SQL client, not just psql.
    const sql = fs
      .readFileSync(SCHEMA_FILE, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('\\'))
      .join('\n');
    console.log('[setup-db] applying schema.sql (' + Math.round(sql.length / 1024) + ' KB) ...');
    try {
      await owner.query('BEGIN');
      await owner.query(sql);
      await owner.query('COMMIT');
    } catch (e) {
      try {
        await owner.query('ROLLBACK');
      } catch {}
      await owner.end();
      fatal('schema.sql failed: ' + (e.message || e) + '\nNothing was committed (rolled back).');
    }
    const after = await owner.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log('[setup-db] tables created: ' + after.rows[0].n);
  }
  await owner.end();

  // ---- persist credentials
  const url =
    'postgresql://' + appUser + ':' + encodeURIComponent(appPass) + '@' + host + ':' + port + '/' + dbName + '?schema=public';
  rewriteEnv({
    DATABASE_URL: url,
    DB_PASSWORD: adminPass,
    APP_DB_PASSWORD: appPass,
  });
  console.log('[setup-db] .env updated (DATABASE_URL / DB_PASSWORD / APP_DB_PASSWORD)');

  fs.writeFileSync(READY_MARKER, new Date().toISOString() + '\n', 'utf8');

  console.log('');
  console.log('Done. Next step: double-click start.bat');
  console.log('Then open http://localhost:' + (currentEnv.FRONTEND_PORT || 6173) + ' and register the first account.');
  console.log('');
  process.exit(0);
})();

/** Minimal SQL literal quoting for passwords (single quotes doubled). */
function quote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}
