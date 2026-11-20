// =====================================================================
// Renderer -- one canvas: the track (or road) along the top, the three graphs
// under it. On the track: the cart or car(s), with a read-out of x and, if shown,
// their velocity (white) and acceleration (magenta) arrows; the motion diagram
// (a dot every so often, and in the Motion-diagram activity each dot's velocity
// arrow); where two cars meet; a status line. Every label is placed in its own row,
// so none covers another (the scene test checks).
// =====================================================================
class Renderer {
  static MONO = "'JetBrains Mono', monospace"; static SERIF = "'Source Serif 4', serif"; static SANS = "'Source Sans 3', sans-serif";
  static TRK = 204;            // css px: the height of the track's strip
  static C = { bg0: '#16273a', bg1: '#0b121b', v: '#e8eef4', a: '#e48cf2', ink: '#dfe7ef', dim: '#9fb0c0', road: '#3a4652', rail: '#8d9aa8', gold: '#f0c860' };
  // rows of the strip (px from its top): one lane, or two (cars)
  static ROW1 = { label: 16, v: 36, a: 56, lane: 92, ground: 106, ticks: 111, dots: 148, status: 186 };
  static ROW2 = { A: { label: 11, v: 29, a: 47, lane: 70 }, B: { label: 179, v: 162, a: 144, lane: 96 }, roadTop: 56, roadMid: 83, roadBot: 110, ticks: 117, status: 196 };
  constructor() { this.graphs = new Graphs(); this.boxes = []; }

