// Motion: damped spring reveals, count-up with flash, spotlight, parallax, progress.
// Every effect checks reduced() and falls back to the final state at once.

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reduced = () => !!(mq && mq.matches);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

if (typeof document !== 'undefined') {
  const sync = () => document.documentElement.classList.toggle('reduce', reduced());
  sync();
  if (mq && mq.addEventListener) mq.addEventListener('change', sync);
}

// Damped spring toward `to`. Semi-implicit Euler on a fixed sub-step.
export function spring(onTick, { k = 170, c = 19, from = 0, to = 1, delay = 0, done } = {}) {
  let x = from, v = 0, last = 0, t0 = 0, raf = 0, dead = false;
  const h = 1 / 240;
  function frame(t) {
    if (dead) return;
    if (!t0) { t0 = t; last = t; }
    if (t - t0 < delay) { raf = requestAnimationFrame(frame); return; }
    let dt = Math.min(0.04, (t - last) / 1000); last = t;
    while (dt > 0) {
      const s = Math.min(h, dt);
      v += (-k * (x - to) - c * v) * s;
      x += v * s;
      dt -= s;
    }
    onTick(x);
    if (Math.abs(x - to) < 0.0008 && Math.abs(v) < 0.0008) { onTick(to); if (done) done(); return; }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

function revealOne(el, delay) {
  const finish = () => { el.style.opacity = ''; el.style.transform = ''; el.classList.add('rv-done'); };
  if (reduced()) return finish();
  el.style.opacity = '0';
  spring((x) => {
    el.style.opacity = String(clamp(x * 1.4, 0, 1));
    el.style.transform = `translate3d(0,${((1 - x) * 28).toFixed(2)}px,0) scale(${(0.985 + 0.015 * x).toFixed(4)})`;
  }, { delay, done: finish });
}

export function initReveal() {
  const els = [...document.querySelectorAll('.rv')];
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('rv-done')); return; }
  const io = new IntersectionObserver((entries) => {
    const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => (a.target.compareDocumentPosition(b.target) & 4 ? -1 : 1));
    hit.forEach((e, i) => { io.unobserve(e.target); revealOne(e.target, i * 70); });
  }, { threshold: 0.08 });
  els.forEach((e) => io.observe(e));
  // safety net: nothing may stay hidden if observation never fires
  setTimeout(() => els.forEach((e) => { if (!e.classList.contains('rv-done') && !e.style.opacity) { io.unobserve(e); revealOne(e, 0); } }), 4000);
}

const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

// Tween the numeric value shown in `el`. Flashes the element when the value changes.
export function countTo(el, to, fmt, { flash = true, dur = 700 } = {}) {
  if (el._cancel) el._cancel();
  const from = typeof el._v === 'number' ? el._v : 0;
  const first = typeof el._v !== 'number';
  el._v = to;
  if (typeof to !== 'number' || !Number.isFinite(to)) { el.textContent = fmt(to); return; }
  if (reduced() || (!first && from === to)) { el.textContent = fmt(to); return; }
  if (!first && flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  const t0 = performance.now();
  let raf = 0;
  const tick = (t) => {
    const p = clamp((t - t0) / dur, 0, 1);
    el.textContent = fmt(from + (to - from) * easeOutExpo(p));
    if (p < 1) raf = requestAnimationFrame(tick); else el.textContent = fmt(to);
  };
  raf = requestAnimationFrame(tick);
  el._cancel = () => cancelAnimationFrame(raf);
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.spot, .brow');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
    t.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
  }, { passive: true });
}

// Scroll progress for whichever element currently scrolls.
export function initProgress(center) {
  const bar = document.getElementById('progress');
  const wide = matchMedia('(max-width:900px)');
  const read = () => {
    const el = wide.matches ? document.scrollingElement : center;
    const max = el.scrollHeight - el.clientHeight;
    bar.style.setProperty('--p', max > 0 ? clamp(el.scrollTop / max, 0, 1).toFixed(4) : '0');
  };
  center.addEventListener('scroll', read, { passive: true });
  addEventListener('scroll', read, { passive: true });
  addEventListener('resize', read);
  read();
}

// Hero parallax: pointer and scroll both move each .layer by its data-depth.
export function initParallax(stage, center) {
  const layers = [...stage.querySelectorAll('.layer')].map((el) => ({ el, d: parseFloat(el.dataset.depth) || 0 }));
  if (reduced()) return;
  const wide = matchMedia('(max-width:900px)');
  let tx = 0, ty = 0, cx = 0, cy = 0, sc = 0, tsc = 0, raf = 0, visible = true;
  const scrollTop = () => (wide.matches ? window.scrollY : center.scrollTop);
  const pump = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop); };
  function loop() {
    raf = 0;
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08; sc += (tsc - sc) * 0.12;
    for (const { el, d } of layers) {
      el.style.transform = `translate3d(${(-cx * d * 90).toFixed(2)}px,${(-cy * d * 60 + sc * d * 260).toFixed(2)}px,0)`;
    }
    if (Math.abs(tx - cx) + Math.abs(ty - cy) + Math.abs(tsc - sc) > 0.002) raf = requestAnimationFrame(loop);
  }
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
    ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
    pump();
  }, { passive: true });
  stage.addEventListener('pointerleave', () => { tx = 0; ty = 0; pump(); });
  const onScroll = () => { tsc = clamp(scrollTop() / Math.max(1, stage.offsetHeight), 0, 1.4); pump(); };
  center.addEventListener('scroll', onScroll, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) pump(); }).observe(stage);
  document.addEventListener('visibilitychange', pump);
}
