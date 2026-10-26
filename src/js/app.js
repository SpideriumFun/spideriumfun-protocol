import { esc, isStated } from './gate.js';
import { createMarket } from './market.js';
import * as F from './fmt.js';
import { reduced, countTo, initReveal, initSpotlight, initProgress, initParallax } from './motion.js';
import { initWeb } from './web.js';

const $ = (id) => document.getElementById(id);
const reg = JSON.parse($('register').textContent);
const center = $('center');

// theme colour comes from the token file, not from a literal here
const tc = document.querySelector('meta[name="theme-color"]');
if (tc) tc.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim());

/* ---------- copy ---------- */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  t.remove();
  return ok;
}

let toastT = 0;
function toast(head, body) {
  const el = $('toast');
  el.querySelector('b').textContent = head;
  el.querySelector('span').textContent = body;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2200);
}

/* ---------- contract slot (inert until stated) ---------- */
const caBtn = $('caBtn');
if (caBtn && !caBtn.disabled && caBtn.dataset.copy) {
  const slot = $('caSlot'), act = $('caAct');
  caBtn.addEventListener('click', async () => {
    const ok = await copyText(caBtn.dataset.copy);
    act.textContent = ok ? 'copied' : 'press ctrl c';
    slot.classList.toggle('copied', ok);
    if (ok) toast('COPIED', 'Contract address is on your clipboard.');
    setTimeout(() => { act.textContent = 'copy'; slot.classList.remove('copied'); }, 1400);
  });
}

/* ---------- what this page does (from the register) ---------- */
(function renderWhat() {
  const rows = [
    ['Reads a public feed of the busiest Solana pairs', reg.market],
    ['Shows the contract address in a copy slot', reg.ca],
    ['Links to the project on X', reg.x],
    ['Links to the code on GitHub', reg.github],
  ];
  $('whatTable').querySelector('tbody').innerHTML = rows.map(([t, r]) => {
    const on = isStated(r);
    return `<tr><td>${esc(t)}</td><td class="${on ? '' : 'p'}">${on ? 'ACTIVE' : 'PENDING'}</td></tr>`;
  }).join('');
})();

/* ---------- board ---------- */
const board = $('rowsBoard');
const note = $('boardNote');
const SK = (i) => `<div class="brow skel" aria-hidden="true"><span class="rk"><i class="sk l"></i></span><span class="tok"><i class="sk c"></i><i class="sk l"></i></span><i class="sk"></i><i class="sk"></i><i class="sk"></i><i class="sk"></i><i></i></div>`;
board.innerHTML = Array.from({ length: 10 }, (_, i) => SK(i)).join('');

const COPY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M5 1.5A1.5 1.5 0 0 1 6.5 0h6A1.5 1.5 0 0 1 14 1.5v8a1.5 1.5 0 0 1-1.5 1.5H11V9.5h1.5v-8h-6V3H5zM2.5 5A1.5 1.5 0 0 0 1 6.5v8A1.5 1.5 0 0 0 2.5 16h6a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 8.5 5zm0 1.5h6v8h-6z"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M13.78 3.97a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l2.47 2.47 5.97-5.97a.75.75 0 0 1 1.06 0z"/></svg>';

let rows = [], sort = 'volume', selected = null, first = true;
const nodes = new Map(); // address -> row element

function logoTile(r) {
  const t = document.createElement('span');
  t.className = 'logo-tile';
  const letter = () => { t.textContent = (r.symbol || '?').trim().charAt(0) || '?'; };
  if (r.imageUrl) {
    const img = new Image();
    img.alt = ''; img.width = 34; img.height = 34; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => { img.remove(); letter(); };
    img.src = r.imageUrl;
    t.appendChild(img);
  } else letter();
  return t;
}

function buildRow(r) {
  const el = document.createElement('div');
  el.className = 'brow spot in';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.dataset.addr = r.address;
  el.innerHTML = `<span class="rk"></span><span class="tok"><span class="nm"><b></b><small></small></span></span>
    <span class="n pr" data-l="Price"></span><span class="n ch" data-l="24h"></span><span class="n vo" data-l="Volume"></span><span class="n liq" data-l="Depth"></span>
    <button type="button" class="cp" aria-label="">${COPY_ICON}</button>`;
  el.querySelector('.tok').prepend(logoTile(r));
  el.addEventListener('click', () => select(r.address));
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); select(r.address); } });
  const cp = el.querySelector('.cp');
  cp.addEventListener('click', async (e) => {
    e.stopPropagation();
    const cur = rows.find((x) => x.address === r.address) || r;
    const ok = await copyText(cur.address);
    if (ok) { cp.classList.add('ok'); cp.innerHTML = CHECK_ICON; toast('COPIED', cur.symbol + ' address is on your clipboard.'); setTimeout(() => { cp.classList.remove('ok'); cp.innerHTML = COPY_ICON; }, 1300); }
  });
  return el;
}

