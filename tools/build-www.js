'use strict';

// Copies the web app into www/ for Capacitor, with the deployed server
// address baked into www/js/config.js. Run: node tools/build-www.js
//
// The server answers 401 "app key required" to every /api call without the
// shared app key, so a build with a server but no key would silently fall
// back to the on-device rules. Key resolution, in order:
//   1. ACOMPANA_APP_KEY from the environment (CI, local dev).
//   2. AWS SSM parameter /acompana/app-key (--with-decryption).
//   3. Nothing: print a loud warning; the build still completes.
// The key is written to www/js/config.js only; it is never logged, and www/
// is not tracked in git.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const ENTRIES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'media', 'icons', 'fonts'];
const SKIP = new Set([path.join('media', 'raw')]);
const SSM_PARAM = '/acompana/app-key';
const DEFAULT_REGION = 'us-east-1';

function copy(src, rel) {
  const dest = path.join(WWW, rel);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((name) => {
      const childRel = path.join(rel, name);
      if (SKIP.has(childRel)) return;
      copy(path.join(src, name), childRel);
    });
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function readTerraform() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'infra', 'terraform.tfstate'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function apiBaseFromState(tf) {
  // Default to the deployed base from infra (terraform output api_base),
  // else same-origin (empty). Never ship the *.test placeholder.
  const base = tf && tf.outputs && tf.outputs.api_base && tf.outputs.api_base.value;
  if (typeof base === 'string' && base.trim() && base.indexOf('.test') === -1) {
    return base.trim().replace(/\/+$/, '');
  }
  return '';
}

function regionFromState(tf) {
  if (!tf || !Array.isArray(tf.resources)) return DEFAULT_REGION;
  for (const resource of tf.resources) {
    const attributes = resource && resource.instances && resource.instances[0] && resource.instances[0].attributes;
    if (attributes && typeof attributes.region === 'string' && attributes.region.trim()) {
      return attributes.region.trim();
    }
  }
  return DEFAULT_REGION;
}

// Runs `aws ...` and returns stdout. A fake runner is injected in tests so the
// decision logic can be checked without touching AWS.
function awsRunner(region) {
  return (args) => execFileSync('aws', args.concat(['--region', region]), {
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function ssmAppKey(run) {
  try {
    const out = run([
      'ssm', 'get-parameter',
      '--name', SSM_PARAM,
      '--with-decryption',
      '--query', 'Parameter.Value',
      '--output', 'text'
    ]);
    return String(out || '').trim();
  } catch (e) {
    return '';
  }
}

// Pure decision: env key wins, then SSM, then a loud warning. Never returns
// (or logs) anything on a no-server build.
function resolveAppKey(options) {
  const opts = options || {};
  const apiBase = String(opts.apiBase || '').trim();
  if (!apiBase) return '';
  const envKey = String(opts.envKey || '').trim();
  if (envKey) return envKey;
  const run = typeof opts.run === 'function' ? opts.run : awsRunner(opts.region || DEFAULT_REGION);
  const fromSsm = ssmAppKey(run);
  if (fromSsm) return fromSsm;
  const warn = typeof opts.warn === 'function' ? opts.warn : (message) => console.error(message);
  warn('WARNING: building with a server but NO app key — every AI call will 401');
  return '';
}

function build() {
  fs.rmSync(WWW, { recursive: true, force: true });
  fs.mkdirSync(WWW, { recursive: true });

  ENTRIES.forEach((entry) => {
    const src = path.join(ROOT, entry);
    if (fs.existsSync(src)) copy(src, entry);
  });

  const tf = readTerraform();
  const apiBase = process.env.ACOMPANA_API_BASE || apiBaseFromState(tf);
  // Shared app key the server checks (APP_KEY there). Not a secret from anyone
  // who unpacks the APK; it keeps scanners and casual scripts out. It is only
  // written to the generated config and never printed.
  const appKey = resolveAppKey({
    apiBase: apiBase,
    envKey: process.env.ACOMPANA_APP_KEY,
    region: regionFromState(tf)
  });
  const config = "'use strict';\n\n" +
    '// Build-time server address; empty means "no server" (on-device rules only).\n' +
    'window.ACOMPANA_CONFIG = { apiBase: ' + JSON.stringify(apiBase) + ', appKey: ' + JSON.stringify(appKey) + ' };\n';
  fs.mkdirSync(path.join(WWW, 'js'), { recursive: true });
  fs.writeFileSync(path.join(WWW, 'js', 'config.js'), config);

  console.log('www built: ' + WWW);
}

if (require.main === module) build();

module.exports = { resolveAppKey, regionFromState, apiBaseFromState, ssmAppKey };
