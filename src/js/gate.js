// Register + gate logic shared by the build, the gates and the browser.
// Pure functions only: no DOM, no node APIs.

export const STATES = ['stated', 'absent', 'unconfirmed'];
export const PAYLOAD_KEYS = ['value', 'url', 'rpc', 'boosts', 'pairs', 'address'];
export const PUBLIC_KEYS = ['label', 'state', ...PAYLOAD_KEYS];

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX = /^0x[0-9a-fA-F]{40}$/;

export const isStated = (r) => !!r && r.state === 'stated';

// Strip build-only fields (source, scope, recorded dates) and enforce the inert rule.
export function toPublic(register) {
  const out = {};
  for (const [id, r] of Object.entries(register.records)) {
    const p = { label: r.label, state: r.state };
    if (isStated(r)) for (const k of PAYLOAD_KEYS) if (r[k] != null) p[k] = r[k];
    out[id] = p;
  }
  return out;
}

export function validateRecord(id, r, chainValue) {
  const errs = [];
  if (!STATES.includes(r.state)) errs.push(`${id}: bad state`);
  if (r.state !== 'stated') {
    for (const k of PAYLOAD_KEYS) if (k in r) errs.push(`${id}: inert record carries ${k}`);
  } else {
    if (!PAYLOAD_KEYS.some((k) => r[k])) errs.push(`${id}: stated record has no payload`);
    if (id === 'ca' && !isAddress(r.value, chainValue)) errs.push(`${id}: value is not address-shaped for ${chainValue}`);
    if (r.url && !/^https:\/\//.test(r.url)) errs.push(`${id}: url must be https`);
  }
  return errs;
}

export function isAddress(v, chain = 'Solana') {
  if (typeof v !== 'string') return false;
  return /solana/i.test(chain) ? B58.test(v) : HEX.test(v) || B58.test(v);
}

// Derive a handle from a stored URL (store the URL, derive the handle).
export function handleFromUrl(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : '';
  } catch { return ''; }
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Address scanner. Finds address-shaped strings and keeps those that do not match
// a stated registry value. Never rejects a 0x string merely for being 0x.
const SCAN = /0x[0-9a-fA-F]{40}\b|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
export function scanAddresses(text, registry) {
  const stated = new Set();
  for (const r of Object.values(registry)) if (isStated(r)) for (const k of PAYLOAD_KEYS) if (typeof r[k] === 'string') stated.add(r[k]);
  const found = text.match(SCAN) || [];
  return found.filter((a) => !stated.has(a));
}