function fillRow(el, r, i, animate) {
  el.querySelector('.rk').textContent = String(i + 1).padStart(2, '0');
  const nm = el.querySelector('.nm');
  nm.firstElementChild.textContent = r.symbol;
  nm.lastElementChild.textContent = r.name;
  el.querySelector('.cp').setAttribute('aria-label', 'Copy address for ' + r.symbol);
  const set = (sel, v, fmt, cls) => {
    const c = el.querySelector(sel);
    if (cls) { c.classList.toggle('up', v > 0); c.classList.toggle('dn', v < 0); }
    if (animate) countTo(c, v, fmt); else { c._v = v; c.textContent = fmt(v); }
  };
  set('.pr', r.price, F.price);
  set('.ch', r.change, F.pct, true);
  set('.vo', r.volume, F.compactUsd);
  set('.liq', r.liquidity, F.compactUsd);
}

const sorters = { volume: (a, b) => b.volume - a.volume, change: (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity), liquidity: (a, b) => b.liquidity - a.liquidity };

function renderBoard(animate) {
  const list = [...rows].sort(sorters[sort]);
  const keep = new Set(list.map((r) => r.address));
  for (const [a, el] of nodes) if (!keep.has(a)) { el.remove(); nodes.delete(a); }
  if (first) board.innerHTML = '';
  list.forEach((r, i) => {
    let el = nodes.get(r.address);
    const fresh = !el;
    if (fresh) { el = buildRow(r); nodes.set(r.address, el); el.style.setProperty('--i', i); }
    else el.classList.remove('in');
    fillRow(el, r, i, animate);
    el.classList.toggle('sel', r.address === selected);
    if (board.children[i] !== el) board.insertBefore(el, board.children[i] || null);
  });
}

function select(addr) {
  selected = addr;
  nodes.forEach((el, a) => el.classList.toggle('sel', a === addr));
  renderFocus();
}

function renderFocus() {
  const r = rows.find((x) => x.address === selected);
  const body = $('focusBody');
  if (!r) { body.innerHTML = '<div class="empty">Choose a row for details.</div>'; $('focusTag').textContent = 'NONE PICKED'; return; }
  $('focusTag').textContent = r.symbol;
  const link = r.url && /^https:\/\/([a-z0-9-]+\.)*dexscreener\.com\//.test(r.url) ? `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Open pair</a>` : '';
  body.innerHTML = `<div class="big">${esc(r.symbol)}</div><div class="cls">${esc(r.name)}</div><div class="st">${esc(F.price(r.price))}</div>
    <div class="ctl"><button type="button" id="fCopy">Copy address</button>${link}</div>
    <div class="rows"><div class="row">24h<b>${esc(F.pct(r.change))}</b></div><div class="row">Volume<b>${esc(F.compactUsd(r.volume))}</b></div><div class="row">Depth<b>${esc(F.compactUsd(r.liquidity))}</b></div><div class="row">Address<b>${esc(F.shortAddr(r.address))}</b></div></div>`;
  $('fCopy').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (await copyText(r.address)) { b.textContent = 'Copied'; b.classList.add('on'); toast('COPIED', r.symbol + ' address is on your clipboard.'); setTimeout(() => { b.textContent = 'Copy address'; b.classList.remove('on'); }, 1300); }
  });
}

document.querySelectorAll('.sort button').forEach((b) => b.addEventListener('click', () => {
  sort = b.dataset.sort;
  document.querySelectorAll('.sort button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
  if (rows.length) renderBoard(false);
}));

/* ---------- panels ---------- */
const pulseNums = { kList: $('kList'), kUp: $('kUp'), kVol: $('kVol'), kLiq: $('kLiq') };
function renderPulse() {
  countTo(pulseNums.kList, rows.length, F.int);
  countTo(pulseNums.kUp, rows.filter((r) => r.change > 0).length, F.int);
  countTo(pulseNums.kVol, rows.reduce((s, r) => s + r.volume, 0), F.compactUsd);
  countTo(pulseNums.kLiq, rows.reduce((s, r) => s + r.liquidity, 0), F.compactUsd);
  const total = rows.reduce((s, r) => s + r.volume, 0) || 1;
  const top = [...rows].sort(sorters.volume).slice(0, 3);
  const restShare = 1 - top.reduce((s, r) => s + r.volume, 0) / total;
  const bars = top.map((r) => [r.symbol, r.volume / total]).concat([['rest', restShare]]);
  const host = $('shareBars');
  if (host.children.length !== bars.length) host.innerHTML = bars.map(() => '<div class="bar"><span></span><s><i style="transform:scaleX(0)"></i></s><em></em></div>').join('');
  bars.forEach(([n, v], i) => {
    const b = host.children[i];
    b.children[0].textContent = n;
    b.children[2].textContent = Math.round(v * 100) + '%';
    requestAnimationFrame(() => { b.querySelector('i').style.transform = `scaleX(${Math.max(0.01, v).toFixed(3)})`; });
  });
  const sw = [...rows].filter((r) => F.isNum(r.change)).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);
  $('swings').innerHTML = sw.map((r) => `<div class="it ${r.change < 0 ? 'dn' : ''}"><i></i><span>${esc(r.symbol)}</span><b>${esc(F.pct(r.change))}</b></div>`).join('') || '<div class="empty">Awaiting reading.</div>';
}

