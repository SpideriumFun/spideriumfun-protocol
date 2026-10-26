// Hero lattice: drifting nodes, silk strands, travelling signals. Colours are read
// from the token custom properties, so no literals live here.
import { reduced } from './motion.js';

export function initWeb(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { burst() {} };
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  const C = { uv: col('--c-uv'), uv2: col('--c-uv2'), silk: col('--c-line2'), deep: col('--c-uv-deep') };

  let W = 0, H = 0, dpr = 1, nodes = [], edges = [], pulses = [];
  let raf = 0, visible = true, last = 0, spawnAt = 0;
  const ptr = { x: -9999, y: -9999 };

  function seed() {
    const n = Math.max(22, Math.min(64, Math.round((W * H) / 15000)));
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
      r: 1 + Math.random() * 1.6, glow: 0,
    }));
    const set = new Set();
    edges = [];
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 })).filter((o) => o.j !== i).sort((p, q) => p.d - q.d).slice(0, 3);
      near.forEach(({ j }) => { const k = i < j ? i + ':' + j : j + ':' + i; if (!set.has(k)) { set.add(k); edges.push({ a: i, b: j, sag: (Math.random() - 0.3) * 14 }); } });
    });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    draw(0);
  }

  function strand(a, b, sag) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
    ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
  }
  const at = (e, t) => {
    const a = nodes[e.a], b = nodes[e.b], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + e.sag, u = 1 - t;
    return [u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y];
  };

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.silk; ctx.globalAlpha = 0.5;
    ctx.beginPath(); edges.forEach((e) => strand(nodes[e.a], nodes[e.b], e.sag)); ctx.stroke();
    for (const p of pulses) {
      const e = edges[p.e], t = p.t * p.t * (3 - 2 * p.t);
      const [x, y] = at(e, t), [x0, y0] = at(e, Math.max(0, t - 0.16));
      const g = ctx.createLinearGradient(x0, y0, x, y);
      g.addColorStop(0, 'transparent'); g.addColorStop(1, C.uv2);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = C.uv2; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.2832); ctx.fill();
    }
    ctx.lineWidth = 1;
    for (const n of nodes) {
      ctx.globalAlpha = 0.28 + n.glow * 0.5; ctx.fillStyle = C.uv;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + n.glow * 4, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.fillStyle = C.uv2;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 0.7, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function spawn() {
    if (!edges.length) return;
    pulses.push({ e: (Math.random() * edges.length) | 0, t: 0 });
    if (pulses.length > 14) pulses.shift();
  }

  function tick(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    for (const n of nodes) {
      n.x += n.vx * dt; n.y += n.vy * dt;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      const dx = ptr.x - n.x, dy = ptr.y - n.y, d2 = dx * dx + dy * dy;
      if (d2 < 22500) { n.x += dx * 0.6 * dt; n.y += dy * 0.6 * dt; }
      n.glow = Math.max(0, n.glow - dt * 1.4);
    }
    pulses = pulses.filter((p) => {
      p.t += dt / 1.5;
      if (p.t >= 1) { nodes[edges[p.e].b].glow = 1; return false; }
      return true;
    });
    if (now > spawnAt) { spawn(); spawnAt = now + 380 + Math.random() * 700; }
    draw(dt);
    raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && !reduced()) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.x = (e.clientX - r.left) * (W / r.width); ptr.y = (e.clientY - r.top) * (H / r.height);
  }, { passive: true });
  canvas.parentElement.addEventListener('pointerleave', () => { ptr.x = ptr.y = -9999; });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
  new ResizeObserver(resize).observe(canvas);
  resize();
  kick();

  return {
    // a data refresh lands: send a few signals across the strands
    burst(n = 6) { if (reduced()) return; for (let i = 0; i < n; i++) spawn(); kick(); },
  };
}
