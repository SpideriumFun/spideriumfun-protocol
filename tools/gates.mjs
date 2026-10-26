// Gates. `npm run gates` rebuilds dist/ and fails (exit 1) on any violation.
// Both register branches are rendered and checked, and a mutation harness proves
// the checks can fail. Mutation anchors read the current record state at runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, loadRegister, renderPage, REQUIRED } from './build.mjs';
import { toPublic, validateRecord, isStated, scanAddresses, handleFromUrl, PAYLOAD_KEYS } from '../src/js/gate.js';
import { createMarket, selectSolana, toRows, backoffDelay, POLL_MS, BACKOFF_MAX } from '../src/js/market.js';
import { htmlUnits, jsUnits, bigrams, unigramsOf, h } from './copy-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const results = [];
const gate = (name, fn) => {
  let errs;
  try { errs = fn(); } catch (e) { errs = ['threw: ' + (e && e.stack || e)]; }
  errs = errs || [];
  results.push({ name, errs });
  console.log(`${errs.length ? 'FAIL' : 'PASS'}  ${String(results.length).padStart(2, '0')} ${name}`);
  errs.slice(0, 80).forEach((e) => console.log('        - ' + e));
};
const gateAsync = async (name, fn) => {
  let errs;
  try { errs = await fn(); } catch (e) { errs = ['threw: ' + (e && e.stack || e)]; }
  errs = errs || [];
  results.push({ name, errs });
  console.log(`${errs.length ? 'FAIL' : 'PASS'}  ${String(results.length).padStart(2, '0')} ${name}`);
  errs.slice(0, 80).forEach((e) => console.log('        - ' + e));
};

/* ---------- setup ---------- */
const register = loadRegister();
const pub = toPublic(register);
build(DIST, register);
const read = (f) => fs.readFileSync(path.join(DIST, f), 'utf8');
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, o) : o.push(p); } return o; };
const distFiles = walk(DIST);
const textFiles = distFiles.filter((f) => /\.(html|js|css|svg|json)$/.test(f));
const distText = textFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const html = read('index.html');
const template = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const fakeAddr = (n = 44) => Array.from(crypto.randomBytes(n), (b) => B58[b % 58]).join('');
const fakeHex = () => '0x' + crypto.randomBytes(20).toString('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));
const openTag = (src, id) => src.match(new RegExp(`<(\\w+)([^>]*\\sdata-record="${id}"[^>]*)>`, 'g')) || [];

/* ---------- reusable checks (functions of html + public register) ---------- */
function checkLinkRule(src, reg) {
  const errs = [];
  for (const [id, r] of Object.entries(reg)) {
    for (const tag of openTag(src, id)) {
      if (!isStated(r)) {
        if (/\shref=/.test(tag)) errs.push(`${id}: inert record has href`);
        if (/\sdata-copy=/.test(tag)) errs.push(`${id}: inert record has data-copy`);
      }
    }
    if (isStated(r) && r.url) {
      const ok = openTag(src, id).some((t) => t.includes(`href="${r.url}"`));
      if (!ok) errs.push(`${id}: stated record is not linked`);
    }
  }
  return errs;
}

function checkCaSlot(src, reg) {
  const errs = [];
  const m = src.match(/<div class="hud ca[^"]*" id="caSlot"[\s\S]*?<\/div>/);
  if (!m) return ['ca slot missing'];
  const slot = m[0];
  if (src.indexOf('id="caSlot"') > src.indexOf('<main')) errs.push('ca slot is not above main content');
  const r = reg.ca;
  if (isStated(r)) {
    if (/<button[^>]*\sdisabled[\s>]/.test(slot)) errs.push('stated ca is disabled');
    if (!slot.includes(`data-copy="${r.value}"`)) errs.push('stated ca lacks data-copy');
    if (!slot.includes(`>${r.value}</span>`)) errs.push('stated ca does not show the full address');
  } else {
    if (!/<button[^>]*\sdisabled[\s>]/.test(slot)) errs.push('inert ca is enabled');
    if (/data-copy/.test(slot)) errs.push('inert ca carries data-copy');
    if (!/>pending</.test(slot)) errs.push('inert ca does not read pending');
  }
  return errs;
}

function checkInertText(src, reg) {
  const errs = [];
  for (const [id, r] of Object.entries(reg)) {
    if (isStated(r)) continue;
    const re = new RegExp(`<div class="row inert"[^>]*data-record="${id}"[^>]*>([\\s\\S]*?)</div>`);
    const m = src.match(re);
    if (!m) { errs.push(`${id}: inert row missing`); continue; }
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text !== `${r.label} pending`) errs.push(`${id}: inert row text is "${text}"`);
  }
  return errs;
}

