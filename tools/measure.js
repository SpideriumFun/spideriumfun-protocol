// Paste into the page console (or run via a browser tool) after the page has loaded.
(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const out = { vw: innerWidth, vh: innerHeight };
  const doc = document.scrollingElement;
  out.hOverflow = Math.max(doc.scrollWidth - innerWidth, document.getElementById('center').scrollWidth - document.getElementById('center').clientWidth);
  const small = [];
  document.querySelectorAll('a[href],button:not([disabled]),[role="button"],input,select').forEach((e) => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) small.push((e.id || e.className || e.tagName) + ':' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  out.smallTargets = [...new Set(small)];
  const ca = document.getElementById('caSlot'), cat = document.getElementById('caText');
  const cs = getComputedStyle(cat);
  out.ca = { rect: R(ca), text: cat.textContent, fontPx: cs.fontSize, lines: Math.round(cat.getBoundingClientRect().height / parseFloat(cs.lineHeight || cs.fontSize * 1.3)), inView: R(ca).y >= 0 && R(ca).y + R(ca).h <= innerHeight && R(ca).x >= 0 && R(ca).x + R(ca).w <= innerWidth, position: getComputedStyle(ca).position };
  out.top = R(document.querySelector('header.top'));
  out.social = [...document.querySelectorAll('.social .icon-btn')].map((e) => ({ rec: e.dataset.record, tag: e.tagName, href: e.getAttribute('href'), visible: vis(e), ...R(e), rightGap: innerWidth - Math.round(e.getBoundingClientRect().right), text: e.textContent.trim() }));
  const logo = document.querySelector('.brand img'), hero = document.querySelector('.l-logo img');
  out.logo = { brand: { ok: logo.complete && logo.naturalWidth > 0, nat: logo.naturalWidth + 'x' + logo.naturalHeight, src: logo.getAttribute('src'), ...R(logo) }, hero: { ok: hero.complete && hero.naturalWidth > 0, nat: hero.naturalWidth, src: hero.getAttribute('src'), ...R(hero) } };
  out.stage = R(document.getElementById('web'));
  out.rows = document.querySelectorAll('#rowsBoard .brow:not(.skel)').length;
  out.firstRowVisible = (() => { const r = document.querySelector('#rowsBoard .brow'); return r ? R(r) : null; })();
  out.status = document.getElementById('pillText').textContent;
  out.fonts = { body: getComputedStyle(document.body).fontFamily.slice(0, 20), lede: getComputedStyle(document.querySelector('.lede')).fontSize };
  out.ticker = { w: R(document.getElementById('ticker')).w, dur: getComputedStyle(document.getElementById('track')).getPropertyValue('--dur') };
  out.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return JSON.stringify(out);
})()
