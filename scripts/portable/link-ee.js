'use strict';
/**
 * Enterprise only: expose the compiled modules as the `@ee` package.
 *
 * Why a junction created at start time instead of a copy inside the zip:
 *   1. compiled EE code uses relative imports such as
 *      `../../../common/decorators/public.decorator`, which only resolve while
 *      the file physically lives at dist/modules/<mod>/... A copy at
 *      node_modules/@ee/<mod>/... is one level too shallow and breaks them.
 *   2. a junction keeps realpath at dist/modules (Node resolves modules through
 *      the real path), so the relative depth stays correct.
 *   3. zip archives cannot carry links, so it must be created on the target
 *      machine. Junctions need no administrator rights on Windows.
 *
 * No-op unless PINE_EDITION=enterprise, so CE packages are unaffected.
 */
const fs = require('fs');
const path = require('path');

const PKG = path.resolve(__dirname, '..');

function readPineEdition() {
  const file = path.join(PKG, '.env');
  if (!fs.existsSync(file)) return '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*PINE_EDITION\s*=\s*(.*)$/);
    if (m) return m[1].trim().toLowerCase();
  }
  return '';
}

const edition = (process.env.PINE_EDITION || readPineEdition() || '').toLowerCase();
if (edition !== 'enterprise') process.exit(0);

const link = path.join(PKG, 'apps', 'backend', 'node_modules', '@ee');
const target = path.join(PKG, 'apps', 'backend', 'dist', 'modules');

if (!fs.existsSync(target)) {
  console.error('[ee] cannot link: ' + target + ' is missing');
  process.exit(1);
}

try {
  if (fs.existsSync(link)) {
    if (fs.realpathSync(link) === fs.realpathSync(target)) process.exit(0);
    // Stale copy or a link to another path: drop it and recreate.
    fs.rmSync(link, { recursive: true, force: true });
  }
} catch {
  try {
    fs.rmSync(link, { recursive: true, force: true });
  } catch {}
}

try {
  fs.symlinkSync(target, link, 'junction');
  console.log('[ee] linked node_modules/@ee -> dist/modules');
} catch (e) {
  console.error('[ee] failed to create junction: ' + e.message);
  process.exit(1);
}
