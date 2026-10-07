// One shared recovery panel on every tool page, three states with three messages (Forge final pass, 4 Oct 2026):
//   signed out            "Sign in with Bungie to load your Guardian."  + Sign in with Bungie (primary)
//   Bungie down           "Bungie isn't responding right now."          + Retry (primary) + Continue without live data
//   our Worker unreachable "Can't reach ASTRIX PARADOX right now."      + Retry (primary)
// Static checks always run. The browser part renders every tool page in each state at 390 and 1600
// with a local fixture (the session request is answered or refused here; nothing leaves the machine).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const MESSAGES = {
  'signed-out': 'Sign in with Bungie to load your Guardian.',
  bungie: "Bungie isn't responding right now.",
  worker: "Can't reach ASTRIX PARADOX right now."
};
const BUTTONS = {'signed-out': ['Sign in with Bungie'], bungie: ['Retry', 'Continue without live data'], worker: ['Retry']};
const PAGES = {
  Character: '/astrix-app/pages/guardian-workspace-v2/',
  Builder: '/astrix-app/pages/guardian-workspace-v2/paradox-build-space/',
  Journey: '/astrix-app/pages/journey/',
  Storage: '/astrix-app/pages/vault/',
  Armoury: '/astrix-app/pages/loadout/',
  Reports: '/astrix-app/pages/reports/',
  'Build Fit': '/astrix-app/pages/build-fit/?dim=fixture',
  'Build Review': '/astrix-app/pages/build-review/?dim=fixture',
  'Preparing The Forge': '/astrix-app/pages/forge-loader/'
};

// ---------- Static: the gate owns the three messages and the three-way split ----------
const gate = await readFile(resolve(root, 'astrix-app/shared/astrix-portal-loader.js'), 'utf8');
for (const message of Object.values(MESSAGES)) assert.ok(gate.includes(JSON.stringify(message).slice(1, -1)) || gate.includes(message), `Gate carries "${message}"`);
assert.match(gate, /bungieDown:bungieDown,workerUnreachable:workerUnreachable,recover:recover/, 'Gate exposes the three-state API');
assert.match(gate, /apx-retry-button apx-recovery-primary[^>]*>Retry</, 'Retry is the primary button');
assert.match(gate, /apx-auth-button apx-recovery-primary[^>]*>Sign in with Bungie</, 'Sign in with Bungie is the primary button');
for (const message of Object.values(MESSAGES)) {
  assert.match(message, /[.]$/, `"${message}" is a full sentence`);
  assert.doesNotMatch(message, /\b(?:retry|reload|again|to|the|and|or|a)\.$/i, `"${message}" does not end on a dangling word`);
}
const auth = await readFile(resolve(root, 'astrix-app/pages/guardian-workspace-v2/guardian-bungie-auth.mjs'), 'utf8');
assert.match(auth, /worker_unreachable/, 'Session check tells an unreachable Worker apart from Bungie being down');
assert.match(auth, /workerUnreachable\?\.\(\)/, 'An unreachable Worker opens the Worker state');
assert.match(auth, /bungieDown\?\.\(\)/, 'Bungie down opens the Bungie state');

// Classification of thrown errors, run in a sandbox with the real gate script.
{
  const vm = await import('node:vm');
  const sandbox = {window: {}, document: {documentElement: {classList: {add() {}, remove() {}}, dataset: {}}, querySelector: () => null, body: null, addEventListener() {}, dispatchEvent() {}}, MutationObserver: class {observe() {} disconnect() {}}, CustomEvent: class {}, setTimeout, clearTimeout, location: {search: '', pathname: '/'}, navigator: {}, sessionStorage: {getItem: () => null, setItem() {}}, performance: {now: () => 0}};
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(gate, sandbox); } catch {}
  const kind = sandbox.ForgeLoader?.recoveryKind;
  assert.equal(typeof kind, 'function', 'Gate exposes recoveryKind');
  assert.equal(kind(new TypeError('Failed to fetch')), 'worker', 'A network error means the Worker is unreachable');
  assert.equal(kind(Object.assign(new Error('Prepared vault request timed out.'), {})), 'worker', 'A timeout means the Worker is unreachable');
  assert.equal(kind({code: 'worker_unreachable'}), 'worker');
  assert.equal(kind({status: 522}), 'worker', 'A Cloudflare 52x reply means the Worker is unreachable');
  assert.equal(kind({code: 'bungie_unavailable', status: 503}), 'bungie', 'The Worker saying Bungie is unavailable means Bungie is down');
  assert.equal(kind(Object.assign(new Error('Guardian data request failed (502).'), {status: 502, code: 'profile_snapshot_unavailable'})), 'bungie', 'A Worker answer about missing Bungie data means Bungie is down');
}