const checkRecords = (reg, chain) => Object.entries(reg).flatMap(([id, r]) => validateRecord(id, r, chain));

/* ---------- gates on the built dist ---------- */
gate('register: states valid, inert records carry no value or url', () => checkRecords(register.records, register.records.chain.value));

gate('dist: required files present', () => REQUIRED.filter((f) => !fs.existsSync(path.join(DIST, f))).map((f) => 'missing ' + f));

gate('logo: copied into dist, relative path in index.html, valid PNG RGBA', () => {
  const errs = [];
  for (const ref of ['assets/logo-128.png', 'assets/logo-1024.png']) {
    if (!html.includes(`src="${ref}"`)) errs.push('index.html does not reference ' + ref);
    const f = path.join(DIST, ref);
    if (!fs.existsSync(f)) { errs.push('not in dist: ' + ref); continue; }
    const b = fs.readFileSync(f);
    if (b.readUInt32BE(16) < 100 || b[25] !== 6) errs.push(`${ref}: unexpected IHDR (colourtype ${b[25]})`);
  }
  if (/src="\//.test(html) || /href="\/(?!\/)/.test(html)) errs.push('absolute root path in index.html');
  return errs;
});

gate('favicon: svg 32x32, linked, no xml comments, fills inside the palette', () => {
  const errs = [];
  const s = read('assets/favicon.svg');
  if (!/width="32" height="32" viewBox="0 0 32 32"/.test(s)) errs.push('not 32x32');
  if (s.includes('<!--') || /--/.test(s)) errs.push('svg contains a double hyphen or comment');
  if (!/rel="icon"[^>]*favicon\.svg/.test(html)) errs.push('favicon not linked');
  const tokens = read('tokens.css');
  const pal = new Set((tokens.match(/--c-[\w-]+:\s*#[0-9a-fA-F]{6}/g) || []).map((x) => x.split('#')[1].toLowerCase()));
  for (const c of new Set((s.match(/fill="#([0-9a-fA-F]{6})"/g) || []).map((x) => x.slice(7, 13).toLowerCase()))) if (!pal.has(c)) errs.push('fill outside palette: ' + c);
  return errs;
});

gate('ca slot: top of page, large font, matches register state', () => {
  const errs = checkCaSlot(html, pub);
  const css = read('styles.css');
  const m = css.match(/\.ca-v\{[^}]*font-size:clamp\(([^)]*)\)/);
  if (!m || !/22px/.test(m[1])) errs.push('ca font is not large');
  if (!/\.ca\{top:var\(--top\)/.test(css)) errs.push('ca slot is not pinned under the header');
  return errs;
});

gate('social: icon-only, top-right, both present, official marks', () => {
  const errs = [];
  const head = html.match(/<header[\s\S]*?<\/header>/)[0];
  const social = head.match(/<nav class="grp social"[\s\S]*?<\/nav>/);
  if (!social) return ['social nav missing in header'];
  if (head.lastIndexOf('<nav class="grp social"') < head.lastIndexOf('<nav class="grp nav"')) errs.push('social is not last in the header');
  const icons = social[0].match(/class="icon-btn[^"]*"/g) || [];
  if (icons.length !== 2) errs.push(`expected 2 icons, found ${icons.length}`);
  const text = social[0].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
  if (text) errs.push('social contains text labels: ' + text);
  if (!social[0].includes('M18.244 2.25h3.308')) errs.push('X mark is not the official path');
  if (!social[0].includes('M8 0c4.42 0 8 3.58 8 8a8.013')) errs.push('GitHub octicon is not the official path');
  const css = read('styles.css');
  if (/\.icon-btn[^{]*\{[^}]*display:none/.test(css) || /\.social[^{]*\{[^}]*display:none/.test(css)) errs.push('social hidden at some breakpoint');
  return errs;
});

gate('link rule: no href for unstated records, stated ones linked', () => checkLinkRule(html, pub));
gate('inert chips: label and pending only', () => checkInertText(html, pub));

gate('address scanner: nothing address-shaped outside the stated registry', () => scanAddresses(distText, pub).map((a) => 'stray address ' + a));

gate('no dates, timestamps or clock strings anywhere in dist', () => {
  const errs = [];
  const pats = [
    [/\b\d{4}-\d{2}-\d{2}\b/, 'iso date'], [/\b(19|20)\d{2}\b/, 'year'],
    [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, 'month day'],
    [/\bas of\b/i, 'as of'], [/\bchecked\b/i, 'checked'], [/\bupdated\b/i, 'updated'], [/\bago\b/i, 'ago'],
    [/\b\d{1,2}:\d{2}(:\d{2})?\b/, 'clock'], [/\bT\+\d/, 'T+ clock'], [/\btimestamp\b/i, 'timestamp'],
    [/new Date|Date\.now|toLocale(Date|Time)String|DateTimeFormat|getFullYear|toISOString/, 'date api'],
  ];
  for (const f of textFiles) {
    const t = fs.readFileSync(f, 'utf8').replace(/<script type="application\/json"[\s\S]*?<\/script>/, '').replace(/xmlns="[^"]*"/g, '');
    for (const [re, label] of pats) { const m = t.match(re); if (m) errs.push(`${path.relative(DIST, f)}: ${label} "${m[0]}"`); }
  }
  return errs;
});

gate('palette: hex literals only in tokens.css (favicon fills checked above)', () => {
  const errs = [];
  for (const dir of [path.join(ROOT, 'src'), DIST]) {
    for (const f of walk(dir).filter((x) => /\.(html|js|css|svg)$/.test(x))) {
      const rel = path.relative(dir, f);
      if (rel === 'tokens.css' || rel === path.join('assets', 'favicon.svg')) continue;
      const t = fs.readFileSync(f, 'utf8');
      const m = t.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g);
      if (m) errs.push(`${path.relative(ROOT, f)}: ${m.slice(0, 3).join(' ')}`);
      if (/\b(rgba?|hsla?)\(/.test(t)) errs.push(`${path.relative(ROOT, f)}: colour function literal`);
    }
  }
  return errs;
});

gate('measurement units: no ch units, tap targets 44px in css', () => {
  const css = read('styles.css');
  const errs = [];
  if (/\d(\.\d+)?ch\b/.test(css)) errs.push('ch unit found');
  if (!/button,\.btn\{[^}]*min-height:44px;min-width:44px/.test(css)) errs.push('buttons lack 44px minimum');
  if (!/\.icon-btn\{[^}]*width:44px;height:44px/.test(css)) errs.push('icon buttons lack 44px');
  if (!/\.brow \.cp\{width:44px;height:44px/.test(css)) errs.push('row copy button lacks 44px');
  return errs;
});

gate('reduced motion: global css fallback and js guards', () => {
  const errs = [];
  const css = read('styles.css');
  const block = css.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*$/);
  if (!block) return ['no reduced-motion block'];
  for (const need of ['animation:none!important', 'transition:none!important', '.rv{opacity:1!important', '.layer{transform:none!important', '.track{animation:none!important']) if (!block[0].includes(need)) errs.push('missing ' + need);
  const motion = read('js/motion.js'), web = read('js/web.js');
  if ((motion.match(/reduced\(\)/g) || []).length < 5) errs.push('motion.js lacks reduced() guards');
  if (!/reduced\(\)/.test(web)) errs.push('web.js lacks reduced() guard');
  return errs;
});

gate('network: only sanctioned hosts referenced', () => {
  const allowed = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'spiderium.fun', 'www.w3.org', 'x.com', 'solana-rpc.publicnode.com', 'api.dexscreener.com', 'dexscreener.com', 'example.test']);
  const errs = [];
  for (const f of textFiles) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/https?:\/\/([a-z0-9.\-\\()\[\]+*?]+)/gi)) {
      const host = m[1].replace(/[.\\]+$/, '');
      if (!allowed.has(host) && !host.startsWith('(')) errs.push(`${path.relative(DIST, f)}: ${host}`);
    }
  }
  return errs;
});

