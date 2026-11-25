'use strict';
/**
 * Pinecone portable frontend launcher.
 *
 * Responsibility: turn <pkg>/.env into a runtime config file, then start the
 * Next standalone server with the configured port.
 *
 * Why a Node script instead of a .bat:
 *   - no cmd quoting traps around paths with spaces
 *   - ports stay configurable at START time, not baked into the build
 *     (NEXT_PUBLIC_* is a build-time text substitution; we moved address
 *      resolution to runtime, see apps/frontend/src/lib/runtime-config.ts)
 *
 * Precedence: real environment > .env file > built-in default.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PKG = path.resolve(__dirname, '..');

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const source = fs.readFileSync(file, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted =
      value.length > 1 &&
      ((value[0] === '"' && value[value.length - 1] === '"') ||
        (value[0] === "'" && value[value.length - 1] === "'"));
    if (quoted) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const fromFile = readEnvFile(path.join(PKG, '.env'));
const pick = (key, fallback) => process.env[key] || fromFile[key] || fallback;

const backendPort = Number(pick('BACKEND_PORT', 3000));
const frontendPort = Number(pick('FRONTEND_PORT', 6173));
const kbCollabPort = Number(pick('KB_COLLAB_PORT', 3002));

const cfg = { backendPort, frontendPort, kbCollabPort };
if (String(pick('HTTPS_ENABLED', 'false')).toLowerCase() === 'true') cfg.secureApi = true;
if (fromFile.KB_COLLAB_URL) cfg.kbCollabUrl = fromFile.KB_COLLAB_URL;
// Full-URL overrides only. NOTE: do NOT read API_URL / WS_URL here — those are
// backend-side vars (used in emails/links) and are absolute localhost URLs;
// feeding them to the browser would defeat per-host derivation.
if (fromFile.RUNTIME_API_URL) cfg.apiUrl = fromFile.RUNTIME_API_URL;
if (fromFile.RUNTIME_WS_URL) cfg.wsUrl = fromFile.RUNTIME_WS_URL;

const outFile = path.join(PKG, 'apps', 'frontend', 'public', 'runtime-config.js');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  'window.__PINECONE_RUNTIME__ = ' + JSON.stringify(cfg) + ';\n',
  'utf8'
);

console.log('[frontend] runtime-config: ' + JSON.stringify(cfg));
if (!cfg.apiUrl) {
  console.log(
    '[frontend] api base auto-derived: <page protocol>//<page host>:' + backendPort + '/api'
  );
}
console.log('[frontend] listening on port ' + frontendPort);

const child = spawn(process.execPath, [path.join(PKG, 'apps', 'frontend', 'server.js')], {
  cwd: PKG,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(frontendPort),
    HOSTNAME: '0.0.0.0',
  },
});

child.on('exit', (code) => process.exit(code || 0));
