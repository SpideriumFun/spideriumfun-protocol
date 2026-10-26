// Number formatting. Every formatter returns a dash for missing input.
const DASH = '—';
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

const group = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function compactUsd(n) {
  if (!isNum(n)) return DASH;
  const a = Math.abs(n);
  const [d, s] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  const v = n / d;
  const dec = s === '' ? (a >= 100 ? 0 : 2) : Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return '$' + v.toFixed(dec) + s;
}

export function price(n) {
  if (!isNum(n)) return DASH;
  if (n >= 1000) return '$' + group(n);
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(4);
  if (n === 0) return '$0';
  // tiny values: 0.0 + subscript zero count + three significant digits
  const exp = Math.floor(Math.log10(n));
  const zeros = -exp - 1;
  if (zeros < 3) return '$' + n.toFixed(zeros + 3);
  const digits = Math.round(n / Math.pow(10, exp - 2)).toString().slice(0, 3);
  return '$0.0' + String(zeros).split('').map((c) => SUB[+c]).join('') + digits;
}

export function pct(n) {
  if (!isNum(n)) return DASH;
  const a = Math.abs(n);
  const body = a >= 1000 ? group(a) : a.toFixed(a >= 100 ? 0 : 1);
  return (n > 0 ? '+' : n < 0 ? '−' : '') + body + '%';
}

export const int = (n) => (isNum(n) ? String(Math.round(n)) : DASH);
export const shortAddr = (a) => (typeof a === 'string' && a.length > 12 ? a.slice(0, 5) + '…' + a.slice(-4) : DASH);
export const dash = DASH;