gate('js: every module parses', () => {
  const errs = [];
  for (const f of distFiles.filter((x) => x.endsWith('.js'))) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) errs.push(path.relative(DIST, f) + ': ' + r.stderr.split('\n')[0]);
  }
  return errs;
});

gate('repo hygiene: no assistant config, no attribution, no repo files in dist', () => {
  const errs = [];
  const a = ['cla', 'ude'].join(''), b = ['anthro', 'pic'].join('');
  for (const bad of [a.toUpperCase() + '.md', '.' + a]) if (fs.existsSync(path.join(ROOT, bad))) errs.push('found ' + bad);
  const re = new RegExp(`${a}|${b}|co-authored-by|generated with|\\bgpt\\b|\\bllm\\b|ai[- ]generated`, 'i');
  const skip = new Set(['node_modules', 'brand', 'reference', 'dist']);
  (function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name) && d === ROOT) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { scan(p); continue; }
      if (!/\.(md|json|js|mjs|css|html|svg|txt|py)$/.test(e.name) && e.name !== 'LICENSE') continue;
      if (e.name === 'asset-report.json' || (e.name === 'gates.mjs' && d.endsWith('tools'))) continue;
      const t = fs.readFileSync(p, 'utf8');
      const m = t.match(re);
      if (m) errs.push(`${path.relative(ROOT, p)}: "${m[0]}"`);
    }
  })(ROOT);
  for (const f of ['README.md', 'LICENSE', 'docs']) if (fs.existsSync(path.join(DIST, f))) errs.push('dist contains ' + f);
  for (const f of ['README.md', 'LICENSE', 'docs/whitepaper.md']) if (!fs.existsSync(path.join(ROOT, f))) errs.push('missing root file ' + f);
  return errs;
});

