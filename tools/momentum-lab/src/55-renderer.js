// =====================================================================
// Renderer -- draws one moment: the setting (an air track side on, an air
// table from above, or space), the paths and the centre of mass, any exhaust
// and latched springs, the bodies, and their vectors: each body's momentum,
// the total momentum (from the centre of mass), the velocities, and the
// forces the bodies exert on each other, always drawn as equal and opposite
// pairs. Before the clock starts, the tip of every momentum (and velocity)
// arrow is a handle: drag it to set v⃗₀. Labels are placed so none covers another.
// =====================================================================
class Renderer {
  static C = { bg0: '#16273a', bg1: '#0b121b', ink: '#dfe7ef', dim: '#9fb0c0', P: '#f4ead2', v: '#eef3f8', F: '#ff7a7a', thrust: '#ffb347', exhaust: '#f0a868', spring: '#c9d4de', handle: '#f0c860' };
  static MONO = "'JetBrains Mono', monospace"; static SERIF = "'Source Serif 4', serif"; static SANS = "'Source Sans 3', sans-serif";

  draw(g, lab) { const v = lab.view, W = v.W, H = v.H, w = lab.world; this.g = g; this.W = W; this.H = H; this.P = v.P; this.lab = lab; this.boxes = []; this.labels = []; this.lines = []; this.handles = []; this.hits = []; this.rad = {};
    const bg = g.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62); bg.addColorStop(0, Renderer.C.bg0); bg.addColorStop(1, Renderer.C.bg1); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    this[lab.mode](lab); this.paths(lab); this.exhaust(lab); this.springs(lab); for (const b of w.main) this.body(lab, b); this.vectors(lab);
    const note = this.status(w, true); if (note) this.boxes.push(note); this.scaleBar(lab); this.placeLabels(); this.status(w); }

  // where a body's arrows start: on the track they stand above the cart, one row each, so they never overlap
  base(lab, b, row) { if (!lab.oneD) return this.P(b.p); const n = lab.world.main.length, i = Math.max(0, lab.world.main.indexOf(b));
    // (each cart's momentum on its own line, so two carts moving together do not hide each other's arrows)
    const y = { p: 0.22 + 0.1 * i, v: 0.28 + 0.1 * n, F: 0.05, P: 0.34 + 0.1 * n + (lab.show.v ? 0.08 : 0) }[row], q = this.P({ x: b.p.x, y: 0 }); return { x: q.x, y: q.y - y * lab.view.s }; }
  // px per unit: momentum, velocity, force
  get kp() { return 0.16 * this.W / this.lab.ref.p; }
  get kv() { return 0.16 * this.W / this.lab.ref.v; }
  get kF() { return 0.14 * this.W / this.lab.ref.F; }

  // ---- drawing with a little depth (as in Forces Lab): every solid is extruded back along one direction, this.dv,
  // its faces shaded by how much they face the light (upper left); fronts lighter at the top, a bevel, a soft shadow ----
  static rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  static tone(c, k, a) { const f = (x) => Math.round(k >= 1 ? x + (255 - x) * Math.min(1, k - 1) : x * k); return 'rgba(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  solid(pts, c, o) { const g = this.g, dv = this.dv, n = pts.length; o = o || {}; let area = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p.x * q.y - q.x * p.y; }
    const sgn = area > 0 ? 1 : -1, L = { x: -0.45, y: -0.89 }, dl = Math.hypot(dv.x, dv.y) || 1;
    g.save(); g.setLineDash([]); g.lineJoin = 'round';
    if (o.sides) for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, N = { x: sgn * ey / el, y: -sgn * ex / el };
      if ((N.x * dv.x + N.y * dv.y) / dl < 0.05) continue; const lit = 0.5 + 0.62 * Math.max(0, N.x * L.x + N.y * L.y);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.lineTo(q.x + dv.x, q.y + dv.y); g.lineTo(p.x + dv.x, p.y + dv.y); g.closePath();
      g.fillStyle = Renderer.tone(c, lit, o.alpha); g.fill(); g.strokeStyle = 'rgba(5,9,14,' + (o.edge == null ? 0.55 : o.edge) + ')'; g.lineWidth = 1; g.stroke(); }
    if (!o.sides) { const ys = pts.map((q) => q.y), top = Math.min(...ys), bot = Math.max(...ys), gr = g.createLinearGradient(0, top, 0, bot);
      gr.addColorStop(0, Renderer.tone(c, o.hi || 1.14, o.alpha)); gr.addColorStop(1, Renderer.tone(c, o.lo || 0.78, o.alpha));
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
      if (o.shadow) { g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 9; g.shadowOffsetX = 2; g.shadowOffsetY = 3; }
      g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = o.stroke || 'rgba(5,9,14,' + (o.edge == null ? 0.6 : o.edge) + ')'; g.lineWidth = o.lw || 1.1; g.stroke();
      if (o.bevel !== false) { g.beginPath(); for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, N = { x: sgn * ey / el, y: -sgn * ex / el };
          if (N.x * L.x + N.y * L.y < 0.3) continue; const ix = -N.x * 1.6, iy = -N.y * 1.6; g.moveTo(p.x + ix + ex / el * 1.5, p.y + iy + ey / el * 1.5); g.lineTo(q.x + ix - ex / el * 1.5, q.y + iy - ey / el * 1.5); }
        g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 1; g.stroke(); } }
    g.restore(); }
  rect(x0, y0, x1, y1) { return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; }
  // a coil spring from a to b, seen in depth: its back half darker, its front half bright (a helix, as in Forces Lab)
  helix(a, b, o) { const g = this.g, L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 3) return; const amp = o.amp, coils = Math.max(2, o.coils), lead = Math.min(o.lead || 0, L * 0.2), run = L - 2 * lead, steps = Math.round(coils * 22);
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y, y: u.x }, dl = Math.hypot(this.dv.x, this.dv.y) || 1, d = { x: this.dv.x / dl, y: this.dv.y / dl };
    const at = (t) => { const th = 2 * Math.PI * coils * t, x = lead + run * t, si = amp * Math.sin(th), co = amp * 0.55 * Math.cos(th); return { x: a.x + u.x * x + n.x * si + d.x * co, y: a.y + u.y * x + n.y * si + d.y * co, front: Math.cos(th) < 0 }; };
    g.save(); g.setLineDash([]); g.lineCap = 'round';
    for (const front of [false, true]) { g.beginPath(); let prev = at(0); for (let i = 1; i <= steps; i++) { const q = at(i / steps); if (q.front === front) { g.moveTo(prev.x, prev.y); g.lineTo(q.x, q.y); } prev = q; }
      if (front) { g.strokeStyle = 'rgba(5,9,14,0.6)'; g.lineWidth = (o.lw || 1.6) + 1.6; g.stroke(); g.strokeStyle = o.col; g.lineWidth = o.lw || 1.6; } else { g.strokeStyle = o.back; g.lineWidth = (o.lw || 1.6) * 0.9; } g.stroke(); }
    if (lead > 0) { g.strokeStyle = o.col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + u.x * lead, a.y + u.y * lead); g.moveTo(b.x - u.x * lead, b.y - u.y * lead); g.lineTo(b.x, b.y); g.stroke(); }
    g.restore(); }
  // a fat, shaded arrow (momentum): lit across its width, a soft shadow and a dark edge
  fat(A, B, col, o) { const g = this.g, l = Math.hypot(B.x - A.x, B.y - A.y); if (l < 3) return false; o = o || {};
    const ux = (B.x - A.x) / l, uy = (B.y - A.y) / l, nx = -uy, ny = ux, hw = o.w || 2.6, hh = hw * 2.7, hl = Math.min(hw * 5.2, l * 0.6), bx = B.x - ux * hl, by = B.y - uy * hl;
    const pts = [[A.x + nx * hw, A.y + ny * hw], [bx + nx * hw, by + ny * hw], [bx + nx * hh, by + ny * hh], [B.x, B.y], [bx - nx * hh, by - ny * hh], [bx - nx * hw, by - ny * hw], [A.x - nx * hw, A.y - ny * hw]];
    g.save(); g.setLineDash([]); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    const lit = ny < 0 ? 1 : -1, gr = g.createLinearGradient(A.x + nx * hh * lit, A.y + ny * hh * lit, A.x - nx * hh * lit, A.y - ny * hh * lit); gr.addColorStop(0, G3.lite(col, 0.45)); gr.addColorStop(0.5, col); gr.addColorStop(1, G3.dark(col, 0.35));
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 5; g.shadowOffsetX = 1.2; g.shadowOffsetY = 2; g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent';
    g.strokeStyle = G3.dark(col, 0.72, 0.85); g.lineWidth = 1; g.lineJoin = 'round'; g.stroke(); g.restore(); return true; }

  // ---- the three settings ----
  // an air track: an extruded aluminium rail with rows of air holes on top, end stops, two stands and a ruler
  track(lab) { const g = this.g, P = this.P, s = lab.view.s, B = MODES.track.bounds, dp = Math.max(5, Math.min(14, 0.045 * s)); this.dv = { x: dp * 0.62, y: -dp * 0.5 };
    const y0 = P({ x: 0, y: 0 }).y, x0 = P({ x: B.x0 - 0.06, y: 0 }).x, x1 = P({ x: B.x1 + 0.06, y: 0 }).x, hb = Math.max(8, 0.055 * s), steel = [150, 164, 178], dark = [62, 74, 88];
    for (const x of [B.x0 + 0.22, B.x1 - 0.22]) { const q = P({ x, y: 0 }), leg = this.rect(q.x - 4, y0 + hb, q.x + 4, y0 + hb + 0.13 * s); this.solid(leg, dark, { sides: true }); this.solid(leg, dark, { bevel: false }); }
    const rail = this.rect(x0, y0, x1, y0 + hb); this.solid(rail, steel, { sides: true, edge: 0.45 }); this.solid(rail, steel, { shadow: true, hi: 1.25, lo: 0.7 });
    g.save(); const dv = this.dv;
    for (const f of [0.32, 0.68]) for (let x = B.x0; x <= B.x1 + 1e-9; x += 0.04) { const q = P({ x, y: 0 }); g.fillStyle = 'rgba(28,36,46,0.75)'; g.beginPath(); g.ellipse(q.x + dv.x * f, y0 + dv.y * f, 1.2, 0.7, 0, 0, 2 * Math.PI); g.fill(); }
    g.strokeStyle = 'rgba(20,28,38,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 2, y0 + hb * 0.55); g.lineTo(x1 - 2, y0 + hb * 0.55); g.stroke(); g.restore();
    // end stops: a block standing up at each end
    for (const x of [B.x0 - 0.035, B.x1 + 0.035]) { const q = P({ x, y: 0 }), st = this.rect(q.x - 0.012 * s, y0 - 0.075 * s, q.x + 0.012 * s, y0); this.solid(st, [96, 108, 122], { sides: true }); this.solid(st, [96, 108, 122], { shadow: true }); }
    g.save(); g.font = '500 10px ' + Renderer.MONO; g.textAlign = 'center'; g.textBaseline = 'top'; const yr = y0 + hb + 2;
    for (let i = Math.round(B.x0 * 10); i <= Math.round(B.x1 * 10); i++) { const q = P({ x: i / 10, y: 0 }), big = i % 5 === 0; g.strokeStyle = big ? 'rgba(220,230,240,0.75)' : 'rgba(220,230,240,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(q.x, yr); g.lineTo(q.x, yr + (big ? 8 : 4)); g.stroke();
      if (big) { g.lineWidth = 3; g.strokeStyle = 'rgba(10,16,24,0.85)'; const t = Fmt.num(i / 10, 1) + (i === Math.round(B.x1 * 10) ? ' m' : ''); g.strokeText(t, q.x, yr + 10); g.fillStyle = '#aebdcb'; g.fillText(t, q.x, yr + 10); } }
    g.restore(); this.boxes.push({ x0, y0: y0 + hb, x1, y1: y0 + hb + 24 }); }
  // an air table: a slab with a raised rim, its playing surface lit from the upper left, a grid of air holes
  table(lab) { const g = this.g, P = this.P, s = lab.view.s, B = MODES.table.bounds, dp = Math.max(5, Math.min(12, 0.022 * s)); this.dv = { x: dp * 0.62, y: dp * 0.6 };
    const a = P({ x: B.x0, y: B.y1 }), b = P({ x: B.x1, y: B.y0 }), rim = Math.max(6, 0.045 * s), outer = this.rect(a.x - rim, a.y - rim, b.x + rim, b.y + rim);
    this.solid(outer, [44, 58, 74], { sides: true }); this.solid(outer, [84, 102, 122], { shadow: true, hi: 1.2, lo: 0.75 });
    g.save(); const gr = g.createLinearGradient(a.x, a.y, b.x, b.y); gr.addColorStop(0, '#4a6886'); gr.addColorStop(1, '#2c445c'); g.fillStyle = gr; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    const sh = g.createRadialGradient(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.25, 0, a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.25, (b.x - a.x) * 0.8); sh.addColorStop(0, 'rgba(220,235,250,0.10)'); sh.addColorStop(1, 'rgba(220,235,250,0)'); g.fillStyle = sh; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    // the rim's shadow on the surface, along the top and left edges
    for (const [x, y, w2, h2, x2, y2] of [[a.x, a.y, b.x - a.x, 7, a.x, a.y + 7], [a.x, a.y, 7, b.y - a.y, a.x + 7, a.y]]) { const s2 = g.createLinearGradient(x, y, x2, y2); s2.addColorStop(0, 'rgba(5,10,16,0.45)'); s2.addColorStop(1, 'rgba(5,10,16,0)'); g.fillStyle = s2; g.fillRect(x, y, w2, h2); }
    g.strokeStyle = 'rgba(200,220,240,0.07)'; g.lineWidth = 1; for (let x = B.x0 + 0.1; x < B.x1 - 1e-9; x += 0.1) { const q = P({ x, y: 0 }); g.beginPath(); g.moveTo(q.x, a.y); g.lineTo(q.x, b.y); g.stroke(); }
    for (let y = B.y0 + 0.1; y < B.y1 - 1e-9; y += 0.1) { const q = P({ x: 0, y }); g.beginPath(); g.moveTo(a.x, q.y); g.lineTo(b.x, q.y); g.stroke(); }
    for (let x = B.x0 + 0.05; x < B.x1; x += 0.1) for (let y = B.y0 + 0.05; y < B.y1; y += 0.1) { const q = P({ x, y }); g.fillStyle = 'rgba(8,14,22,0.55)'; g.beginPath(); g.arc(q.x, q.y, 1.1, 0, 2 * Math.PI); g.fill(); g.fillStyle = 'rgba(230,240,250,0.12)'; g.beginPath(); g.arc(q.x + 0.5, q.y + 0.7, 0.6, 0, 2 * Math.PI); g.fill(); }
    g.strokeStyle = 'rgba(8,14,22,0.8)'; g.lineWidth = 1.2; g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); g.restore(); }
  // space: a faint band of the galaxy, and stars of a few sizes and colours
  space(lab) { const g = this.g, W = this.W, H = this.H; this.dv = { x: 6, y: -5 }; g.save(); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const band = g.createLinearGradient(0, H, W, 0); band.addColorStop(0, 'rgba(120,140,200,0)'); band.addColorStop(0.45, 'rgba(120,140,200,0.06)'); band.addColorStop(0.55, 'rgba(150,130,190,0.07)'); band.addColorStop(1, 'rgba(120,140,200,0)'); g.fillStyle = band; g.fillRect(0, 0, W, H);
    const tint = ['220,230,255', '255,236,210', '200,220,255', '255,250,240'];
    for (let i = 0; i < 220; i++) { const x = rnd() * W, y = rnd() * H, k = rnd(), c = tint[Math.floor(rnd() * 4)];
      if (k > 0.985) { const gl = g.createRadialGradient(x, y, 0, x, y, 5); gl.addColorStop(0, 'rgba(' + c + ',0.9)'); gl.addColorStop(1, 'rgba(' + c + ',0)'); g.fillStyle = gl; g.fillRect(x - 5, y - 5, 10, 10); }
      else { g.fillStyle = 'rgba(' + c + ',' + (0.18 + 0.55 * rnd()).toFixed(2) + ')'; const r = k > 0.9 ? 1.4 : k > 0.6 ? 1 : 0.7; g.fillRect(x, y, r, r); } }
    g.restore(); }
  // a length that reads at a glance, top right (space)
  scaleBar(lab) { if (lab.mode !== 'space') return; const g = this.g, s = lab.view.s, want = 0.18 * this.W / s, L = Lab.nice(want) * (Lab.nice(want) * 5 <= want ? 5 : Lab.nice(want) * 2 <= want ? 2 : 1), px = L * s, x1 = this.W - 14, x0 = x1 - px, y = 18;
    g.save(); g.strokeStyle = '#cfd9e3'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y + 5); g.lineTo(x0, y); g.lineTo(x1, y); g.lineTo(x1, y + 5); g.stroke(); g.font = '600 10.5px ' + Renderer.MONO; g.fillStyle = '#cfd9e3'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(Fmt.sig(L / 1000) + ' km', (x0 + x1) / 2, y + 4); g.restore(); this.boxes.push({ x0: x0 - 4, y0: y - 4, x1: x1 + 4, y1: y + 18 }); }

  // ---- paths: where each body has been (fading with age), and the centre of mass ----
  fade(pts, col, a0, a1, dash, lw) { const g = this.g, n = pts.length; if (n < 2) return; const parts = Math.min(24, n - 1), per = (n - 1) / parts; g.save(); g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; if (dash) g.setLineDash(dash);
    for (let k = 0; k < parts; k++) { const i0 = Math.floor(k * per), i1 = Math.min(n - 1, Math.ceil((k + 1) * per)); g.strokeStyle = G3.alpha(col, a0 + (a1 - a0) * (k + 1) / parts); g.beginPath(); for (let i = i0; i <= i1; i++) (i === i0 ? g.moveTo(pts[i].x, pts[i].y) : g.lineTo(pts[i].x, pts[i].y)); g.stroke(); }
    g.restore(); }
  paths(lab) { const w = lab.world, R = w.rec; if (lab.oneD || R.length < 2) return; const st = Math.max(1, Math.floor(R.length / 600)), pick = (f) => { const out = []; for (let j = 0; j < R.length; j += st) out.push(this.P(f(R[j]))); return out; };
    if (lab.show.trails) w.main.forEach((b, i) => { const pts = pick((r) => r.b[i].p); pts.push(this.P(b.p)); this.fade(pts, G3.lite(b.col, 0.15), 0.08, 0.7, null, 1.8); });
    if (lab.show.cm) { const pts = pick((r) => r.cm); pts.push(this.P(w.cm)); this.fade(pts, '#f4ead2', 0.1, 0.6, [5, 5], 1.3); } }
  // exhaust: puffs that start hot and small, then grow, cool and fade
  exhaust(lab) { const g = this.g, w = lab.world, life = 8 * lab.warp; g.save();
    for (const b of w.exhaust) { const q = this.P(b.p), age = Math.min(1, (w.t - b.born) / life), r = 1.8 + 5 * Math.sqrt(age), a = 0.06 + 0.7 * Math.pow(1 - age, 1.3), hot = [255, 196, 120], cool = [150, 160, 172], c = hot.map((x, i) => Math.round(x + (cool[i] - x) * Math.min(1, age * 2.5)));
      const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r); gr.addColorStop(0, 'rgba(' + c.join(',') + ',' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + c.join(',') + ',0)'); g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, r, 0, 2 * Math.PI); g.fill(); }
    g.restore(); }
  // a latched (or pushing) spring between two bodies: a coil between their facing edges, gold while latched
  springs(lab) { const w = lab.world, s = lab.view.s; for (const c of w.charges) { if (c.state === 'spent') continue; const A = lab.oneD ? this.base(lab, c.a, 'F') : this.P(c.a.p), B = lab.oneD ? this.base(lab, c.b, 'F') : this.P(c.b.p), d = Math.hypot(B.x - A.x, B.y - A.y); if (d < 2) continue;
      const ux = (B.x - A.x) / d, uy = (B.y - A.y) / d, ra = c.a.R * s * (lab.oneD ? 0.78 : 1), rb = c.b.R * s * (lab.oneD ? 0.78 : 1), L = d - ra - rb; if (L < 3) continue; const amp = Math.max(3.5, Math.min(7, 0.026 * s));
      this.helix({ x: A.x + ux * ra, y: A.y + uy * ra }, { x: B.x - ux * rb, y: B.y - uy * rb }, { amp, coils: Math.max(3, Math.min(10, L / (amp * 1.1))), col: c.state === 'latched' ? '#f2dc8a' : '#dbe4ec', back: c.state === 'latched' ? '#8f7a35' : '#6f7c88', lw: 1.7 }); } }

  // ---- the bodies ----
  body(lab, b) { const g = this.g, s = lab.view.s, q = this.P(b.p), sel = lab.sel === b.id; if (lab.mode === 'track') return this.cart(lab, b, q, s, sel);
    if (lab.mode === 'table') { const r = Math.max(4, b.R * s); this.puck(b, q, r, sel); this.hit(b, q, r); if (r < 9) this.tag(b, q, r); return; }
    // space: planets and stars as lit spheres (never smaller than a few pixels), a satellite and a rocket as small craft
    let r = Math.max(b.kind === 'star' ? 6 : 4.5, b.R * s);
    if (b.kind === 'rocket') { this.rocket(b, q, sel, lab.world.t); r = 15; } else if (b.kind === 'craft') { this.craft(q); r = 8; } else if (b.kind === 'star') this.star(b, q, r); else this.planet(b, q, r);
    if (sel) { g.save(); g.strokeStyle = '#f0c860'; g.lineWidth = 1.6; g.setLineDash([3, 3]); g.beginPath(); g.arc(q.x, q.y, r + 4, 0, 2 * Math.PI); g.stroke(); g.restore(); }
    this.hit(b, q, Math.max(r, 9)); this.tag(b, q, r); }
  hit(b, q, r) { this.rad[b.id] = r; this.hits.push({ id: b.id, x: q.x, y: q.y, r: Math.max(r, 9) }); this.boxes.push({ x0: q.x - r, y0: q.y - r, x1: q.x + r, y1: q.y + r }); }
  // a body's name beside it (when it is too small to carry it)
  tag(b, q, r) { this.labels.push({ runs: [{ t: b.name, f: '700 11.5px ' + Renderer.SANS, col: G3.lite(b.col, 0.35) }], at: { x: q.x, y: q.y }, dir: { x: -0.7, y: -0.7 }, gap: r }); }
  // a puck: a lit cylinder with some thickness, a ring on its top, a highlight and a soft shadow on the table
  puck(b, q, r, sel) { const g = this.g, c = Renderer.rgb(b.col), dl = Math.hypot(this.dv.x, this.dv.y), h = Math.max(2.5, Math.min(7, 0.32 * r)), o = { x: this.dv.x / dl * h, y: this.dv.y / dl * h };
    g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 7; g.shadowOffsetX = o.x * 0.8 + 1; g.shadowOffsetY = o.y * 0.8 + 1; g.fillStyle = Renderer.tone(c, 0.45); g.beginPath(); g.arc(q.x + o.x, q.y + o.y, r, 0, 2 * Math.PI); g.fill(); g.shadowColor = 'transparent';
    for (let i = 5; i >= 1; i--) { const f = i / 5; g.fillStyle = Renderer.tone(c, 0.42 + 0.12 * (1 - f)); g.beginPath(); g.arc(q.x + o.x * f, q.y + o.y * f, r, 0, 2 * Math.PI); g.fill(); }
    const gr = g.createRadialGradient(q.x - r * 0.38, q.y - r * 0.42, r * 0.05, q.x, q.y, r * 1.05); gr.addColorStop(0, Renderer.tone(c, 1.45)); gr.addColorStop(0.55, b.col); gr.addColorStop(1, Renderer.tone(c, 0.7));
    g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, r, 0, 2 * Math.PI); g.fill(); g.lineWidth = sel ? 2.4 : 1.1; g.strokeStyle = sel ? '#f0c860' : 'rgba(5,9,14,0.7)'; g.stroke();
    if (r >= 8) { g.lineWidth = Math.max(1, r * 0.07); g.strokeStyle = Renderer.tone(c, 0.72, 0.8); g.beginPath(); g.arc(q.x, q.y, r * 0.66, 0, 2 * Math.PI); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1; g.beginPath(); g.arc(q.x, q.y, r * 0.66 - 1.2, Math.PI * 1.05, Math.PI * 1.6); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(q.x - r * 0.42, q.y - r * 0.48, r * 0.22, r * 0.12, -0.6, 0, 2 * Math.PI); g.fill();
    if (r >= 9) { g.font = '700 ' + Math.min(14, Math.round(r * 0.85)) + 'px ' + Renderer.SANS; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 2.5; g.strokeStyle = Renderer.tone(c, 0.45, 0.8); g.strokeText(b.name, q.x, q.y + 0.5); g.fillStyle = '#fff'; g.fillText(b.name, q.x, q.y + 0.5); }
    g.restore(); }
  // a cart on the track: a lit extruded glider riding on air, with coil-spring bumpers or Velcro pads at its ends
  cart(lab, b, q, s, sel) { const g = this.g, w = lab.world, R = b.R, core = R * 0.78, h0 = 0.008, h1 = 0.085, P = this.P, x = b.p.x, c = Renderer.rgb(b.col), dv = this.dv;
    // how far each bumper is squashed: by half the overlap with the cart it is touching
    const squash = (side) => { let d = 0; for (const o of w.main) { if (o === b || Math.sign(o.p.x - x) !== side) continue; const ov = R + o.R - Math.abs(o.p.x - x); if (ov > d) d = ov; } return Math.min(R - core, d / 2); };
    const sticky = w.e < 0.02, L = P({ x: x - core, y: h1 }), Rt = P({ x: x + core, y: h0 }), y0 = P({ x, y: 0 }).y, cx = (L.x + Rt.x) / 2;
    // its shadow on the rail's top, a little below (it floats on air)
    g.save(); g.filter = 'blur(2px)'; g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(cx + dv.x * 0.5, y0 + dv.y * 0.5, (Rt.x - L.x) * 0.52, Math.max(1.5, Math.abs(dv.y) * 0.45), 0, 0, 2 * Math.PI); g.fill(); g.filter = 'none'; g.restore();
    const front = this.rect(L.x, L.y, Rt.x, Rt.y); this.solid(front, c, { sides: true }); this.solid(front, c, { shadow: true, stroke: sel ? '#f0c860' : null, lw: sel ? 2.2 : 1.1 });
    g.save(); g.fillStyle = Renderer.tone(c, 0.55, 0.9); g.fillRect(L.x + 1, Rt.y - Math.max(2, (Rt.y - L.y) * 0.18), Rt.x - L.x - 2, Math.max(2, (Rt.y - L.y) * 0.18) - 0.5); g.restore();
    // its ends: coil-spring bumpers (squashing when they touch) or Velcro pads
    const ym = P({ x, y: (h0 + h1) / 2 }).y, hh = (Rt.y - L.y) / 2;
    for (const side of [-1, 1]) { const a = P({ x: x + side * core, y: 0 }).x, e = P({ x: x + side * (R - squash(side)), y: 0 }).x;
      if (sticky) { const pw = Math.max(3, Math.abs(e - a) * 0.45), px = side > 0 ? a : a - pw, pad = this.rect(px, ym - hh * 0.7, px + pw, ym + hh * 0.7); this.solid(pad, [216, 199, 156], { bevel: false, edge: 0.5 });
        g.save(); g.beginPath(); g.rect(px, ym - hh * 0.7, pw, hh * 1.4); g.clip(); g.strokeStyle = 'rgba(110,88,40,0.55)'; g.lineWidth = 0.7; for (let k = -hh; k <= hh * 2; k += 2.2) { g.beginPath(); g.moveTo(px - 2, ym - hh + k); g.lineTo(px + pw + 2, ym - hh + k - pw); g.stroke(); }
          g.fillStyle = 'rgba(255,248,230,0.55)'; for (let k = 0; k < 8; k++) { g.fillRect(px + ((k * 7) % 10) / 10 * pw, ym - hh * 0.6 + (k * 0.17 % 1) * hh * 1.2, 0.9, 0.9); } g.restore(); }
      else { this.helix({ x: a, y: ym }, { x: e, y: ym }, { amp: Math.max(2.5, hh * 0.55), coils: 3.5, col: '#e2e9f0', back: '#6f7c88', lw: 1.3 }); const plate = this.rect(e - 1.3, ym - hh * 0.7, e + 1.3, ym + hh * 0.7); this.solid(plate, [200, 210, 220], { bevel: false, edge: 0.6 }); } }
    g.save(); g.font = '700 12px ' + Renderer.SANS; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 2.5; g.strokeStyle = Renderer.tone(c, 0.45, 0.8); g.strokeText(b.name, cx, (L.y + Rt.y) / 2 + 0.5); g.fillStyle = '#fff'; g.fillText(b.name, cx, (L.y + Rt.y) / 2 + 0.5); g.restore();
    this.labels.push({ runs: [{ t: Fmt.sig(b.m) + ' kg', f: '600 10.5px ' + Renderer.MONO, col: '#cfd9e3' }], at: { x: cx, y: L.y + dv.y }, dir: { x: 0, y: -1 }, gap: -6 });
    this.hits.push({ id: b.id, x: cx, y: (L.y + Rt.y) / 2, r: Math.max(12, (Rt.x - L.x) / 2) }); this.boxes.push({ x0: L.x - 4, y0: L.y + dv.y - 2, x1: Rt.x + dv.x + 4, y1: Rt.y }); }
  // a planet or moon: a lit sphere with a little surface (Earth's oceans and land, a grey moon's craters, Pluto's pale heart)
  planet(b, q, r) { const g = this.g, nm = b.name, look = nm === 'Earth' ? 'earth' : nm === 'Moon' ? 'moon' : nm === 'Pluto' ? 'pluto' : nm === 'Charon' ? 'charon' : 'plain';
    if (r < 5) { G3.sphere(g, q.x, q.y, r, b.col); return; }
    g.save(); if (look === 'earth') { const at = g.createRadialGradient(q.x, q.y, r * 0.95, q.x, q.y, r * 1.14); at.addColorStop(0, 'rgba(140,200,255,0.45)'); at.addColorStop(1, 'rgba(140,200,255,0)'); g.fillStyle = at; g.beginPath(); g.arc(q.x, q.y, r * 1.14, 0, 2 * Math.PI); g.fill(); }
    g.beginPath(); g.arc(q.x, q.y, r, 0, 2 * Math.PI); g.clip();
    const base = { earth: ['#4a93d6', '#1d4f8f'], moon: ['#d4d8dc', '#8d939a'], pluto: ['#e2c39c', '#9c7650'], charon: ['#b9c0c7', '#6f7780'], plain: [G3.lite(b.col, 0.3), G3.dark(b.col, 0.3)] }[look];
    const gr = g.createLinearGradient(q.x - r, q.y - r, q.x + r, q.y + r); gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]); g.fillStyle = gr; g.fillRect(q.x - r, q.y - r, 2 * r, 2 * r);
    let seed = nm.length * 977 + 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (look === 'earth') { for (let i = 0; i < 8; i++) { const x = q.x + (rnd() - 0.5) * 1.5 * r, y = q.y + (rnd() - 0.5) * 1.3 * r, rx = r * (0.1 + 0.2 * rnd()), ry = rx * (0.5 + 0.7 * rnd()); g.fillStyle = i % 3 ? 'rgba(88,140,80,0.7)' : 'rgba(140,124,84,0.6)'; g.beginPath(); g.ellipse(x, y, rx, ry, rnd() * 3, 0, 2 * Math.PI); g.fill(); }
      g.fillStyle = 'rgba(240,248,255,0.7)'; g.beginPath(); g.ellipse(q.x, q.y - r * 0.97, r * 0.42, r * 0.11, 0, 0, 2 * Math.PI); g.fill(); g.beginPath(); g.ellipse(q.x, q.y + r * 0.98, r * 0.36, r * 0.1, 0, 0, 2 * Math.PI); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)'; for (let i = 0; i < 5; i++) { const y = q.y + (rnd() - 0.5) * 1.4 * r; g.beginPath(); g.ellipse(q.x + (rnd() - 0.5) * r, y, r * (0.2 + 0.25 * rnd()), r * 0.035, 0.15, 0, 2 * Math.PI); g.fill(); } }
    if (look === 'moon' || look === 'charon') for (let i = 0; i < 9; i++) { const x = q.x + (rnd() - 0.5) * 1.6 * r, y = q.y + (rnd() - 0.5) * 1.6 * r, cr = r * (0.06 + 0.16 * rnd()); g.fillStyle = 'rgba(70,74,80,0.35)'; g.beginPath(); g.arc(x, y, cr, 0, 2 * Math.PI); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, cr, Math.PI, Math.PI * 1.6); g.stroke(); }
    if (look === 'charon') { g.fillStyle = 'rgba(110,80,60,0.5)'; g.beginPath(); g.ellipse(q.x, q.y - r * 0.9, r * 0.6, r * 0.3, 0, 0, 2 * Math.PI); g.fill(); }
    if (look === 'pluto') { g.fillStyle = 'rgba(250,236,214,0.75)'; g.beginPath(); g.ellipse(q.x + r * 0.15, q.y + r * 0.2, r * 0.36, r * 0.3, 0.4, 0, 2 * Math.PI); g.fill(); g.fillStyle = 'rgba(110,70,40,0.35)'; g.beginPath(); g.ellipse(q.x - r * 0.4, q.y + r * 0.35, r * 0.4, r * 0.2, -0.3, 0, 2 * Math.PI); g.fill(); }
    // night side: lit from the upper left
    const sh = g.createRadialGradient(q.x - r * 0.45, q.y - r * 0.5, r * 0.15, q.x - r * 0.2, q.y - r * 0.25, r * 1.55); sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.45, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(2,4,10,0.82)'); g.fillStyle = sh; g.fillRect(q.x - r, q.y - r, 2 * r, 2 * r);
    g.restore(); g.save(); g.strokeStyle = 'rgba(5,9,14,0.6)'; g.lineWidth = 1; g.beginPath(); g.arc(q.x, q.y, r, 0, 2 * Math.PI); g.stroke(); g.restore(); }
  // a star: a glowing disc, white at the centre and its own colour at the limb, inside a soft corona
  star(b, q, r) { const g = this.g; g.save(); const gl = g.createRadialGradient(q.x, q.y, r * 0.6, q.x, q.y, r * 3.4); gl.addColorStop(0, G3.alpha(b.col, 0.5)); gl.addColorStop(0.4, G3.alpha(b.col, 0.14)); gl.addColorStop(1, G3.alpha(b.col, 0)); g.fillStyle = gl; g.beginPath(); g.arc(q.x, q.y, r * 3.4, 0, 2 * Math.PI); g.fill();
    const gr = g.createRadialGradient(q.x - r * 0.15, q.y - r * 0.15, 0, q.x, q.y, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, G3.lite(b.col, 0.55)); gr.addColorStop(0.85, b.col); gr.addColorStop(1, G3.dark(b.col, 0.25)); g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, r, 0, 2 * Math.PI); g.fill(); g.restore(); }
  // a satellite: a gold-foil body between two solar panels
  craft(q) { const g = this.g; g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 4; g.shadowOffsetX = 1; g.shadowOffsetY = 2;
    for (const sx of [-1, 1]) { const x0 = sx < 0 ? q.x - 13 : q.x + 5, gr = g.createLinearGradient(x0, q.y - 3, x0, q.y + 3); gr.addColorStop(0, '#6fa3e0'); gr.addColorStop(1, '#23497d'); g.fillStyle = gr; g.fillRect(x0, q.y - 3, 8, 6); }
    g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(200,225,255,0.5)'; g.lineWidth = 0.6; for (const x of [q.x - 9, q.x + 9]) { g.beginPath(); g.moveTo(x, q.y - 3); g.lineTo(x, q.y + 3); g.stroke(); }
    const gb = g.createLinearGradient(q.x - 4, q.y - 4, q.x + 4, q.y + 4); gb.addColorStop(0, '#f6dc8a'); gb.addColorStop(1, '#9a7428'); g.fillStyle = gb; g.fillRect(q.x - 4, q.y - 4, 8, 8); g.strokeStyle = 'rgba(5,9,14,0.6)'; g.lineWidth = 1; g.strokeRect(q.x - 4, q.y - 4, 8, 8); g.restore(); }
  // a rocket: a lit body with a red nose and fins, a window, and a flickering flame while it fires
  rocket(b, q, sel, t) { const g = this.g, ang = -(b.rk ? b.rk.ang : 0) * Math.PI / 180; g.save(); g.translate(q.x, q.y); g.rotate(ang); g.scale(1.45, 1.45);
    if (b.rk && b.rk.thrust > 0) { const f = 1 + 0.18 * Math.sin(t * 37) + 0.1 * Math.sin(t * 91); g.globalCompositeOperation = 'lighter';
      for (const [len, wd, c0, c1] of [[22 * f, 6, 'rgba(255,140,40,0.75)', 'rgba(255,90,20,0)'], [14 * f, 3.6, 'rgba(255,215,120,0.9)', 'rgba(255,170,60,0)'], [7 * f, 1.8, 'rgba(255,255,240,1)', 'rgba(255,240,200,0)']]) {
        const gr = g.createLinearGradient(-11, 0, -11 - len, 0); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.beginPath(); g.moveTo(-10, -wd); g.quadraticCurveTo(-11 - len * 0.6, -wd * 0.7, -11 - len, 0); g.quadraticCurveTo(-11 - len * 0.6, wd * 0.7, -10, wd); g.closePath(); g.fill(); }
      g.globalCompositeOperation = 'source-over'; }
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 5; g.shadowOffsetX = 1; g.shadowOffsetY = 2;
    g.fillStyle = '#7a1e1e'; for (const sy of [-1, 1]) { g.beginPath(); g.moveTo(-6, sy * 4); g.lineTo(-11, sy * 9); g.lineTo(-10, sy * 3); g.closePath(); g.fill(); }
    const body = g.createLinearGradient(0, -4.5, 0, 4.5); body.addColorStop(0, '#ffffff'); body.addColorStop(0.45, '#d6dce2'); body.addColorStop(1, '#7d8893'); g.fillStyle = body; g.beginPath(); g.moveTo(-10, -4.5); g.lineTo(6, -4.5); g.quadraticCurveTo(13, -2.5, 15, 0); g.quadraticCurveTo(13, 2.5, 6, 4.5); g.lineTo(-10, 4.5); g.closePath(); g.fill(); g.shadowColor = 'transparent';
    g.strokeStyle = sel ? '#f0c860' : 'rgba(5,9,14,0.7)'; g.lineWidth = sel ? 1.8 : 1; g.stroke();
    const nose = g.createLinearGradient(0, -4.5, 0, 4.5); nose.addColorStop(0, '#ff8a7a'); nose.addColorStop(1, '#a3241c'); g.fillStyle = nose; g.beginPath(); g.moveTo(6, -4.5); g.quadraticCurveTo(13, -2.5, 15, 0); g.quadraticCurveTo(13, 2.5, 6, 4.5); g.closePath(); g.fill();
    g.fillStyle = '#3c4652'; g.fillRect(-12, -3, 2.5, 6); const win = g.createRadialGradient(0.5, -1, 0.3, 1, 0, 2.4); win.addColorStop(0, '#bfe3ff'); win.addColorStop(1, '#2a5a8a'); g.fillStyle = win; g.beginPath(); g.arc(1, 0, 2.2, 0, 2 * Math.PI); g.fill(); g.strokeStyle = 'rgba(5,9,14,0.7)'; g.lineWidth = 0.8; g.stroke();
    g.restore(); }

  static tag(b) { return b.name.length <= 2 ? b.name : b.name.indexOf('Star ') === 0 ? b.name.slice(5) : b.name[0]; }
  // ---- the vectors ----
  // a symbol with an arrow over it (and a subscript), then its value
  sym(l, sub, col, value, arrow) { const out = [{ t: l, f: 'italic 600 14px ' + Renderer.SERIF, col, arrow: arrow !== false }]; if (sub) out.push({ t: sub, f: '600 9.5px ' + Renderer.SANS, col, dy: 4 }); if (value && this.lab.show.nums !== false) out.push({ t: ' = ' + value, f: '600 11px ' + Renderer.MONO, col, val: true }); return out; }
  arrow(A, B, col, o) { if (Math.hypot(B.x - A.x, B.y - A.y) < 3) return false; G3.arrow(this.g, A, B, col, o); return true; }
  // a vector of length len px from A along u (screen), capped so it stays on the canvas
  tip(A, vec, k, cap) { const L = Math.min(V.len(vec) * k, cap || this.W * 0.42), u = V.unit(vec); return { x: A.x + u.x * L, y: A.y - u.y * L }; }
  vectors(lab) { const w = lab.world, sh = lab.show, hide = lab.hidden && !lab.atStart, sp = lab.mode === 'space', L = lab.M.L, start = lab.atStart && !lab.playing;
    const pu = 'kg·m/s', pv = (x) => Fmt.q(x, pu), vv = (x) => Fmt.q(x / L, lab.M.vu);
    // forces between the bodies: on each one of the pair, equal and opposite
    if (sh.forces && !hide) { const tag = Renderer.tag;
      for (const q of w.pairs) { const mag = V.len(q.F), val = Fmt.q(mag, 'N'); const gap = q.kind === 'gravity' ? 0.4 * V.dist(this.P(q.a.p), this.P(q.b.p)) : this.W * 0.3;
        for (const [on, by, F] of [[q.b, q.a, q.F], [q.a, q.b, V.mul(q.F, -1)]]) { const A = this.base(lab, on, 'F'), B = this.tip(A, F, this.kF, Math.min(this.W * 0.3, gap));
          if (this.arrow(A, B, Renderer.C.F, { lw: 2.8 })) this.labels.push({ runs: this.sym('F', tag(by) + ' on ' + tag(on), Renderer.C.F, val), at: B, dir: { x: B.x - A.x, y: B.y - A.y }, line: [A.x, A.y, B.x, B.y] }); } }
      for (const b of w.main) if (b.rk && b.rk.thrust > 0) { const A = this.base(lab, b, 'F'), B = this.tip(A, V.polar(b.rk.ang, b.rk.thrust), this.kF, this.W * 0.3);
        if (this.arrow(A, B, Renderer.C.thrust, { lw: 2.6 })) this.labels.push({ runs: this.sym('F', 'thrust', Renderer.C.thrust, Fmt.q(b.rk.thrust, 'N')), at: B, dir: { x: B.x - A.x, y: B.y - A.y }, line: [A.x, A.y, B.x, B.y] }); } }
    // each body's momentum (its tip is a handle before the start), and velocity
    for (const b of w.main) { const p = V.mul(b.v, b.m);
      if (sh.p && !hide) { const A0 = this.base(lab, b, 'p'), gap = lab.oneD ? 0 : (this.rad[b.id] || 0) + 1, u = V.unit(p), A = { x: A0.x + u.x * gap, y: A0.y - u.y * gap }, B = this.tip(A, p, this.kp); const drawn = this.fat(A, B, G3.lite(b.col, 0.22), { w: 2.6 });
        if (drawn) this.labels.push({ runs: this.sym('p', Renderer.tag(b), G3.lite(b.col, 0.4), pv(V.len(p))), at: B, dir: { x: B.x - A.x, y: B.y - A.y }, line: [A.x, A.y, B.x, B.y] });
        if (start) this.handle(b, A0, drawn ? B : null, this.kp * b.m, gap); }
      if (sh.v || (start && lab.sel === b.id && !sh.p)) { const A0 = this.base(lab, b, 'v'), gap = lab.oneD ? 0 : (this.rad[b.id] || 0) + 1, u = V.unit(b.v), A = { x: A0.x + u.x * gap, y: A0.y - u.y * gap }, B = this.tip(A, b.v, this.kv); const drawn = this.arrow(A, B, Renderer.C.v, { lw: 2, dash: start ? [5, 3] : null });
        if (drawn) this.labels.push({ runs: this.sym('v', Renderer.tag(b), Renderer.C.v, hide ? '' : vv(V.len(b.v))), at: B, dir: { x: B.x - A.x, y: B.y - A.y }, line: [A.x, A.y, B.x, B.y] });
        if (start) this.handle(b, A0, drawn ? B : null, this.kv, gap); } }
    // the centre of mass, and the total momentum from it
    const cm = w.cm, Pt0 = w.P, pbig = Math.max(1e-30, ...w.main.map((b) => b.m * V.len(b.v)), V.len(w.Pex)), Pt = V.len(Pt0) < 1e-9 * pbig ? V.O : Pt0, C = lab.oneD ? { x: this.P({ x: cm.x, y: 0 }).x, y: this.P({ x: 0, y: 0 }).y + 0.03 * lab.view.s } : this.P(cm);
    if (sh.P && !hide && w.main.length > 1) { const A = lab.oneD ? this.base(lab, { p: cm }, 'P') : C, B = this.tip(A, Pt, this.kp);
      if (this.fat(A, B, Renderer.C.P, { w: 3.3 })) this.labels.push({ runs: this.sym('P', 'total', Renderer.C.P, pv(V.len(Pt))), at: B, dir: { x: B.x - A.x, y: B.y - A.y }, line: [A.x, A.y, B.x, B.y] });
      else this.labels.push({ runs: this.sym('P', 'total', Renderer.C.P, '0'), at: A, dir: { x: 0, y: -1 } }); }
    if (sh.cm && (w.main.length > 1 || w.exhaust.length)) { const g = this.g, r = 6.5; g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
      g.fillStyle = 'rgba(10,16,24,0.9)'; g.beginPath(); g.arc(C.x, C.y, r + 1.6, 0, 2 * Math.PI); g.fill(); g.shadowColor = 'transparent'; g.fillStyle = '#f7f1e2'; g.beginPath(); g.arc(C.x, C.y, r, 0, 2 * Math.PI); g.fill(); g.fillStyle = '#16202b';
      for (const a of [0, Math.PI]) { g.beginPath(); g.moveTo(C.x, C.y); g.arc(C.x, C.y, r, a, a + Math.PI / 2); g.closePath(); g.fill(); } g.strokeStyle = 'rgba(247,241,226,0.85)'; g.lineWidth = 0.9; g.beginPath(); g.arc(C.x, C.y, r + 1.6, 0, 2 * Math.PI); g.stroke(); g.restore();
      this.boxes.push({ x0: C.x - r - 2, y0: C.y - r - 2, x1: C.x + r + 2, y1: C.y + r + 2 }); this.labels.push({ runs: [{ t: 'cm', f: '600 11px ' + Renderer.SANS, col: '#e8dcbc' }], at: C, dir: { x: 0.8, y: 0.6 }, gap: r }); } }
  // the tip of an arrow you can drag (before the clock starts) to set the body's v⃗₀; k = px per (m/s)
  handle(b, A, B, k, gap) { gap = gap || 0; const H = B || { x: A.x + gap + 16, y: A.y }, g = this.g; g.save(); g.beginPath(); g.arc(H.x, H.y, 6, 0, 2 * Math.PI); g.fillStyle = 'rgba(240,200,96,0.28)'; g.fill(); g.strokeStyle = 'rgba(10,16,24,0.85)'; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = Renderer.C.handle; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = Renderer.C.handle; g.beginPath(); g.arc(H.x, H.y, 1.6, 0, 2 * Math.PI); g.fill(); g.restore();
    this.handles.push({ id: b.id, x: H.x, y: H.y, ax: A.x, ay: A.y, k, gap }); }

  // ---- labels: each tries spots past its arrow's tip (then round it) and takes the first that covers nothing ----
  runsWidth(runs) { const g = this.g; let w = 0; for (const r of runs) { g.font = r.f; w += g.measureText(r.t).width; } return w; }
  placeLabels() { const g = this.g, hits = (b) => this.boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) || b.x0 < 4 || b.y0 < 4 || b.x1 > this.W - 4 || b.y1 > this.H - 46,
      crosses = (b) => this.labels.filter((l) => l.line).map((l) => l.line).some(([x1, y1, x2, y2]) => Renderer.segBox(x1, y1, x2, y2, b));
    const spot = (L, runs) => { const w = this.runsWidth(runs), h = 16, d = Math.hypot(L.dir.x, L.dir.y) || 1, ux = L.dir.x / d, uy = L.dir.y / d; let best = null, bestCost = Infinity;
      for (const r of [10, 18, 28, 42, 58, 78, 102, 130, 160]) for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2, -2, 2.4, -2.4, 2.8, -2.8, Math.PI]) { const c = Math.cos(turn), s = Math.sin(turn), dx = ux * c - uy * s, dy = ux * s + uy * c, rr = r + (L.gap || 0);
        const cx = L.at.x + dx * (rr + w / 2 * Math.abs(dx)), cy = L.at.y + dy * (rr + h / 2 * Math.abs(dy)), b = { x0: cx - w / 2 - 2, y0: cy - h / 2, x1: cx + w / 2 + 2, y1: cy + h / 2 };
        const cost = (hits(b) ? 1000 : 0) + (crosses(b) ? 60 : 0) + r * 0.6 + Math.abs(turn) * 8; if (cost < bestCost) { bestCost = cost; best = { cx, cy, b, w, cost }; } if (cost < 30) break; }
      return best; };
    // (where there is no clean spot for a label, it goes without its value; failing that, without the label)
    this.placed = [];
    for (const L of this.labels) { let runs = L.runs, best = spot(L, runs); if (best.cost >= 1000 && runs.some((r) => r.val)) { runs = runs.filter((r) => !r.val); best = spot(L, runs); } if (best.cost >= 1000) continue;
      this.boxes.push(best.b); this.placed.push(best.b); const w = best.w; let x = best.cx - w / 2; L.runs = runs;
      for (const pass of [0, 1]) { let xx = x; for (const r of L.runs) { g.font = r.f; g.textAlign = 'left'; g.textBaseline = 'middle'; const y = best.cy + (r.dy || 0) + (r.arrow ? 2 : 0), rw = g.measureText(r.t).width;
          if (!pass) { g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(10,16,24,0.92)'; g.strokeText(r.t, xx, y); }
          else { g.fillStyle = r.col; g.fillText(r.t, xx, y); if (r.arrow) { const ay = y - 9, x0 = xx + 1.5, x1 = xx + rw + 1.5; g.strokeStyle = r.col; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x0, ay); g.lineTo(x1, ay); g.moveTo(x1 - 3, ay - 2.2); g.lineTo(x1, ay); g.lineTo(x1 - 3, ay + 2.2); g.stroke(); } }
          xx += rw; } } } }
  static segBox(x1, y1, x2, y2, b) { const inside = (x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1; if (inside(x1, y1) || inside(x2, y2)) return true;
    const X = (ax, ay, bx, by, cx, cy, dx, dy) => { const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false; const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
    return X(x1, y1, x2, y2, b.x0, b.y0, b.x1, b.y0) || X(x1, y1, x2, y2, b.x1, b.y0, b.x1, b.y1) || X(x1, y1, x2, y2, b.x0, b.y1, b.x1, b.y1) || X(x1, y1, x2, y2, b.x0, b.y0, b.x0, b.y1); }

  // ---- what is happening (a collision, a spring let go, the end), across the top ----
  status(w, measure) { const text = w.note; if (!text) return null; const g = this.g, maxW = Math.min(this.W - 24, 520); g.font = '600 12px ' + Renderer.SANS;
    const words = text.split(' '), lines = []; let cur = ''; for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > maxW - 20 && cur) { lines.push(cur); cur = wd; } else cur = t; } if (cur) lines.push(cur);
    const h = 10 + lines.length * 16, x = 12, y = 12, wd = Math.max(...lines.map((l) => g.measureText(l).width)) + 20; if (measure) return { x0: x, y0: y, x1: x + wd, y1: y + h };
    g.save(); g.fillStyle = w.done ? 'rgba(60,40,24,0.88)' : 'rgba(17,26,38,0.88)'; g.strokeStyle = w.done ? 'rgba(240,190,120,0.55)' : 'rgba(240,200,96,0.45)'; g.lineWidth = 1;
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, wd, h, 8); else g.rect(x, y, wd, h); g.fill(); g.stroke(); g.fillStyle = '#f3f6f9'; g.textAlign = 'left'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, x + 10, y + 13 + i * 16)); g.restore(); }
}