function renderTicker() {
  const track = $('track');
  if (!rows.length) return;
  const item = (r) => `<span class="tk"><b>${esc(r.symbol)}</b><span>${esc(F.price(r.price))}</span><span class="${r.change > 0 ? 'up' : r.change < 0 ? 'dn' : ''}">${esc(F.pct(r.change))}</span></span>`;
  const once = [...rows].sort(sorters.volume).map(item).join('');
  track.innerHTML = once + `<span class="dup" aria-hidden="true" style="display:contents">${once}</span>`;
  const half = track.scrollWidth / 2;
  track.style.setProperty('--dur', Math.max(20, half / 48).toFixed(1) + 's');
}

let logN = 0;
function journal(head, text, bad) {
  const log = $('log');
  const e = document.createElement('div');
  e.className = 'le' + (bad ? ' bad' : '');
  e.innerHTML = `<div class="lh"><span>#${String(++logN).padStart(3, '0')}</span><div><b>${esc(head)}</b></div></div><p>${esc(text)}</p>`;
  log.prepend(e);
  while (log.children.length > 40) log.lastElementChild.remove();
  $('logN').textContent = logN + (logN === 1 ? ' NOTE' : ' NOTES');
}

const LABEL = { loading: 'SYNCING', live: 'LIVE', retry: 'RETRYING', hold: 'HOLDING', error: 'OFFLINE', pending: 'PENDING' };
function setStatus(s) {
  for (const id of ['status', 'pill']) $(id).dataset.s = s;
  $('statusText').textContent = LABEL[s]; $('pillText').textContent = LABEL[s];
  $('feedStatus').textContent = LABEL[s];
  $('feedTag').textContent = s === 'live' ? 'OK' : s === 'pending' ? 'IDLE' : s === 'loading' ? '—' : 'DEGRADED';
}

/* ---------- market (follows the market record only) ---------- */
const web = initWeb($('cv'));
const mk = createMarket(reg.market, (u) => {
  setStatus(u.status);
  $('feedRetry').textContent = String(u.retries);
  if (u.event === 'ok') {
    const animate = !first || !reduced();
    rows = u.rows;
    if (!rows.some((r) => r.address === selected)) selected = rows[0].address;
    renderBoard(animate);
    first = false;
    renderPulse(); renderTicker(); renderFocus();
    note.textContent = ''; note.classList.remove('err');
    journal('REFRESH', `${rows.length} rows from ${u.candidates} candidates.`);
    web.burst(7);
  } else if (u.event === 'fail') {
    if (rows.length) {
      note.textContent = 'Source unreachable. Showing the last good reading and retrying.';
    } else {
      note.textContent = 'Source unreachable. Retrying with backoff.';
      if (u.status === 'error' && first) {
        board.innerHTML = Array.from({ length: 10 }, (_, i) => `<div class="brow"><span class="rk">${String(i + 1).padStart(2, '0')}</span><span class="tok"><span class="logo-tile">${F.dash}</span><span class="nm"><b>${F.dash}</b><small>${F.dash}</small></span></span><span class="n pr" data-l="Price">${F.dash}</span><span class="n ch" data-l="24h">${F.dash}</span><span class="n vo" data-l="Volume">${F.dash}</span><span class="n liq" data-l="Depth">${F.dash}</span><span></span></div>`).join('');
        for (const k of Object.values(pulseNums)) k.textContent = F.dash;
      }
    }
    note.classList.add('err');
    journal('RETRY', `Attempt ${u.retries} failed: ${u.error}.`, true);
  } else if (u.event === 'pending') {
    note.textContent = 'Market source pending.';
  }
});
mk.start();

initReveal();
initSpotlight();
initProgress(center);
initParallax($('web'), center);
