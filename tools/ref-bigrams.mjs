// One-off: hash every bigram and word of the reference copy so the gate can compare
// without keeping the reference text in the repo.
import fs from 'node:fs';
import { htmlUnits, jsUnits, bigrams, h, unigramsOf } from './copy-lib.mjs';
const dir = process.argv[2];
const units = [];
for (const f of ['index.html', 'docs.html']) {
  const s = fs.readFileSync(dir + '/' + f, 'utf8');
  units.push(...htmlUnits(s));
  for (const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g)) units.push(...jsUnits(m[1]));
}
const bg = [...bigrams(units).keys()].map(h);
fs.writeFileSync(new URL('./reference-bigrams.json', import.meta.url), JSON.stringify([...new Set(bg)].sort()));
fs.writeFileSync(new URL('./reference-words.json', import.meta.url), JSON.stringify([...unigramsOf(units)].map(h).sort()));
console.log('bigrams', new Set(bg).size, 'units', units.length);