  draw(g, sim, W, H) { this.g = g; this.sim = sim; this.W = W; this.H = H; this.boxes = [];
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, Renderer.C.bg0); bg.addColorStop(1, Renderer.C.bg1); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    this.track(sim);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Renderer.TRK + 0.5); g.lineTo(W, Renderer.TRK + 0.5); g.stroke();
    this.graphs.draw(g, sim, { x0: 0, x1: W, y0: Renderer.TRK + 10, y1: H }, this); }

  // ---- text ----
  width(runs) { const g = this.g; let w = 0; for (const r of runs) { g.font = r.f; w += g.measureText(r.t).width; } return w; }
  runs(runs, x, y) { const g = this.g; g.textAlign = 'left'; g.textBaseline = 'middle'; for (const r of runs) { g.font = r.f; g.fillStyle = r.col; g.fillText(r.t, x, y + (r.dy || 0)); x += g.measureText(r.t).width; } return x; }
  // a label centred on x (or starting at x, or ending at x), kept inside the canvas; its box is remembered
  say(runs, x, y, align) { const w = this.width(runs), g = this.g; let x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2; x0 = clamp(x0, 6, this.W - 6 - w);
    g.save(); g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(10,16,24,0.9)'; let xx = x0; g.textAlign = 'left'; g.textBaseline = 'middle'; for (const r of runs) { g.font = r.f; g.strokeText(r.t, xx, y + (r.dy || 0)); xx += g.measureText(r.t).width; } g.restore();
    this.runs(runs, x0, y); this.boxes.push({ x0: x0 - 2, y0: y - 8, x1: x0 + w + 2, y1: y + 8, what: 'track' }); return { x0, x1: x0 + w }; }
  static sym(l, s, col, rest) { const out = [{ t: l, f: 'italic 600 14px ' + Renderer.SERIF, col }]; if (s) out.push({ t: s, f: 'italic 600 10px ' + Renderer.SERIF, col, dy: 4 }); if (rest) out.push({ t: rest, f: '600 11.5px ' + Renderer.MONO, col }); return out; }
  dot(p, r, fill, stroke) { const g = this.g; g.beginPath(); g.arc(p.x, p.y, r, 0, 2 * Math.PI); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.lineWidth = 1.2; g.strokeStyle = stroke; g.stroke(); } }
  // a thin arrow along the strip, with a dark edge so it reads on anything (motion-diagram arrows)
  arrow(x0, y, x1, col, lw, alpha) { const g = this.g, d = x1 - x0, s = Math.sign(d), head = Math.min(8, Math.abs(d) * 0.55); if (Math.abs(d) < 2) return; g.save(); g.globalAlpha = alpha == null ? 1 : alpha; g.lineCap = 'round';
    for (const [c, w] of [['rgba(6,10,16,0.7)', lw + 2.2], [col, lw]]) { g.strokeStyle = c; g.fillStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1 - s * head * 0.8, y); g.stroke(); g.beginPath(); g.moveTo(x1 + s * (w - lw) * 0.5, y); g.lineTo(x1 - s * head, y - head * 0.55 - (w - lw) * 0.4); g.lineTo(x1 - s * head, y + head * 0.55 + (w - lw) * 0.4); g.closePath(); g.fill(); }
    g.restore(); }
  // a fat shaded arrow (as Forces Lab draws its applied force): v and a on the vehicle
  fat(x0, y, x1, col) { const g = this.g, l = x1 - x0, s = Math.sign(l), L = Math.abs(l); if (L < 3) return; const hw = 2.7, hh = 7.2, hl = Math.min(13, L * 0.6), bx = x1 - s * hl, c = Renderer.rgb(col);
    const pts = [[x0, y - hw], [bx, y - hw], [bx, y - hh], [x1, y], [bx, y + hh], [bx, y + hw], [x0, y + hw]];
    g.save(); g.beginPath(); pts.forEach(([x, yy], i) => (i ? g.lineTo(x, yy) : g.moveTo(x, yy))); g.closePath();
    const gr = g.createLinearGradient(0, y - hh, 0, y + hh); gr.addColorStop(0, Renderer.tone(c, 1.3)); gr.addColorStop(0.5, Renderer.tone(c, 1)); gr.addColorStop(1, Renderer.tone(c, 0.62));
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 5; g.shadowOffsetX = 1; g.shadowOffsetY = 2; g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(6,10,16,0.7)'; g.lineWidth = 1; g.lineJoin = 'round'; g.stroke(); g.restore(); }

  // ---- the strip's scale: world x -> px ----
  scale(sim) { const W = this.W; let lo, hi, L = 30;
    if (sim.mode === 'match') { lo = TRACK.x0 - 0.05; hi = TRACK.x1 + 0.05; L = 66; }
    else { let a = Infinity, b = -Infinity; for (const B of sim.bodies()) for (let i = 0; i <= 200; i++) { const x = B.at(i / 200 * sim.T).x; a = Math.min(a, x); b = Math.max(b, x); }
      const span = Math.max(b - a, sim.mode === 'diagram' ? 6 : 10), mid = (a + b) / 2; lo = mid - span * 0.56; hi = mid + span * 0.56; }
    this.map = { lo, hi, L, R: W - 26 }; return this.map; }
  px(x) { const m = this.map; return m.L + (x - m.lo) / (m.hi - m.lo) * (m.R - m.L); }
  worldX(px) { const m = this.map; return m.lo + (px - m.L) / (m.R - m.L) * (m.hi - m.lo); }

  // ---- the strip ----
  track(sim) { const g = this.g, two = sim.mode === 'cars'; this.scale(sim);
    if (sim.mode === 'match') this.bench(); else this.road(two);
    this.ticks(two ? Renderer.ROW2.ticks : Renderer.ROW1.ticks + (sim.mode === 'match' ? 4 : 2), sim.mode === 'match');
    if (sim.show.dots && !sim.veiled) this.diagram(sim);
    if (two) this.meetings(sim);
    const B = sim.bodies(), hideVec = sim.veiled || !sim.show.arrows;
    B.forEach((b) => { const s = b.at(sim.t), rows = two ? Renderer.ROW2[b.key] : Renderer.ROW1, x = this.px(s.x);
      if (sim.mode === 'match') this.cart(x, rows.lane, b.col); else if (sim.mode === 'diagram') this.cart(x, rows.lane, '#6fb8a0'); else this.car(x, rows.lane, b.col, Math.abs(s.v) > 1e-9 ? Math.sign(s.v) : this.facing(b));
      const tag = [...(two ? [{ t: b.key + (sim.show.nums ? '  ' : ''), f: '700 12px ' + Renderer.SANS, col: b.col }] : []), ...(sim.show.nums ? Renderer.sym('x', '', '#cfd9e3', ' = ' + Fmt.short(s.x) + ' m') : [])];
      if (tag.length) this.say(tag, x, rows.label);      // (Values off: no x read-out; two cars keep their letters)
      if (!hideVec) this.vectors(sim, s, x, rows); });
    this.status(sim); }
  facing(b) { const m = b.motion; if (!m) return 1; const v = m.v0, a = m.knots.length ? m.knots[0].a : 0; return v > 1e-9 ? 1 : v < -1e-9 ? -1 : a < 0 ? -1 : 1; }
  // ---- shading (as in Forces Lab): a flat shape given depth along DV, lit from the upper left ----
  static DV = { x: 6, y: -5 };
  static rgb(c) { return G.hex(c); }
  static tone(c, k, a) { const f = (x) => Math.round(k >= 1 ? x + (255 - x) * (k - 1) : x * k); return 'rgba(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  // its visible sides (edges facing back along dv) as faces shaded by how much they face the light, then its front, lighter at
  // the top, with an optional soft shadow, a crisp edge and a fine highlight (a bevel) inside the edges that face the light
  solid(pts, c, o) { o = o || {}; const g = this.g, dv = o.dv || Renderer.DV, n = pts.length; let area = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p.x * q.y - q.x * p.y; }
    const sgn = area > 0 ? 1 : -1, L = { x: -0.45, y: -0.89 }, dl = Math.hypot(dv.x, dv.y) || 1;
    g.save(); g.setLineDash([]); g.lineJoin = 'round';
    if (o.shadow) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x + dv.x, p.y + dv.y) : g.moveTo(p.x + dv.x, p.y + dv.y))); g.closePath(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 8; g.shadowOffsetX = 2; g.shadowOffsetY = 3; g.fillStyle = Renderer.tone(c, 0.5, o.alpha); g.fill(); g.shadowColor = 'transparent'; }
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, N = { x: sgn * ey / el, y: -sgn * ex / el };
      if ((N.x * dv.x + N.y * dv.y) / dl < 0.05) continue; const lit = 0.5 + 0.62 * Math.max(0, N.x * L.x + N.y * L.y);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.lineTo(q.x + dv.x, q.y + dv.y); g.lineTo(p.x + dv.x, p.y + dv.y); g.closePath(); g.fillStyle = Renderer.tone(c, lit, o.alpha); g.fill(); g.strokeStyle = 'rgba(5,9,14,0.5)'; g.lineWidth = 1; g.stroke(); }
    const ys = pts.map((q) => q.y), top = Math.min(...ys), bot = Math.max(...ys), gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, Renderer.tone(c, 1.14, o.alpha)); gr.addColorStop(1, Renderer.tone(c, 0.78, o.alpha));
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(5,9,14,0.6)'; g.lineWidth = 1.1; g.stroke();
    if (o.bevel !== false) { g.beginPath(); for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, N = { x: sgn * ey / el, y: -sgn * ex / el };
        if (N.x * L.x + N.y * L.y < 0.3) continue; const ix = -N.x * 1.5, iy = -N.y * 1.5; g.moveTo(p.x + ix + ex / el * 1.5, p.y + iy + ey / el * 1.5); g.lineTo(q.x + ix - ex / el * 1.5, q.y + iy - ey / el * 1.5); }
      g.strokeStyle = 'rgba(255,255,255,0.34)'; g.lineWidth = 1; g.stroke(); }
    g.restore(); }
  // a slab seen from the front and a little above: its top face (a strip going back along DV) and its front face
  slab(x0, x1, y, h, top, front, k) { const g = this.g, dv = Renderer.DV, d = { x: dv.x * (k || 1), y: dv.y * (k || 1) };
    g.save(); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.lineTo(x1 + d.x, y + d.y); g.lineTo(x0 + d.x, y + d.y); g.closePath(); const gt = g.createLinearGradient(0, y + d.y, 0, y); gt.addColorStop(0, top[0]); gt.addColorStop(1, top[1]); g.fillStyle = gt; g.fill();
    const gf = g.createLinearGradient(0, y, 0, y + h); gf.addColorStop(0, front[0]); gf.addColorStop(1, front[1]); g.fillStyle = gf; g.fillRect(x0, y, x1 - x0, h);
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y + 0.5); g.lineTo(x1, y + 0.5); g.stroke();
    g.strokeStyle = 'rgba(5,9,14,0.6)'; g.beginPath(); g.moveTo(x0, y + h - 0.5); g.lineTo(x1, y + h - 0.5); g.stroke(); g.restore(); }
  // a soft shadow on the ground under something
  shade(x, y, w, h) { const g = this.g; h = h || w * 0.2; g.save(); g.translate(x, y); g.scale(1, h / w); const gr = g.createRadialGradient(0, 0, 0, 0, 0, w); gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, w, 0, 2 * Math.PI); g.fill(); g.restore(); }
  wheel(x, y, r) { const g = this.g, gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); gr.addColorStop(0, '#4a525c'); gr.addColorStop(1, '#14181d'); this.dot({ x, y }, r, gr, 'rgba(0,0,0,0.7)'); this.dot({ x, y }, r * 0.42, '#9aa6b2', 'rgba(0,0,0,0.5)'); }

  // the lab track (an air track: a slab with a top face, end stops and feet), and the motion sensor at x = 0 looking along it
  bench() { const g = this.g, R = Renderer.ROW1, x0 = this.px(TRACK.x0), x1 = this.px(TRACK.x1), y = R.ground, dv = Renderer.DV;
    this.shade((x0 + x1) / 2, y + 20, (x1 - x0) * 0.55, 7);
    for (const fx of [x0 + 18, x1 - 18]) this.solid([{ x: fx - 5, y: y + 9 }, { x: fx + 5, y: y + 9 }, { x: fx + 7, y: y + 19 }, { x: fx - 7, y: y + 19 }], [74, 86, 98], { bevel: false });
    this.slab(x0, x1, y, 9, ['#8e9cab', '#c9d3dd'], ['#aab6c2', '#5f6c79']);
    g.save(); g.fillStyle = 'rgba(40,52,64,0.55)'; for (let x = x0 + 8; x < x1 - 6; x += 9) { g.beginPath(); g.arc(x + dv.x * 0.5, y + dv.y * 0.5, 0.9, 0, 2 * Math.PI); g.fill(); } g.restore();
    for (const ex of [x0 - 2, x1 - 4]) this.solid([{ x: ex, y: y - 13 }, { x: ex + 6, y: y - 13 }, { x: ex + 6, y }, { x: ex, y }], [92, 104, 118]);
    // the sensor: a small lit box on a stand, its gold-ringed transducer facing along the track
    const sx = x0 - 34, sy = R.lane - 18; this.solid([{ x: sx + 9, y: sy + 30 }, { x: sx + 13, y: sy + 30 }, { x: sx + 13, y: y + 9 }, { x: sx + 9, y: y + 9 }], [70, 82, 94], { bevel: false });
    this.solid([{ x: sx, y: sy }, { x: sx + 24, y: sy }, { x: sx + 24, y: sy + 30 }, { x: sx, y: sy + 30 }], [52, 66, 82], { shadow: true });
    const c = { x: sx + 17, y: sy + 14 }, lg = g.createRadialGradient(c.x - 2, c.y - 2, 0.5, c.x, c.y, 7); lg.addColorStop(0, '#f2f6fa'); lg.addColorStop(0.5, '#9fb0c0'); lg.addColorStop(1, '#3d4c5b');
    this.dot(c, 7, lg, '#d9b968'); this.dot(c, 2, '#2b3846'); this.dot({ x: sx + 5, y: sy + 25 }, 1.6, this.sim.playing ? '#7fe0a0' : '#4f6b5a');
    g.save(); g.strokeStyle = 'rgba(159,176,192,0.4)'; g.lineWidth = 1; for (const r of [11, 16, 21]) { g.beginPath(); g.arc(c.x, c.y, r, -0.45, 0.45); g.stroke(); } g.restore();
    g.font = '600 9px ' + Renderer.SANS; g.fillStyle = '#8fa1b3'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('sensor', sx + 12, y + 12); }
  // a road: asphalt seen from a little above (a top face going back), a kerb along its front
  road(two) { const g = this.g, W = this.W;
    if (two) { const R = Renderer.ROW2, h = R.roadBot - R.roadTop, gt = g.createLinearGradient(0, R.roadTop, 0, R.roadBot); gt.addColorStop(0, '#2e3842'); gt.addColorStop(1, '#46525e'); g.fillStyle = gt; g.fillRect(0, R.roadTop, W, h);
      g.fillStyle = 'rgba(255,255,255,0.03)'; for (let i = 0; i < W; i += 7) g.fillRect((i * 37) % W, R.roadTop + ((i * 13) % h), 1.5, 1.5);
      g.strokeStyle = 'rgba(240,200,96,0.75)'; g.setLineDash([16, 12]); g.lineWidth = 2; g.beginPath(); g.moveTo(0, R.roadMid); g.lineTo(W, R.roadMid); g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(225,232,240,0.6)'; g.lineWidth = 1.4; for (const y of [R.roadTop + 3, R.roadBot - 3]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      this.slab(0, W, R.roadBot, 5, ['#46525e', '#46525e'], ['#8794a1', '#4a5562'], 0); return; }
    const R = Renderer.ROW1, y = R.ground, gt = g.createLinearGradient(0, y - 16, 0, y); gt.addColorStop(0, '#2b343e'); gt.addColorStop(1, '#46525e'); g.fillStyle = gt; g.fillRect(0, y - 16, W, 16);
    g.strokeStyle = 'rgba(225,232,240,0.35)'; g.setLineDash([12, 10]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, y - 8); g.lineTo(W, y - 8); g.stroke(); g.setLineDash([]);
    this.slab(0, W, y, 7, ['#46525e', '#46525e'], ['#8794a1', '#4a5562'], 0); }
  // distance marks under the track, every round number of metres, like a ruler
  ticks(y, onTrack) { const g = this.g, m = this.map, step = Graphs.step(m.hi - m.lo, Math.max(3, Math.round((m.R - m.L) / 70))); g.font = '500 10px ' + Renderer.MONO; g.textAlign = 'center'; g.textBaseline = 'top';
    const a = onTrack ? TRACK.x0 : Math.ceil(m.lo / step) * step, b = onTrack ? TRACK.x1 : m.hi, sub = onTrack ? 0.1 : step / 5;
    g.save(); g.strokeStyle = 'rgba(200,212,224,0.32)'; g.lineWidth = 1; g.beginPath(); for (let x = Math.ceil((onTrack ? a : m.lo) / sub) * sub; x <= b + 1e-9; x += sub) { const p = Math.round(this.px(x)) + 0.5; g.moveTo(p, y); g.lineTo(p, y + 2.5); } g.stroke(); g.restore();
    for (let x = a; x <= b + 1e-9; x += onTrack ? 0.5 : step) { const p = Math.round(this.px(x)) + 0.5, major = !onTrack || Math.abs(x - Math.round(x)) < 1e-9;
      g.strokeStyle = major ? 'rgba(220,230,240,0.75)' : 'rgba(200,212,224,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p, y); g.lineTo(p, y + (major ? 6 : 4)); g.stroke(); if (major && p < this.W - 46) { g.fillStyle = '#a9b8c6'; g.fillText(Fmt.num(Math.abs(x) < 1e-9 ? 0 : x, step < 1 ? 1 : 0), p, y + 8); } }
    g.textAlign = 'right'; g.fillStyle = '#8fa1b3'; g.font = 'italic 500 10px ' + Renderer.SANS; g.fillText('x (m)', this.W - 6, y + 8); }
  // a cart (the same both ways round), its middle at px x: a lit block on two wheels, with a shadow on the track
  cart(x, y, col, ghost) { const c = Renderer.rgb(col); if (!ghost) this.shade(x + 3, y + 12, 26, 4);
    this.solid([{ x: x - 22, y: y - 5 }, { x: x - 19, y: y - 8 }, { x: x + 19, y: y - 8 }, { x: x + 22, y: y - 5 }, { x: x + 22, y: y + 6 }, { x: x - 22, y: y + 6 }], c, { dv: { x: 4, y: -3.4 }, alpha: ghost });
    const g = this.g; g.save(); if (ghost) g.globalAlpha = ghost; g.fillStyle = 'rgba(5,9,14,0.35)'; g.fillRect(x - 1, y - 7, 2, 12); g.restore();
    if (!ghost) for (const dx of [-13, 13]) this.wheel(x + dx, y + 8.5, 4.6); }
  // a car facing dir (+1 toward +x), drawn larger than life on a long road: a lit body with some depth, windows, wheels, a shadow
  car(x, y, col, dir) { const g = this.g, c = Renderer.rgb(col), P = (px, py) => ({ x: x + px * dir, y: y + py }); this.shade(x + 3, y + 12, 30, 4.5);
    let body = [P(-24, 5), P(24, 5), P(24, -2), P(12, -4), P(6, -12), P(-14, -12), P(-22, -4), P(-24, -3)]; if (dir < 0) body = body.reverse();
    this.solid(body, c, { dv: { x: 4.5, y: -3.6 }, shadow: false });
    g.save(); const win = [P(4, -10.5), P(9, -4.5), P(-1, -4.5), P(-1, -10.5)], win2 = [P(-3, -10.5), P(-3, -4.5), P(-19, -4.5), P(-13, -10.5)], wg = g.createLinearGradient(0, y - 11, 0, y - 4); wg.addColorStop(0, 'rgba(220,236,250,0.85)'); wg.addColorStop(1, 'rgba(120,150,180,0.75)');
    for (const w of [win, win2]) { g.beginPath(); w.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fillStyle = wg; g.fill(); g.strokeStyle = 'rgba(5,9,14,0.45)'; g.lineWidth = 0.8; g.stroke(); }
    g.fillStyle = '#ffe9a8'; const hl = P(22.5, 0); g.fillRect(hl.x - 1.5, hl.y - 1.5, 3, 3); g.fillStyle = '#ff6b5b'; const tl = P(-23.5, 0); g.fillRect(tl.x - 1, tl.y - 1.5, 2, 3); g.restore();
    for (const dx of [-14, 14]) this.wheel(x + dx, y + 8, 5.4); }
  // velocity and acceleration arrows, each in its own row above (or below) the vehicle, with its value
  vectors(sim, s, x, rows) { const k = this.vecScale(sim);
    for (const [q, col, row] of [['v', Renderer.C.v, rows.v], ['a', Renderer.C.a, rows.a]]) { const val = s[q], len = val * k[q], tip = x + len, runs = Renderer.sym(q, 'x', col, sim.show.nums ? ' = ' + Fmt.short(val) + ' ' + (q === 'v' ? 'm/s' : 'm/s²') : '');
      if (Math.abs(len) >= 3) { this.fat(x, row, tip, col); const w = this.width(runs);
        // (past the tip if it fits, otherwise back on the tail's side)
        if (len > 0) { if (tip + 8 + w < this.W - 6) this.say(runs, tip + 8, row, 'left'); else this.say(runs, x - 8, row, 'right'); }
        else { if (tip - 8 - w > 6) this.say(runs, tip - 8, row, 'right'); else this.say(runs, x + 8, row, 'left'); } }
      else { this.dot({ x, y: row }, 2.5, col); if (x + 7 + this.width(runs) < this.W - 6) this.say(runs, x + 7, row, 'left'); else this.say(runs, x - 7, row, 'right'); } } }
  vecScale(sim) { if (this.kvec && this.kvec.rev === sim.rev && this.kvec.W === this.W) return this.kvec; let vm = 0, am = 0;
    if (sim.mode === 'match') { vm = 1; am = 0.6; } else for (const B of sim.bodies()) for (let i = 0; i <= 120; i++) { const s = B.at(i / 120 * sim.T); vm = Math.max(vm, Math.abs(s.v)); am = Math.max(am, Math.abs(s.a)); }
    const span = this.W * 0.2; return (this.kvec = { v: span / Math.max(vm, 1e-6), a: span * 0.8 / Math.max(am, 1e-6), rev: sim.rev, W: this.W }); }

  // ---- the motion diagram: where it was every dt seconds (a dot), and in the Motion-diagram activity each dot's
  // velocity arrow, drawn as far as it goes in the next dt (so the arrows join up, as in the textbook) ----
  dotStep(sim) { return sim.mode === 'diagram' || sim.mode === 'match' ? 0.5 : Graphs.step(sim.T, 14); }
  diagram(sim) { const dt = this.dotStep(sim), two = sim.mode === 'cars', tp = two ? null : sim.turn, g = this.g;
    for (const b of sim.bodies()) { const y0 = two ? Renderer.ROW2[b.key].lane : Renderer.ROW1.dots, pts = []; for (let t = 0; t <= sim.t + 1e-9; t += dt) pts.push({ t, s: b.at(t) });
      // (after a turning point the way back runs one row lower, as textbooks draw it, so the dots and arrows don't sit on each other)
      const row = (t) => (tp && t > tp.t + 1e-9 ? y0 + 13 : y0);
      if (tp && sim.t > tp.t) { const x = this.px(tp.x); g.save(); g.strokeStyle = 'rgba(240,200,96,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x + 4, y0 + 6.5, 6.5, -Math.PI / 2, Math.PI / 2); g.stroke(); g.restore(); }
      if (sim.mode === 'diagram') for (const p of pts) { const x = this.px(p.s.x), x1 = this.px(p.s.x + p.s.v * dt) * 0.9 + x * 0.1; this.arrow(x, row(p.t) - 7, x1, Renderer.C.v, 1.3, 0.75); }
      for (const p of pts) { const q = { x: this.px(p.s.x), y: two ? y0 + 1 : row(p.t) };
        const gr = g.createRadialGradient(q.x - 1, q.y - 1, 0.3, q.x, q.y, 3.6); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, b.col); gr.addColorStop(1, G.dark(b.col, 0.5)); this.dot(q, 3.6, gr, 'rgba(6,10,16,0.85)'); }
      if (tp && sim.t >= tp.t - 1e-9) { const q = { x: this.px(tp.x), y: y0 }; g.save(); g.shadowColor = 'rgba(240,200,96,0.8)'; g.shadowBlur = 8; this.dot(q, 4.6, Renderer.C.gold, '#0f1722'); g.restore(); } } }
  // where the two cars meet: a gold line across the road, once they have got there
  meetings(sim) { const m = sim.meeting, g = this.g, R = Renderer.ROW2; if (!m) return; m.times.forEach((t, i) => { if (t > sim.T + 1e-9 || t > Math.max(sim.t, 1e-9) + 1e-9) return; const x = this.px(m.xs[i]);
    g.save(); g.strokeStyle = 'rgba(240,200,96,0.85)'; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, R.roadTop - 2); g.lineTo(x, R.roadBot + 2); g.stroke(); g.restore(); this.dot({ x, y: R.roadMid }, 4, Renderer.C.gold, '#0f1722'); }); }

  // ---- the status line along the bottom of the strip ----
  status(sim) { const text = Renderer.statusText(sim); if (!text) return; const y = (sim.mode === 'cars' ? Renderer.ROW2 : Renderer.ROW1).status, g = this.g;
    g.font = '600 11.5px ' + Renderer.SANS; let s = text.t; while (g.measureText(s).width > this.W - 24 && s.length > 8) s = s.slice(0, -2); if (s !== text.t) s = s.slice(0, -1) + '…';
    this.say([{ t: s, f: '600 11.5px ' + Renderer.SANS, col: text.col || '#cfd9e3' }], 10, y, 'left'); }
  static statusText(sim) { const T = sim.T;
    if (sim.driving) { const k = sim.target.kind === 'x' ? 'x–t' : 'v–t';
      if (sim.result) return { t: 'Score ' + sim.result.pct + ' %: ' + verdict(sim.result.pct) + '. ▶ Run tries again.', col: sim.result.pct >= 75 ? '#8fe0aa' : '#f0c860' };
      if (sim.playing) { const s = sim.liveScore; return { t: 'Make your green ' + k + ' line follow the gold dashed target' + (s ? ': ' + s.pct + ' % so far' : ''), col: '#f0c860' }; }
      return sim.t > 0 ? { t: 'Paused. ▶ Run drives on from here.' } : { t: 'Press ▶ Run, then drive the cart so its ' + k + ' graph follows the gold dashed target.' }; }
    if (sim.sketching) { if (sim.result && sim.result.short) return { t: 'Sketch across the whole 10 s first, then Check.', col: '#f0c860' };
      if (sim.checked) return { t: 'Your sketch: ' + sim.result.pct + ' %: ' + verdict(sim.result.pct).replace(': try again', '') + '. The gold dashed line is the real graph.', col: sim.result.pct >= 75 ? '#8fe0aa' : '#f0c860' };
      return { t: 'Watch the cart (▶ Run), then sketch its ' + (sim.sketchOf === 'x' ? 'x–t' : 'v–t') + ' graph below and press Check.' }; }
    if (sim.mode === 'cars') { const m = sim.meeting; if (m.always) return { t: 'The two cars move together the whole time.' };
      const inT = m.times.filter((t) => t <= T + 1e-9), at = (t, i) => Fmt.time(t) + ' (x = ' + Fmt.m(m.xs[i]) + ')';
      if (!m.times.length) return { t: 'They never meet: closest ' + Fmt.m(m.closest.gap) + ' apart, at t = ' + Fmt.time(m.closest.t) + '.' };
      if (!inT.length) return { t: 'They meet later than shown: at t = ' + at(m.times[0], 0) + '.' };
      return { t: (m.tangent ? 'They just touch at t = ' : inT.length > 1 ? 'They meet twice: at t = ' : 'They meet at t = ') + inT.map(at).join(' and ') + (inT.length < m.times.length ? ', and again later' : '') + '.', col: '#f0c860' }; }
    const tp = sim.turn; if (tp && Math.abs(sim.t - tp.t) < 0.12) return { t: 'Turning round: vₓ = 0 here, but aₓ = ' + Fmt.acc(tp.a) + ', so it does not stay put.', col: '#f0c860' };
    if (sim.mode === 'program') { const m = sim.motion(), k = m.piece(Math.min(sim.t, m.T - 1e-9)), i = m.knots.indexOf(k), head = 'Piece ' + (i + 1) + ' of ' + m.knots.length + ': ';
      if (sim.byVel) return { t: head + 'vₓ = ' + Fmt.vel(k.v) + ' for ' + Fmt.time(k.d) + (m.jumps.length ? '. Between pieces vₓ jumps at once: the a–t graph marks each jump with a spike.' : '.') };
      return { t: head + 'aₓ = ' + Fmt.acc(k.a) + ' for ' + Fmt.time(k.d) + (Math.abs(k.a) < 1e-9 ? ' (steady velocity)' : '') + '.' }; }
    return null; }
}

// ---- colour helpers ----
const G = {
  hex(c) { const m = /^#?([0-9a-f]{6})$/i.exec(c); const n = m ? parseInt(m[1], 16) : 0x888888; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  mix(c, w, k, a) { const [r, g, b] = G.hex(c), t = w ? 255 : 0; return 'rgba(' + Math.round(r + (t - r) * k) + ',' + Math.round(g + (t - g) * k) + ',' + Math.round(b + (t - b) * k) + ',' + (a == null ? 1 : a) + ')'; },
  lite: (c, k, a) => G.mix(c, true, k == null ? 0.3 : k, a),
  dark: (c, k, a) => G.mix(c, false, k == null ? 0.35 : k, a),
  alpha: (c, a) => G.mix(c, true, 0, a),
};
