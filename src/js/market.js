// Live market feed. Driven only by the market register record it is handed:
// this module imports nothing and never sees any other record.

export const POLL_MS = 60000;
export const BACKOFF_BASE = 2 * 1000;
export const BACKOFF_MAX = 60000;
export const TIMEOUT_MS = 12000;
export const ROWS = 10;
export const MAX_ADDRESSES = 30;

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function selectSolana(boosts) {
  if (!Array.isArray(boosts)) return [];
  const seen = new Set();
  const out = [];
  for (const b of boosts) {
    if (!b || b.chainId !== 'solana' || typeof b.tokenAddress !== 'string') continue;
    if (seen.has(b.tokenAddress)) continue;
    seen.add(b.tokenAddress);
    out.push(b.tokenAddress);
    if (out.length >= MAX_ADDRESSES) break;
  }
  return out;
}

const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

// One row per base token (deepest pool wins), top ROWS by 24h volume.
export function toRows(pairs) {
  if (!Array.isArray(pairs)) return [];
  const best = new Map();
  for (const p of pairs) {
    if (!p || p.chainId !== 'solana' || !p.baseToken || typeof p.baseToken.address !== 'string') continue;
    const liq = num(p.liquidity && p.liquidity.usd) || 0;
    const cur = best.get(p.baseToken.address);
    if (!cur || liq > cur.liq) best.set(p.baseToken.address, { p, liq });
  }
  const rows = [...best.values()].map(({ p, liq }) => ({
    address: p.baseToken.address,
    symbol: String(p.baseToken.symbol || '?').slice(0, 14),
    name: String(p.baseToken.name || p.baseToken.symbol || '').slice(0, 40),
    price: num(p.priceUsd),
    change: num(p.priceChange && p.priceChange.h24),
    volume: num(p.volume && p.volume.h24) || 0,
    liquidity: liq,
    imageUrl: httpsOnly(p.info && p.info.imageUrl),
    url: httpsOnly(p.url),
  }));
  rows.sort((a, b) => b.volume - a.volume);
  return rows.slice(0, ROWS);
}

export function backoffDelay(attempt, rand = Math.random) {
  const d = Math.min(BACKOFF_MAX, BACKOFF_BASE * Math.pow(2, Math.max(0, attempt)));
  return Math.round(d * (0.75 + rand() * 0.5));
}

// record: the market register record. env is injectable for tests.
export function createMarket(record, onUpdate, env = {}) {
  const f = env.fetch || ((...a) => fetch(...a));
  const doc = env.doc || (typeof document !== 'undefined' ? document : { hidden: false, addEventListener() {} });
  const setT = env.setTimeout || ((...a) => setTimeout(...a));
  const clearT = env.clearTimeout || ((t) => clearTimeout(t));
  const rand = env.rand || Math.random;

  const st = { status: 'loading', rows: [], candidates: 0, retries: 0, error: '' };
  let timer = null, busy = false, started = false;

  const emit = (extra) => onUpdate({ ...st, ...extra });

  async function getJson(url) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = ctl ? setT(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await f(url, ctl ? { signal: ctl.signal } : undefined);
      if (!res.ok) throw new Error('http ' + res.status);
      return await res.json();
    } finally { if (to != null) clearT(to); }
  }

  function schedule(ms) {
    clearT(timer); timer = null;
    if (!started || doc.hidden) return;
    timer = setT(run, ms);
  }

  async function run() {
    if (busy || !started) return;
    busy = true; clearT(timer); timer = null;
    try {
      const addrs = selectSolana(await getJson(record.boosts));
      if (!addrs.length) throw new Error('no solana entries');
      const rows = toRows(await getJson(record.pairs + addrs.join(',')));
      if (!rows.length) throw new Error('no pairs');
      st.rows = rows; st.candidates = addrs.length; st.retries = 0; st.error = ''; st.status = 'live';
      emit({ event: 'ok' });
      schedule(POLL_MS);
    } catch (e) {
      st.retries += 1; st.error = String(e && e.message || e);
      st.status = st.rows.length ? 'hold' : st.retries >= 2 ? 'error' : 'retry';
      emit({ event: 'fail' });
      schedule(backoffDelay(st.retries - 1, rand));
    } finally { busy = false; }
  }

  function onVis() {
    if (!started) return;
    if (doc.hidden) { clearT(timer); timer = null; } else run();
  }

  return {
    state: st,
    run,
    start() {
      if (started) return;
      started = true;
      if (record.state !== 'stated' || !record.boosts || !record.pairs) { st.status = 'pending'; emit({ event: 'pending' }); return; }
      doc.addEventListener('visibilitychange', onVis);
      emit({ event: 'start' });
      if (!doc.hidden) run();
    },
    stop() { started = false; clearT(timer); timer = null; },
  };
}
