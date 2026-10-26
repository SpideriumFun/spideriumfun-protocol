// Build: src/ -> dist/. Pure node, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toPublic, validateRecord, isStated, handleFromUrl, esc } from '../src/js/gate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// Files that must exist in dist/ (the logo is explicit on purpose).
export const REQUIRED = [
  'index.html', 'tokens.css', 'styles.css',
  'js/app.js', 'js/gate.js', 'js/market.js', 'js/motion.js', 'js/web.js', 'js/fmt.js',
  'assets/logo-128.png', 'assets/logo-512.png', 'assets/logo-1024.png',
  'assets/apple-touch-icon.png', 'assets/banner.jpg', 'assets/favicon.svg',
];

const ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const ICON_GH = '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const ICONS = { x: ICON_X, github: ICON_GH };
const NAMES = { x: 'X', github: 'GitHub' };

export function renderSocial(reg) {
  return ['x', 'github'].map((id) => {
    const r = reg[id];
    if (isStated(r) && r.url) {
      const h = handleFromUrl(r.url);
      return `<a class="icon-btn" data-record="${id}" data-state="stated" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="${NAMES[id]}${h ? ', ' + esc(h) : ''}">${ICONS[id]}</a>`;
    }
    return `<span class="icon-btn inert" data-record="${id}" data-state="${esc(r.state)}" role="img" aria-disabled="true" aria-label="${NAMES[id]}, pending">${ICONS[id]}</span>`;
  }).join('');
}

export function renderCa(reg) {
  const r = reg.ca;
  if (isStated(r) && r.value) {
    return `<div class="hud ca" id="caSlot" data-record="ca" data-state="stated"><span class="ca-k">CA</span><button class="ca-v" id="caBtn" type="button" data-copy="${esc(r.value)}" aria-label="Copy contract address"><span class="ca-t" id="caText">${esc(r.value)}</span></button><span class="ca-act" id="caAct" aria-live="polite">copy</span></div>`;
  }
  return `<div class="hud ca inert" id="caSlot" data-record="ca" data-state="${esc(r.state)}"><span class="ca-k">CA</span><button class="ca-v" id="caBtn" type="button" disabled aria-disabled="true" aria-label="Contract, pending"><span class="ca-t" id="caText">pending</span></button><span class="ca-act" id="caAct" aria-live="polite"></span></div>`;
}

export function renderRegisterRows(reg) {
  const order = ['chain', 'ca', 'x', 'github', 'market'];
  return order.map((id) => {
    const r = reg[id];
    if (!isStated(r)) return `<div class="row inert" data-record="${id}" data-state="${esc(r.state)}">${esc(r.label)}<b>pending</b></div>`;
    if (r.url) return `<div class="row" data-record="${id}" data-state="stated">${esc(r.label)}<b><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(handleFromUrl(r.url) || r.url)}</span></a></b></div>`;
    const v = id === 'ca' ? 'set' : r.value;
    return `<div class="row" data-record="${id}" data-state="stated">${esc(r.label)}<b>${esc(v)}</b></div>`;
  }).join('\n        ');
}

export function renderPage(template, reg) {
  return template
    .replace('<!--SOCIAL-->', () => renderSocial(reg))
    .replace('<!--CASLOT-->', () => renderCa(reg))
    .replace('<!--REGROWS-->', () => renderRegisterRows(reg))
    .replace('__REGISTER__', () => JSON.stringify(reg).replace(/</g, '\\u003c'));
}

export function loadRegister(file = path.join(ROOT, 'register.json')) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const chain = raw.records.chain && raw.records.chain.value;
  const errs = Object.entries(raw.records).flatMap(([id, r]) => validateRecord(id, r, chain));
  if (errs.length) throw new Error('register invalid:\n' + errs.join('\n'));
  return raw;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}

export function build(outDir = DIST, register = loadRegister()) {
  fs.rmSync(outDir, { recursive: true, force: true });
  copyDir(SRC, outDir);
  const pub = toPublic(register);
  const html = renderPage(fs.readFileSync(path.join(SRC, 'index.html'), 'utf8'), pub);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  // the logo must be present in dist and referenced by relative path
  for (const f of REQUIRED) if (!fs.existsSync(path.join(outDir, f))) throw new Error('missing in dist: ' + f);
  for (const ref of ['assets/logo-128.png', 'assets/logo-1024.png']) {
    if (!html.includes(`"${ref}"`)) throw new Error('index.html does not reference ' + ref);
  }
  return { outDir, pub };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { outDir } = build();
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(path.relative(outDir, p)); } })(outDir);
  console.log(`dist ready: ${files.length} files`);
  for (const f of ['assets/logo-128.png', 'assets/logo-512.png', 'assets/logo-1024.png']) console.log(`  ${f} ${fs.statSync(path.join(outDir, f)).size} bytes`);
}