// ---------- Browser: every tool page, every state, 390 and 1600 ----------
let chromium;
try {
  ({chromium} = process.env.PLAYWRIGHT_MODULE_PATH ? await import(process.env.PLAYWRIGHT_MODULE_PATH) : require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright` : 'playwright'));
} catch {
  console.log('RECOVERY_STATES=STATIC-PASS browser part NOT RUN: Playwright missing');
  process.exit(0);
}
const AUTH = 'https://auth.astrixparadox.com';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2'};
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = resolve(root, '.' + path + (path.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'}); res.end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
const output = process.env.RECOVERY_REVIEW_DIR || resolve(tmpdir(), 'recovery-states');
await mkdir(output, {recursive: true});
let browser;
const rows = [];
try {
  try { browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {})}); }
  catch (error) { if (/Executable doesn't exist/.test(error.message)) { console.log('RECOVERY_STATES=STATIC-PASS browser part NOT RUN: Chromium missing'); process.exit(0); } throw error; }
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cors = {'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true'};
  for (const [name, path] of Object.entries(PAGES)) for (const state of Object.keys(MESSAGES)) for (const width of [390, 1600]) {
    const context = await browser.newContext({viewport: {width, height: width < 600 ? 844 : 1000}});
    const page = await context.newPage();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.origin === AUTH) {
        if (state === 'worker') return route.abort('connectionrefused');
        if (url.pathname === '/session') return state === 'signed-out'
          ? route.fulfill({status: 401, contentType: 'application/json', headers: cors, body: JSON.stringify({authenticated: false, error: 'bungie_reauthentication_required'})})
          : route.fulfill({status: 503, contentType: 'application/json', headers: cors, body: JSON.stringify({authenticated: 'unknown', error: 'bungie_unavailable'})});
        return route.fulfill({status: 503, contentType: 'application/json', headers: cors, body: JSON.stringify({error: 'bungie_unavailable'})});
      }
      return route.abort();
    });
    await page.goto(origin + path, {waitUntil: 'domcontentloaded'});
    const panel = state === 'signed-out' ? '.apx-gate .apx-auth-panel:not([hidden])' : '.apx-gate .apx-failure-panel:not([hidden])';
    await page.waitForSelector(panel, {timeout: 20000});
    await page.waitForTimeout(400);
    const seen = await page.evaluate(selector => {
      const node = document.querySelector(selector);
      const buttons = [...node.querySelectorAll('button')].filter(button => !button.hidden && getComputedStyle(button).display !== 'none');
      return {
        message: node.querySelector('.apx-recovery-message')?.textContent.trim(),
        buttons: buttons.map(button => button.textContent.trim()),
        primary: buttons.filter(button => button.classList.contains('apx-recovery-primary')).map(button => button.textContent.trim()),
        font: getComputedStyle(node.querySelector('.apx-recovery-message')).fontFamily,
        buttonFont: buttons.map(button => getComputedStyle(button).fontFamily),
        primaryFill: buttons.filter(button => button.classList.contains('apx-recovery-primary')).map(button => getComputedStyle(button).backgroundImage),
        secondaryFill: buttons.filter(button => !button.classList.contains('apx-recovery-primary')).map(button => getComputedStyle(button).backgroundImage),
        overflow: document.documentElement.scrollWidth > innerWidth
      };
    }, panel);
    const label = `${name} ${state} ${width}`;
    assert.equal(seen.message, MESSAGES[state], `${label}: message`);
    assert.deepEqual(seen.buttons, BUTTONS[state], `${label}: buttons`);
    assert.deepEqual(seen.primary, [BUTTONS[state][0]], `${label}: ${BUTTONS[state][0]} is the one primary button`);
    assert.ok(seen.primaryFill.every(fill => /gradient/.test(fill) && /rgb\(186, 31, 18\)/.test(fill)), `${label}: primary tier uses the action colour: ${seen.primaryFill}`);
    assert.ok(seen.secondaryFill.every(fill => !/rgb\(186, 31, 18\)/.test(fill)), `${label}: secondary tier is not filled with the action colour`);
    assert.equal(seen.overflow, false, `${label}: no horizontal scroll`);
    rows.push({page: name, state, width, font: seen.font, buttonFont: seen.buttonFont[0]});
    await page.screenshot({path: resolve(output, `${name.replace(/\s+/g, '-')}-${state}-${width}.png`)});
    await context.close();
  }
  const fonts = new Set(rows.map(row => row.font)), buttonFonts = new Set(rows.map(row => row.buttonFont));
  assert.equal(fonts.size, 1, `One message font on every page: ${[...fonts].join(' | ')}`);
  assert.equal(buttonFonts.size, 1, `One button font on every page: ${[...buttonFonts].join(' | ')}`);
  await writeFile(resolve(output, 'recovery-states.json'), JSON.stringify(rows, null, 1));
  console.log(`RECOVERY_STATES=PASS ${Object.keys(PAGES).length} pages x 3 states x 2 widths, one panel, one font; screenshots in ${output}`);
} finally {
  await browser?.close();
  server.close();
}