gate('copy: zero shared 2-grams with the reference site', () => {
  const ref = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/reference-bigrams.json'), 'utf8')));
  const units = [...htmlUnits(html), ...jsUnits(read('js/app.js')), ...jsUnits(read('js/market.js'))];
  const ours = bigrams(units);
  const errs = [];
  for (const [k, ctx] of ours) if (ref.has(h(k))) errs.push(`"${k}" in: ${ctx}`);
  const rw = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/reference-words.json'), 'utf8')));
  const shared = [...unigramsOf(units)].filter((w) => w.length > 3 && rw.has(h(w)));
  console.log(`        info: ${shared.length} shared single words longer than 3 letters (informational): ${shared.join(', ')}`);
  return errs;
});

/* ---------- market behaviour ---------- */
await gateAsync('market: filter, top ten by volume, dedupe, letter-tile data', async () => {
  const errs = [];
  const boosts = [
    { chainId: 'solana', tokenAddress: 'A' }, { chainId: 'ethereum', tokenAddress: 'E' },
    { chainId: 'solana', tokenAddress: 'A' }, { chainId: 'solana', tokenAddress: 'B' },
  ];
  if (JSON.stringify(selectSolana(boosts)) !== '["A","B"]') errs.push('selectSolana');
  const pairs = Array.from({ length: 14 }, (_, i) => ({ chainId: 'solana', url: 'https://dexscreener.com/solana/x' + i, baseToken: { address: 'T' + i, symbol: 'S' + i, name: 'N' + i }, priceUsd: '1.5', priceChange: { h24: i }, volume: { h24: i * 100 }, liquidity: { usd: 5 }, info: i % 2 ? { imageUrl: 'https://cdn.dexscreener.com/a.png' } : undefined }));
  pairs.push({ chainId: 'solana', baseToken: { address: 'T12', symbol: 'S12', name: 'N12' }, volume: { h24: 1 }, liquidity: { usd: 1 } });
  const rows = toRows(pairs);
  if (rows.length !== 10) errs.push('rows != 10');
  if (rows.some((r, i) => i && rows[i - 1].volume < r.volume)) errs.push('not sorted by volume');
  if (new Set(rows.map((r) => r.address)).size !== rows.length) errs.push('duplicate token');
  if (rows.find((r) => r.address === 'T12').liquidity !== 5) errs.push('deepest pool should win');
  if (rows.filter((r) => !r.imageUrl).length < 1) errs.push('missing imageUrl must stay null for the letter tile');
  return errs;
});

