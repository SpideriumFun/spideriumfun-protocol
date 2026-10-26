// Shared copy tokenizer: used to hash the reference bigrams once and to check our own copy.
import crypto from 'node:crypto';

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&mdash;': ' ', '&middot;': ' ', '&nbsp;': ' ', '&rsquo;': "'", '&ldquo;': ' ', '&rdquo;': ' ' };
const dec = (s) => s.replace(/&#?\w+;/g, (m) => (m in ENT ? ENT[m] : ' '));

// text units: strings that a reader could see
export function htmlUnits(html) {
  const units = [];
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const m of body.matchAll(/(?:aria-label|alt|title|placeholder)="([^"]*)"/g)) units.push(dec(m[1]));
  for (const m of body.matchAll(/<meta\s+(?:name="(?:description|twitter:(?:title|description))"|property="og:(?:title|description)")\s+content="([^"]*)"/g)) units.push(dec(m[1]));
  for (const t of body.replace(/<[^>]+>/g, '\n').split('\n')) if (t.trim()) units.push(dec(t));
  return units;
}

export function jsUnits(js) {
  const units = [];
  for (const m of js.matchAll(/(['"`])((?:\.|(?!\1)[^\\n])*?)\1/g)) {
    let s = m[2].replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]+>/g, ' ');
    s = dec(s);
    if (/[a-z]{2,}\s+[a-z]{2,}/i.test(s)) units.push(s);
  }
  // template literals spanning lines
  for (const m of js.matchAll(/`([^`]*)`/g)) {
    const s = dec(m[1].replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]+>/g, '\n'));
    for (const t of s.split('\n')) if (/[a-z]{2,}\s+[a-z]{2,}/i.test(t)) units.push(t);
  }
  return units;
}

export const words = (s) => s.toLowerCase().match(/[a-z0-9]+/g) || [];
export const h = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

export function bigrams(units) {
  const out = new Map();
  for (const u of units) {
    const w = words(u);
    for (let i = 0; i < w.length - 1; i++) { const k = w[i] + ' ' + w[i + 1]; if (!out.has(k)) out.set(k, u.trim().slice(0, 60)); }
  }
  return out;
}
export const unigramsOf = (units) => new Set(units.flatMap(words));