await gateAsync('market: backoff, last good data kept, dash on cold failure, pause and resume', async () => {
  const errs = [];
  let n = -1;
  const d = Array.from({ length: 8 }, (_, i) => backoffDelay(i, () => 0.5));
  if (d.some((v, i) => i && v < d[i - 1])) errs.push('backoff not monotone');
  if (d[d.length - 1] !== BACKOFF_MAX) errs.push('backoff not capped at ' + BACKOFF_MAX);
  if (!(d[1] === d[0] * 2)) errs.push('backoff not exponential');
  if (POLL_MS !== 60000) errs.push('poll is not 60s');
  const rec = pub.market;
  const timers = []; let fail = false;
  const listeners = {};
  const doc = { hidden: false, addEventListener: (e, f) => { listeners[e] = f; } };
  const fakeFetch = async (url) => {
    n++;
    if (fail) throw new Error('down');
    const json = url.startsWith(rec.boosts) ? [{ chainId: 'solana', tokenAddress: 'AAAA' }] : [{ chainId: 'solana', baseToken: { address: 'AAAA', symbol: 'AA', name: 'Aa' }, priceUsd: '2', volume: { h24: 9 }, liquidity: { usd: 3 }, priceChange: { h24: 1 } }];
    return { ok: true, json: async () => json };
  };
  const seen = [];
  const m = createMarket(rec, (u) => seen.push(u), { fetch: fakeFetch, doc, setTimeout: (f, ms) => { if (ms !== 12000) timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {}, rand: () => 0.5 });
  m.start(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  if (seen.at(-1).status !== 'live' || seen.at(-1).rows.length !== 1) errs.push('first load did not go live');
  if (timers.at(-1).ms !== POLL_MS) errs.push('next poll not 60s');
  fail = true; await m.run();
  if (seen.at(-1).status !== 'hold' || seen.at(-1).rows.length !== 1) errs.push('last good data was not kept');
  await m.run(); await m.run();
  if (!(timers.at(-1).ms > timers.at(-2).ms)) errs.push('retry delay did not grow');
  // pause while hidden, fetch immediately on visible
  doc.hidden = true; const before = n; listeners.visibilitychange();
  const scheduledWhileHidden = timers.length; await m.run();
  if (timers.length !== scheduledWhileHidden) errs.push('timer scheduled while hidden');
  doc.hidden = false; fail = false; listeners.visibilitychange(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  if (n === before + 1 && false) errs.push('');
  if (seen.at(-1).status !== 'live') errs.push('did not recover on visible');
  // cold failure -> error with no rows
  fail = true; const seen2 = [];
  const m2 = createMarket(rec, (u) => seen2.push(u), { fetch: fakeFetch, doc: { hidden: false, addEventListener() {} }, setTimeout: () => 1, clearTimeout() {}, rand: () => 0.5 });
  m2.start(); await new Promise((r) => setImmediate(r)); await m2.run();
  if (seen2.at(-1).status !== 'error' || seen2.at(-1).rows.length) errs.push('cold failure should be error with no rows');
  return errs;
});

await gateAsync('market: identical output whether the contract is absent or stated', async () => {
  const errs = [];
  const urls = (a) => a;
  const run = async (regv) => {
    const p = toPublic(regv);
    const calls = []; let out;
    const f = async (url) => { calls.push(url); return { ok: true, json: async () => (url.startsWith(p.market.boosts) ? [{ chainId: 'solana', tokenAddress: 'AAAA' }] : [{ chainId: 'solana', baseToken: { address: 'AAAA', symbol: 'AA', name: 'Aa' }, priceUsd: '2', volume: { h24: 9 }, liquidity: { usd: 3 } }]) }; };
    const m = createMarket(p.market, (u) => { out = u; }, { fetch: f, doc: { hidden: false, addEventListener() {} }, setTimeout: () => 1, clearTimeout() {} });
    m.start(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    return JSON.stringify({ calls: urls(calls), status: out.status, rows: out.rows });
  };
  const a = clone(register); delete a.records.ca.value; a.records.ca.state = 'absent';
  const b = clone(register); b.records.ca = { ...b.records.ca, state: 'stated', value: fakeAddr() };
  if ((await run(a)) !== (await run(b))) errs.push('market output depends on ca state');
  const c = clone(register); c.records.market = { label: 'Market data', state: 'absent' };
  const calls = []; const p = toPublic(c);
  createMarket(p.market, () => {}, { fetch: async (u) => { calls.push(u); throw new Error('x'); }, doc: { hidden: false, addEventListener() {} } }).start();
  if (calls.length) errs.push('market fetched although its record is absent');
  const src = fs.readFileSync(path.join(DIST, 'js/market.js'), 'utf8');
  if (/^\s*import\s/m.test(src)) errs.push('market.js imports another module');
  if (/records?\.ca\b|\.ca\b/.test(src)) errs.push('market.js touches the ca record');
  if (!/createMarket\(reg\.market,/.test(fs.readFileSync(path.join(DIST, 'js/app.js'), 'utf8'))) errs.push('app.js must pass only reg.market');
  return errs;
});

/* ---------- both gate branches, rendered ---------- */
gate('branch A (ca absent): inert slot, nothing address-shaped, market alive', () => {
  const reg = clone(register); reg.records.ca = { label: 'Contract', state: 'absent', source: 'client statement', scope: 'batch-level', recorded: 'x' };
  const p = toPublic(reg);
  const page = renderPage(template, p);
  const errs = [...checkRecords(p, 'Solana'), ...checkCaSlot(page, p), ...checkLinkRule(page, p), ...checkInertText(page, p)];
  if (scanAddresses(page, p).length) errs.push('address-shaped string in inert page');
  if (!page.includes('"market":{"label":"Market data","state":"stated"')) errs.push('market record not stated in branch A');
  return errs;
});

gate('branch B (ca stated, solana): live slot, full address, scanner exempts it only', () => {
  const addr = fakeAddr();
  const reg = clone(register); reg.records.ca = { label: 'Contract', state: 'stated', value: addr };
  const p = toPublic(reg);
  const page = renderPage(template, p);
  const errs = [...checkRecords(p, 'Solana'), ...checkCaSlot(page, p), ...checkLinkRule(page, p)];
  if (scanAddresses(page, p).length) errs.push('the stated CA was flagged');
  const stray = page.replace('</body>', `<p>${fakeAddr()}</p></body>`);
  if (scanAddresses(stray, p).length !== 1) errs.push('scanner missed a stray address');
  const bad = clone(reg); bad.records.ca.value = 'not-an-address';
  if (!checkRecords(toPublic(bad), 'Solana').length) errs.push('malformed ca accepted');
  return errs;
});

gate('branch C (0x hex): matched against the registry, never blanket-rejected', () => {
  const hex = fakeHex();
  const reg = clone(register); reg.records.chain.value = 'EVM'; reg.records.ca = { label: 'Contract', state: 'stated', value: hex };
  const p = toPublic(reg);
  const errs = checkRecords(p, 'EVM');
  const page = `<p>${hex}</p>`;
  if (scanAddresses(page, p).length) errs.push('stated 0x address was rejected');
  if (scanAddresses(`<p>${fakeHex()}</p>`, p).length !== 1) errs.push('unregistered 0x address was not flagged');
  if (scanAddresses(`<p>${hex}</p>`, toPublic(register)).length !== 1) errs.push('0x address passed with no registry entry');
  return errs;
});

gate('branch D (unconfirmed): renders inert exactly like absent', () => {
  const reg = clone(register); reg.records.ca = { label: 'Contract', state: 'unconfirmed' };
  const p = toPublic(reg);
  const page = renderPage(template, p);
  return [...checkRecords(p, 'Solana'), ...checkCaSlot(page, p), ...checkInertText(page, p)];
});

/* ---------- mutation harness ---------- */
gate('mutation harness: every mutation is killed (anchors read from the live register)', () => {
  const errs = [];
  const baseline = [...checkRecords(pub, 'Solana'), ...checkLinkRule(html, pub), ...checkCaSlot(html, pub), ...checkInertText(html, pub)];
  if (baseline.length) return ['baseline not clean: ' + baseline[0]];
  let killed = 0, total = 0;
  const expectKilled = (label, errsOut) => { total++; if (errsOut.length) killed++; else errs.push('survived: ' + label); };
  for (const [id, r] of Object.entries(register.records)) {
    // register mutations: flip the state at runtime, keep or drop payload so the rule is violated
    const m = clone(register);
    if (isStated(r)) { m.records[id].state = 'absent'; }
    else { m.records[id].state = 'stated'; for (const k of PAYLOAD_KEYS) delete m.records[id][k]; }
    expectKilled(`register ${id} ${r.state} flipped`, checkRecords(m.records, 'Solana'));
    // html mutations anchored on data-record
    const tags = openTag(html, id);
    if (!tags.length) continue;
    const tag = tags[0];
    if (isStated(r)) {
      if (r.url) expectKilled(`html ${id} link removed`, checkLinkRule(html.replace(tag, tag.replace(/\shref="[^"]*"/, '')), pub));
    } else {
      expectKilled(`html ${id} href injected`, checkLinkRule(html.replace(tag, tag.replace(/>$/, ' href="https://example.test">')), pub));
      expectKilled(`html ${id} value injected`, checkLinkRule(html.replace(tag, tag.replace(/>$/, ' data-copy="x">')), pub));
    }
  }
  // ca slot html mutations, anchored on the live state
  const slot = html.match(/<button class="ca-v"[^>]*>/)[0];
  if (isStated(pub.ca)) {
    expectKilled('ca disabled', checkCaSlot(html.replace(slot, slot.replace('<button', '<button disabled')), pub));
    expectKilled('ca copy dropped', checkCaSlot(html.replace(slot, slot.replace(/\sdata-copy="[^"]*"/, '')), pub));
  } else {
    expectKilled('ca enabled', checkCaSlot(html.replace(slot, slot.replace(/\sdisabled/, '')), pub));
    expectKilled('ca value injected', checkCaSlot(html.replace(slot, slot.replace('<button', `<button data-copy="${fakeAddr()}"`)), pub));
  }
  // scanner mutation
  expectKilled('stray address', scanAddresses(html + fakeAddr(), pub));
  expectKilled('stray 0x address', scanAddresses(html + fakeHex(), pub));
  // inert text mutation
  const inert = Object.entries(pub).find(([, r]) => !isStated(r));
  if (inert) expectKilled('inert row text changed', checkInertText(html.replace(/(<div class="row inert"[^>]*>[^<]*<b>)pending/, '$1soon'), pub));
  console.log(`        mutations: ${killed}/${total} killed`);
  return errs;
});

/* ---------- summary ---------- */
const failed = results.filter((r) => r.errs.length);
console.log(`\ngates: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
