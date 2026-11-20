// =====================================================================
// Renderer -- draws the situation in 3D through the G3 kit: the setting (a
// table, a road, a banked track, a ceiling, a loop), the dashed circle the
// object goes round, the object (puck, car, ball), and its vectors: velocity,
// acceleration and every force, each labelled with its size. Forces are drawn
// to one scale per setting (weight is always the same length), so a bigger
// force is a longer arrow. Labels are placed so that none covers another.
// =====================================================================
class Renderer {
  static C = { bg0: '#16273a', bg1: '#0b121b', v: '#eef3f8', a: '#e48cf2', path: '#f0c860', ink: '#dfe7ef', dim: '#9fb0c0', axis: '#b9c7d6', car: '#c0574f', puck: '#4f86c6', ball: '#4f9d6b' };
  static FORCE = { weight: { l: 'w', s: '', col: '#ff7a7a' }, normal: { l: 'n', s: '', col: '#6cb8ff' }, static: { l: 'f', s: 's', col: '#ffc24d' }, kinetic: { l: 'f', s: 'k', col: '#ffc24d' }, tension: { l: 'T', s: '', col: '#8fd36b' }, gravity: { l: 'F', s: 'G', col: '#ff7a7a' } };
  static MONO = "'JetBrains Mono', monospace"; static SERIF = "'Source Serif 4', serif"; static SANS = "'Source Sans 3', sans-serif";
  static LIGHT = V3.unit({ x: -0.4, y: -0.5, z: 0.77 });

  draw(g, sim, W, H) { const cam = sim.cam, sit = sim.sit, n = sit.now(), P = cam.P, S = sim.size; this.g = g; this.W = W; this.H = H; this.P = P; this.cam = cam; this.boxes = []; this.labels = []; this.lines = [];
    const bg = g.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62); bg.addColorStop(0, Renderer.C.bg0); bg.addColorStop(1, Renderer.C.bg1); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    if (sim.key === 'orbit') this.stars(W, H); else { const step = Renderer.round(S / 4); G3.grid(g, P, { ext: Math.ceil(S * 1.5 / step) * step, step, up: 'z', at: 0, alpha: 0.16 }); }
    const k = sim.key; this.carScale = sim.key === 'vertical' ? 0.6 : Math.max(1, 0.085 * S / 2.2); this[k](sit, n, sim); this.trail(sim);
    this.vectors(sim, n);
    const note = this.status(sit, true); if (note) this.boxes.push(note);
    if (k === 'flat' || k === 'banked') this.section(sim, n);
    this.placeLabels();
    this.status(sit); }

  static round(x) { const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

  // ---- pieces of scenery ----
  ring(c, R, plane, n) { const pts = []; n = n || 72; for (let i = 0; i <= n; i++) { const t = i / n * 2 * Math.PI; pts.push(plane === 'xz' ? { x: c.x + R * Math.sin(t), y: c.y, z: c.z - R * Math.cos(t) } : { x: c.x + R * Math.cos(t), y: c.y + R * Math.sin(t), z: c.z }); } return pts; }
  // the circle the object goes round: a dashed gold line, fainter on the far side
  path(c, R, plane) { const g = this.g, pts = this.ring(c, R, plane, 96).map(this.P); g.save(); g.setLineDash([6, 6]); g.lineWidth = 1.6;
    for (let i = 0; i + 1 < pts.length; i++) { const k = G3.near((pts[i].d + pts[i + 1].d) / 2, this.cam.size); g.strokeStyle = G3.alpha(Renderer.C.path, 0.35 + 0.45 * k); g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[i + 1].x, pts[i + 1].y); g.stroke(); }
    g.restore(); }
  // a flat ring (inner radius a, outer b) whose height is z(ρ): a road, a banked track, a table top (a = 0)
  annulus(a, b, z, col, alpha) { const g = this.g, P = this.P, N = 96, outer = [], inner = [];
    for (let i = 0; i <= N; i++) { const t = i / N * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t); outer.push(P({ x: b * c, y: b * s, z: z(b) })); if (a > 0) inner.push(P({ x: a * c, y: a * s, z: z(a) })); }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of outer) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, G3.lite(col, 0.25, alpha)); gr.addColorStop(1, G3.dark(col, 0.35, alpha));
    g.save(); g.beginPath(); outer.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
    if (inner.length) { inner.reverse().forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }
    g.fillStyle = gr; g.fill('evenodd'); g.lineWidth = 1.4; g.strokeStyle = G3.lite(col, 0.35, 0.75); g.beginPath(); outer.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    if (inner.length) { g.beginPath(); inner.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); } g.restore(); }
  // a box (centre c, unit axes f, u, s and half-sizes), as lit faces; pushed onto `faces` to be painted far to near
  box(faces, c, ax, half, col) { const [f, u, s] = ax, [hf, hu, hs] = half, pt = (i, j, k) => V3.add(c, V3.add(V3.mul(f, i * hf), V3.add(V3.mul(u, j * hu), V3.mul(s, k * hs))));
    const quads = [[f, [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [V3.mul(f, -1), [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]], [u, [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
      [V3.mul(u, -1), [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]], [s, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [V3.mul(s, -1), [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]]];
    for (const [nrm, cs] of quads) { const w = cs.map(([i, j, k]) => pt(i, j, k)), mid = V3.mul(w.reduce((a, b) => V3.add(a, b), V3.O), 0.25);
      if (V3.dot(nrm, V3.sub(this.cam.eye, mid)) <= 0) continue; const lit = Math.max(0, V3.dot(nrm, Renderer.LIGHT));
      faces.push({ pts: w.map(this.P), d: this.P(mid).d, col: Renderer.shade(col, lit) }); } }
  // a face's colour: the full colour where the light falls square on it, darker turned away, a touch of white on the brightest
  static shade(col, lit) { const k = 0.2 + 0.8 * lit; return k > 0.72 ? G3.lite(col, (k - 0.72) * 0.7) : G3.dark(col, (0.72 - k) * 0.85); }
  paint(faces) { const g = this.g; faces.sort((a, b) => a.d - b.d); g.save(); g.lineJoin = 'round';
    for (const f of faces) { g.beginPath(); f.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fillStyle = f.col; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(8,12,18,0.55)'; g.stroke(); } g.restore(); }
  // a car at p going along f, its roof toward u (drawn larger than life on a big curve, or it would be a speck)
  car(p, f, u, col) { const s = V3.cross(f, u), faces = [], K = this.carScale; if (K > 1) p = V3.add(p, V3.mul(u, 0.6 * (K - 1)));   // a car drawn larger than life still sits on the road
    const at = (a, b, c) => V3.add(p, V3.add(V3.mul(f, a * K), V3.add(V3.mul(u, b * K), V3.mul(s, c * K))));
    this.shadow(at(0, -0.6, 0), f, s, 2.45 * K, 1.05 * K);
    for (const [a, c] of [[1.35, 0.8], [1.35, -0.8], [-1.35, 0.8], [-1.35, -0.8]]) this.box(faces, at(a, -0.28, c), [f, u, s], [0.33 * K, 0.32 * K, 0.14 * K], '#1b2026');
    this.box(faces, at(0, 0, 0), [f, u, s], [2.2 * K, 0.34 * K, 0.9 * K], col);                                   // the body
    this.box(faces, at(-0.3, 0.55, 0), [f, u, s], [1.2 * K, 0.22 * K, 0.78 * K], '#2b3846');                        // the windows
    this.box(faces, at(-0.35, 0.8, 0), [f, u, s], [1.0 * K, 0.04 * K, 0.74 * K], col);                              // the roof
    for (const c of [0.6, -0.6]) { this.box(faces, at(2.21, 0.08, c), [f, u, s], [0.02 * K, 0.08 * K, 0.18 * K], '#fff3c4'); this.box(faces, at(-2.21, 0.1, c), [f, u, s], [0.02 * K, 0.08 * K, 0.2 * K], '#d33b3b'); }
    this.paint(faces); }
  // a soft shadow on the ground: the footprint (centre c, half-lengths a along f and b along s), blurred
  shadow(c, f, s, a, b) { const g = this.g, pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => this.P(V3.add(c, V3.add(V3.mul(f, i * a), V3.mul(s, j * b)))));
    g.save(); try { g.filter = 'blur(' + Math.max(2, Math.min(9, 0.25 * b * this.P(c).s)).toFixed(1) + 'px)'; } catch (e) {} g.fillStyle = 'rgba(0,0,0,0.42)'; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill(); g.restore(); }
  // a round shadow straight below p, on the plane z = zg
  dropShadow(p, R, zg) { const g = this.g, pts = this.ring({ x: p.x, y: p.y, z: zg }, R, 'xy', 24).map(this.P), c = this.P({ x: p.x, y: p.y, z: zg });
    g.save(); try { g.filter = 'blur(' + Math.max(1.5, Math.min(8, 0.4 * R * c.s)).toFixed(1) + 'px)'; } catch (e) {} g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill(); g.restore(); }
  // painted lines on a road (white edges), at height z(ρ)
  roadLines(r, h, z) { const g = this.g; g.save(); g.lineWidth = 1.6; g.strokeStyle = 'rgba(236,240,244,0.75)';
    for (const rho of [r - h + 0.35, r + h - 0.35]) { const pts = this.ring({ x: 0, y: 0, z: 0 }, rho, 'xy', 120).map((q) => this.P({ ...q, z: z(rho) + 0.01 })); g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke(); } g.restore(); }
  trail(sim) { const T = sim.trail, g = this.g; if (T.length < 2) return; const pts = T.map((q) => this.P(q.p)), t1 = T[T.length - 1].t, keep = sim.sit.constructor.TRAIL || Sim.TRAIL; g.save(); g.lineCap = 'round'; g.lineWidth = 2.2;
    for (let i = 0; i + 1 < pts.length; i++) { const age = keep === Infinity ? 0.15 : (t1 - T[i].t) / keep; g.strokeStyle = 'rgba(214,226,238,' + (0.55 * (1 - age)).toFixed(3) + ')'; g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[i + 1].x, pts[i + 1].y); g.stroke(); } g.restore(); }
  ball(p, r, col) { const q = this.P(p); G3.sphere(this.g, q.x, q.y, Math.max(4, r * q.s), col); this.keep(q.x, q.y, Math.max(4, r * q.s) + 2); }
  // a short cylinder (a puck, a peg): axis up from base
  disc(base, r, h, col) { const g = this.g, N = 28, bot = [], top = []; for (let i = 0; i < N; i++) { const t = i / N * 2 * Math.PI; bot.push(this.P({ x: base.x + r * Math.cos(t), y: base.y + r * Math.sin(t), z: base.z })); top.push(this.P({ x: base.x + r * Math.cos(t), y: base.y + r * Math.sin(t), z: base.z + h })); }
    g.save(); g.fillStyle = G3.dark(col, 0.4); for (let i = 0; i < N; i++) { const j = (i + 1) % N; g.beginPath(); g.moveTo(bot[i].x, bot[i].y); g.lineTo(bot[j].x, bot[j].y); g.lineTo(top[j].x, top[j].y); g.lineTo(top[i].x, top[i].y); g.closePath(); g.fill(); }
    const c = this.P({ x: base.x, y: base.y, z: base.z + h }), gr = g.createRadialGradient(c.x - r * c.s * 0.3, c.y - r * c.s * 0.2, 0, c.x, c.y, r * c.s * 1.2); gr.addColorStop(0, G3.lite(col, 0.45)); gr.addColorStop(1, col);
    g.beginPath(); top.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fillStyle = gr; g.fill(); g.lineWidth = 1; g.strokeStyle = G3.dark(col, 0.6); g.stroke(); g.restore();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of bot.concat(top)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } this.boxes.push({ x0, y0, x1, y1 }); }
  string(a, b, slack) { const g = this.g, A = this.P(a), B = this.P(b);
    if (!slack) { G3.tube(g, [A, B], 2.2, '#d9cfa8'); return; }
    // slack: it droops between its ends
    const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16, q = V3.add(V3.add(V3.mul(a, 1 - t), V3.mul(b, t)), { x: 0, y: 0, z: -0.25 * V3.len(V3.sub(b, a)) * 4 * t * (1 - t) }); pts.push(this.P(q)); }
    G3.tube(g, pts, 2, '#d9cfa8', { alpha: 0.8 }); }
  keep(x, y, r) { this.boxes.push({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }); }

  // ---- the five settings ----
  puck(sit, n) { const R = Puck.TABLE, g = this.g;
    { const N = 96; g.save(); for (let i = 0; i < N; i++) { const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI, out = { x: Math.cos((a0 + a1) / 2), y: Math.sin((a0 + a1) / 2), z: 0 };
        if (V3.dot(out, V3.sub(this.cam.eye, V3.mul(out, R))) <= 0) continue; const q = [[a0, 0], [a1, 0], [a1, -0.08], [a0, -0.08]].map(([a, z]) => this.P({ x: R * Math.cos(a), y: R * Math.sin(a), z }));
        g.fillStyle = Renderer.shade('#3d5469', Math.max(0, V3.dot(out, Renderer.LIGHT)) + 0.2); g.beginPath(); q.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill(); } g.restore(); }
    this.annulus(0, R, () => 0, '#46617a', 0.9); for (const z of [0, -0.08]) { const pts = this.ring({ x: 0, y: 0, z }, R, 'xy', 96).map(this.P); g.save(); g.strokeStyle = 'rgba(160,190,215,0.55)'; g.lineWidth = 1.4; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.restore(); }
    this.path({ x: 0, y: 0, z: 0.003 }, sit.vals.r, 'xy');
    this.disc({ x: 0, y: 0, z: 0 }, 0.035, 0.08, '#8a96a3');
    if (sit.cut) { G3.tube(g, [this.P({ x: 0, y: 0, z: 0.05 }), this.P({ x: 0.12, y: -0.06, z: 0.02 })], 2, '#d9cfa8'); }
    else this.string({ x: 0, y: 0, z: 0.05 }, { ...n.p, z: 0.05 });
    this.disc({ x: n.p.x, y: n.p.y, z: 0 }, Puck.PUCK, 0.05, Renderer.C.puck); }
  flat(sit, n) { const r = sit.vals.r, h = FlatCurve.ROAD; this.annulus(r - h, r + h, () => 0, sit.road === 'icy' ? '#7f9fb8' : sit.road === 'wet' ? '#3d4c5c' : '#4a5562', 0.85);
    this.roadLines(r, h, () => 0); this.path({ x: 0, y: 0, z: 0.02 }, r, 'xy'); const f = V3.len(n.v) > 1e-9 ? V3.unit(n.v) : n.that; this.car(n.p, f, V3.Z, Renderer.C.car); }
  banked(sit, n) { const r = sit.vals.r, h = BankedCurve.ROAD, t = Math.tan(sit.th), z = (rho) => (rho - r) * t;
    // the embankment under the outer edge, then the road
    const g = this.g, N = 96; g.save(); for (let i = 0; i < N; i++) { const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI, R = r + h, lo = z(r - h) - 0.4;
      const q = [{ x: R * Math.cos(a0), y: R * Math.sin(a0), z: z(R) }, { x: R * Math.cos(a1), y: R * Math.sin(a1), z: z(R) }, { x: R * Math.cos(a1), y: R * Math.sin(a1), z: lo }, { x: R * Math.cos(a0), y: R * Math.sin(a0), z: lo }].map(this.P);
      const out = { x: Math.cos((a0 + a1) / 2), y: Math.sin((a0 + a1) / 2), z: 0 }; if (V3.dot(out, V3.sub(this.cam.eye, { x: R * out.x, y: R * out.y, z: 0 })) <= 0) continue;
      g.fillStyle = 'rgba(70,84,98,0.75)'; g.beginPath(); q.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill(); } g.restore();
    this.annulus(r - h, r + h, z, sit.road === 'icy' ? '#7f9fb8' : sit.road === 'wet' ? '#3d4c5c' : '#4a5562', 0.88);
    this.roadLines(r, h, z); this.path({ x: 0, y: 0, z: 0.03 }, r, 'xy');
    this.car(V3.add(n.p, V3.mul(n.bank.nhat, 0.05)), n.that, n.bank.nhat, sit.done ? '#9a4a44' : Renderer.C.car);
  }
  conical(sit, n) { const g = this.g, pv = sit.pivot, c = n.c;
    // the support: a small plate overhead
    const pl = [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]].map(([x, y]) => this.P({ x, y, z: pv.z + 0.02 })); G3.surface(g, pl, '#8a96a3', { alpha: 0.6 });
    this.path(c, n.R, 'xy');
    // the axis and the radius, dashed; the angle θ between the string and the vertical
    g.save(); g.setLineDash([4, 4]); g.lineWidth = 1.2; g.strokeStyle = 'rgba(185,199,214,0.6)'; const a = this.P(pv), b = this.P(c), q = this.P(n.p); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(q.x, q.y); g.stroke(); g.restore();
    const down = { x: 0, y: 0, z: -1 }, toward = V3.unit(V3.sub(n.p, pv)), k = Math.min(0.35, sit.vals.L * 0.3), arc = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, d = V3.unit(V3.add(V3.mul(down, 1 - t), V3.mul(toward, t))); arc.push(this.P(V3.at(pv, d, k))); }
    g.save(); g.strokeStyle = 'rgba(240,200,96,0.85)'; g.lineWidth = 1.2; g.beginPath(); arc.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.restore();
    this.labels.push({ runs: [{ t: 'θ', f: 'italic 600 13px ' + Renderer.SERIF, col: '#f6dc8c' }], at: arc[6], dir: { x: arc[6].x - a.x, y: arc[6].y - a.y } });
    const rm = this.P(V3.mul(V3.add(c, n.p), 0.5)); this.labels.push({ runs: [{ t: 'r', f: 'italic 600 13px ' + Renderer.SERIF, col: '#cfd9e3' }, { t: ' = ' + Fmt.num(sit.r, 2) + ' m', f: '600 11px ' + Renderer.MONO, col: '#cfd9e3' }], at: rm, dir: { x: 0, y: 1 } });
    this.dropShadow(n.p, 0.09, 0); this.string(pv, n.p); G3.sphere(g, a.x, a.y, 4, '#8a96a3'); this.ball(n.p, 0.07, Renderer.C.ball); }
  vertical(sit, n) { const g = this.g, c = sit.c, r = sit.vals.r;
    if (sit.variant === 'loop') { const L = r + 7, gz = -0.55; G3.surface(g, [[-L, -2.2], [L, -2.2], [L, 2.2], [-L, 2.2]].map(([x, y]) => this.P({ x, y, z: gz })), '#3a4654', { alpha: 0.55, rim: 1 });
      for (const y of [-0.35, 0.35]) G3.tube(g, [this.P({ x: -L, y, z: -0.5 }), this.P({ x: L, y, z: -0.5 })], Math.max(2.5, 0.12 * this.P(c).s), '#8fa3b8');
      const pts = this.ring(c, r + 0.5, 'xz', 120); const sorted = pts.map(this.P);
      G3.tubeD(g, sorted, Math.max(5, 0.35 * this.P(c).s), '#8fa3b8', { R: this.cam.size }); this.path(c, r, 'xz');
      const f = V3.len(n.v) > 1e-9 ? V3.unit(n.v) : n.that, u = n.onCircle ? n.rhat : (V3.len(n.v) > 1e-9 ? V3.unit(V3.cross(V3.cross(f, V3.Z), f)) : V3.Z); this.car(n.p, f, u, Renderer.C.car); return; }
    // a ball on a string, from a pivot on a stand
    G3.tube(g, [this.P({ x: 0, y: 0.25, z: 0 }), this.P({ x: 0, y: 0.25, z: c.z })], 5, '#6f7d8b'); G3.tube(g, [this.P({ x: 0, y: 0.25, z: c.z }), this.P(c)], 4, '#6f7d8b');
    this.path(c, r, 'xz'); this.string(c, n.p, !!n.slack); const q = this.P(c); G3.sphere(g, q.x, q.y, 4.5, '#8a96a3'); this.ball(n.p, 0.07, Renderer.C.ball); }

  // ---- a Ferris wheel: the rim, spokes turning with the rider, an A-frame, level gondolas (the rider's in red) ----
  ferris(sit, n) { const g = this.g, c = sit.c, r = sit.vals.r, P = this.P, ground = { z: 0 };
    for (const y of [-1.2, 1.2]) for (const x of [-0.45 * r, 0.45 * r]) G3.tube(g, [P({ x, y, z: ground.z }), P({ x: 0, y, z: c.z })], 4, '#5f6d7b');
    G3.tube(g, [P({ x: 0, y: -1.2, z: c.z }), P({ x: 0, y: 1.2, z: c.z })], 4, '#7d8a97');
    for (const y of [-0.5, 0.5]) { const ring = this.ring({ x: 0, y, z: c.z }, r, 'xz', 120).map(P); G3.tube(g, ring, 2.6, '#8fa3b8');
      for (let i = 0; i < Ferris.CARS; i++) { const q = sit.at(sit.al + i * 2 * Math.PI / Ferris.CARS); G3.tube(g, [P({ ...c, y }), P({ ...q, y })], 1.4, '#7d8a97'); } }
    this.path({ ...c, y: -0.55 }, r, 'xz');
    const faces = []; for (let i = Ferris.CARS - 1; i >= 0; i--) { const q = sit.at(sit.al + i * 2 * Math.PI / Ferris.CARS), K = Math.max(0.55, r * 0.05);
      // the gondola hangs level from its pivot on the rim, the seat at the rim point
      this.box(faces, V3.add(q, { x: 0, y: 0.2, z: -0.35 * K }), [{ x: 1, y: 0, z: 0 }, V3.Z, { x: 0, y: 1, z: 0 }], [0.85 * K, 0.75 * K, 0.6 * K], i === 0 ? Renderer.C.car : '#4f5d6b'); G3.tube(g, [P(q), P(V3.add(q, { x: 0, y: 0, z: 0.4 * K }))], 1.6, '#9aa7b4'); }
    this.paint(faces); const q = P(n.p); G3.sphere(g, q.x, q.y - 4, 5, '#f0c8a0'); this.keep(q.x, q.y - 4, 7); }

  // ---- space: fixed faint stars, the Earth, the orbit the satellite is on (dashed gold, the part behind the Earth hidden), the circular
  // orbit at the starting height for comparison (faint, when the orbit is not that circle), the line from the centre, and the satellite ----
  stars(W, H) { const g = this.g; let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; g.save();
    for (let i = 0; i < 140; i++) { const x = rnd() * W, y = rnd() * H, b = rnd(); g.fillStyle = 'rgba(220,230,245,' + (0.15 + 0.5 * b * b).toFixed(3) + ')'; g.fillRect(x, y, b > 0.85 ? 1.6 : 1, b > 0.85 ? 1.6 : 1); } g.restore(); }
  hidden(w, E, rad) { const q = this.P(w); return q.d < E.d && Math.hypot(q.x - E.x, q.y - E.y) < rad; }
  orbit(sit, n, sim) { const g = this.g, E = this.P(V3.O), rad = Orbit.RE * E.s;
    const glow = g.createRadialGradient(E.x, E.y, rad * 0.9, E.x, E.y, rad * 1.12); glow.addColorStop(0, 'rgba(120,180,255,0.35)'); glow.addColorStop(1, 'rgba(120,180,255,0)'); g.fillStyle = glow; g.beginPath(); g.arc(E.x, E.y, rad * 1.12, 0, 2 * Math.PI); g.fill();
    this.earth(E.x, E.y, rad); this.labels.push({ runs: [{ t: 'Earth', f: '600 11px ' + Renderer.SANS, col: '#cfe0f2' }], at: { x: E.x, y: E.y - rad * 0.2 }, dir: { x: 0, y: -1 }, small: true });
    const line = (pts, col, dash, lw) => { g.save(); g.setLineDash(dash); g.lineWidth = lw; g.strokeStyle = col; g.beginPath(); let on = false;
      for (const w of pts) { if (!w || this.hidden(w, E, rad)) { on = false; continue; } const q = this.P(w); if (on) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); on = true; } g.stroke(); g.restore(); };
    if (!sit.circular) line(this.ring(V3.O, sit.r0, 'xy', 120), 'rgba(200,214,230,0.28)', [2, 5], 1.2);
    line(sit.points(sit.edge * 1.5), G3.alpha(Renderer.C.path, 0.7), [6, 6], 1.6);
    if (!this.hidden(n.p, E, rad)) { const A = this.P(V3.O), B = this.P(n.p); g.save(); g.setLineDash([3, 4]); g.lineWidth = 1; g.strokeStyle = 'rgba(185,199,214,0.45)'; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); g.restore();
      const mid = this.P(V3.mul(n.p, 0.5 + 0.5 * Orbit.RE / n.R)); this.labels.push({ runs: [{ t: 'r', f: 'italic 600 13px ' + Renderer.SERIF, col: '#cfd9e3' }, { t: ' = ' + Orbit.km(n.R), f: '600 11px ' + Renderer.MONO, col: '#cfd9e3' }], at: mid, dir: { x: -(B.y - A.y), y: B.x - A.x } }); }
    this.satellite(n); }
  // the Earth: deep ocean lit from the upper left, a few pale-green land masses and white cloud bands, a dark night side
  earth(x, y, R) { const g = this.g; g.save(); g.beginPath(); g.arc(x, y, R, 0, 2 * Math.PI); g.clip();
    const o = g.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R * 1.05); o.addColorStop(0, '#4f9be0'); o.addColorStop(0.55, '#245d9e'); o.addColorStop(1, '#0d2a4d'); g.fillStyle = o; g.fillRect(x - R, y - R, 2 * R, 2 * R);
    // land: clusters of overlapping blobs, so the coasts are irregular
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.fillStyle = 'rgba(96,140,84,0.55)'; for (const [a, b, sz] of [[-0.42, -0.12, 0.3], [-0.18, 0.36, 0.24], [0.34, -0.28, 0.24], [0.5, 0.22, 0.17], [-0.02, -0.6, 0.14]])
      for (let k = 0; k < 9; k++) { const u = (rnd() - 0.5) * sz * 1.6, w = (rnd() - 0.5) * sz * 1.3; g.beginPath(); g.ellipse(x + (a + u) * R, y + (b + w) * R, sz * R * (0.3 + 0.35 * rnd()), sz * R * (0.2 + 0.3 * rnd()), rnd() * 3, 0, 2 * Math.PI); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineCap = 'round'; for (const [a, b, w, t] of [[-0.3, -0.42, 0.5, 0.12], [0.1, 0.05, 0.6, -0.1], [-0.4, 0.55, 0.45, 0.08]]) { g.lineWidth = Math.max(1.5, R * 0.05); g.beginPath(); g.ellipse(x + a * R, y + b * R, w * R, R * 0.04, t, 0, Math.PI); g.stroke(); }
    const night = g.createRadialGradient(x - R * 0.45, y - R * 0.45, R * 0.6, x - R * 0.2, y - R * 0.2, R * 1.6); night.addColorStop(0, 'rgba(4,10,20,0)'); night.addColorStop(1, 'rgba(4,10,20,0.85)'); g.fillStyle = night; g.fillRect(x - R, y - R, 2 * R, 2 * R);
    g.restore(); g.save(); g.strokeStyle = 'rgba(150,200,255,0.55)'; g.lineWidth = Math.max(1, R * 0.015); g.beginPath(); g.arc(x, y, R, 0, 2 * Math.PI); g.stroke(); g.restore(); }
  satellite(n) { const q = this.P(n.p), k = 6 / q.s, f = V3.len(n.v) > 1e-9 ? V3.unit(n.v) : { x: 1, y: 0, z: 0 }, s = V3.unit(V3.cross(f, V3.Z)), faces = [];
    this.box(faces, n.p, [f, V3.Z, s], [0.8 * k, 0.8 * k, 0.8 * k], '#c9ccd2'); for (const side of [1, -1]) this.box(faces, V3.at(n.p, s, side * 2.3 * k), [f, V3.Z, s], [0.55 * k, 0.08 * k, 1.4 * k], '#3d6fae');
    this.paint(faces); this.keep(q.x, q.y, 9); }

  // ---- the vectors: velocity, acceleration, forces (and their components, and the r t z axes) ----
  scales(sim, n) { const sit = sim.sit, S = sim.size, m = n.m, k = sim.key;
    if (k === 'orbit') { const g0 = Orbit.GM / (sit.r0 * sit.r0); return { F: 0.26 * S / (m * g0), v: 0.3 * S / sit.vcirc, a: 0.24 * S / g0 }; }
    const F = sit.constructor === Vertical ? m * sit.vals.vb * sit.vals.vb / sit.vals.r + m * G : Math.max(...n.forces.map((f) => V3.len(f.F)));
    const vref = { puck: 3, flat: 15, banked: 15, conical: 3, vertical: sit.variant === 'loop' ? 18 : 6, ferris: 6 }[k], aref = { puck: 9, flat: 6, banked: 6, conical: 7, vertical: sit.variant === 'loop' ? 45 : 50, ferris: 4 }[k];
    return { F: Math.min(0.26 * S / (m * G), 0.9 * S / Math.max(F, 1e-9)), v: 0.32 * S / vref, a: 0.3 * S / aref }; }
  vectors(sim, n) { const sh = sim.show, k = this.scales(sim, n), P = this.P, g = this.g; let p = n.p;
    const arrow = (vec, scale, col, lw, runs, dash) => { const len = V3.len(vec) * scale; if (len < 1e-6) return; const b = V3.at(p, vec, scale), A = P(p), B = P(b);
      if (Math.hypot(B.x - A.x, B.y - A.y) < 3) return; const res = G3.arrow3(g, P, p, b, col, { lw, dash });
      if (runs) this.labels.push({ runs, at: B, dir: { x: B.x - A.x, y: B.y - A.y }, line: [A.x, A.y, B.x, B.y] }); else this.lines.push([A.x, A.y, B.x, B.y]); return res; };
    const sym = (l, s, col, rest) => { if (!sh.nums) rest = ''; const out = [{ t: l, f: 'italic 600 14px ' + Renderer.SERIF, col }]; if (s) out.push({ t: s, f: 'italic 600 10px ' + Renderer.SERIF, col, dy: 4 }); if (rest) out.push({ t: rest, f: '600 11.5px ' + Renderer.MONO, col }); return out; };
    if (sh.axes && n.rhat) { for (const [u, l] of [[n.rhat, 'r'], [n.that, 't'], [n.zhat, 'z']]) { const b = V3.at(p, u, 0.16 * sim.size), B = P(b), A = P(p); G3.arrow3(g, P, p, b, Renderer.C.axis, { lw: 1.2, dash: [3, 3] }); this.labels.push({ runs: sym(l, '', Renderer.C.axis), at: B, dir: { x: B.x - A.x, y: B.y - A.y }, small: true }); } }
    if (sh.forces && !sim.hidden) for (const f of n.forces) { const F = Renderer.FORCE[f.kind], mag = V3.len(f.F);
      if (sh.comps && n.rhat) for (const [u, l] of [[n.rhat, 'r'], [n.zhat, 'z']]) { const c = V3.dot(f.F, u); if (Math.abs(c) < 1e-6 * mag || Math.abs(Math.abs(c) - mag) < 1e-6 * mag) continue; arrow(V3.mul(u, c), k.F, G3.alpha(F.col, 0.75), 1.6, null, [4, 3]); }
      arrow(f.F, k.F, F.col, 3, sym(F.l, F.s, F.col, ' = ' + Fmt.N(mag))); }
    // (velocity and acceleration start a little above the forces, so an acceleration along a force stays visible)
    p = V3.add(n.p, V3.mul(sim.key === 'vertical' || sim.key === 'ferris' ? { x: 0, y: -1, z: 0 } : V3.Z, 0.03 * sim.size));
    if (sh.a && !sim.hidden) arrow(n.a, k.a, Renderer.C.a, 2.4, sym('a', '', Renderer.C.a, ' = ' + Fmt.acc(V3.len(n.a))));
    if (sh.v) arrow(n.v, k.v, Renderer.C.v, 2.4, sym('v', '', Renderer.C.v, ' = ' + (sim.sit.fmtV ? sim.sit.fmtV(V3.len(n.v)) : Fmt.vel(V3.len(n.v))))); }

  // ---- the cross-section through a car on a curve (top right): the road at its bank angle, the car on it, and the
  // forces in the r-z plane, with the centre of the circle to the left. The picture textbooks draw. ----
  section(sim, n) { const g = this.g, sit = sim.sit, W = Math.min(250, this.W * 0.36), H = 196, x0 = this.W - W - 10, y0 = 10, th = sim.key === 'banked' ? sit.th : 0, ox = x0 + W * 0.56, oy = y0 + H * 0.66;
    this.boxes.push({ x0, y0, x1: x0 + W, y1: y0 + H }); g.save();
    g.fillStyle = 'rgba(12,19,28,0.9)'; g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1; g.beginPath(); if (g.roundRect) g.roundRect(x0, y0, W, H, 9); else g.rect(x0, y0, W, H); g.fill(); g.stroke();
    g.font = '600 10px ' + Renderer.SANS; g.fillStyle = '#9fb0c0'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('CROSS-SECTION', x0 + 9, y0 + 7); g.textAlign = 'right'; g.fillText('← centre', x0 + W - 9, y0 + 7);
    // screen axes: r (toward the centre) to the left, z up. Road through the car's foot, rising to the outside.
    const sc = 33, R = (r, z) => ({ x: ox - r * sc, y: oy - z * sc }), c = Math.cos(th), s2 = Math.sin(th), along = (t) => R(-t * c, t * s2);
    g.beginPath(); g.moveTo(along(-2.6).x, along(-2.6).y); g.lineTo(along(2.4).x, along(2.4).y); g.lineTo(along(2.4).x, oy + 40); g.lineTo(along(-2.6).x, oy + 40); g.closePath();
    const gr = g.createLinearGradient(0, oy - 40, 0, oy + 40); gr.addColorStop(0, 'rgba(110,124,140,0.85)'); gr.addColorStop(1, 'rgba(50,60,72,0.85)'); g.fillStyle = gr; g.fill();
    g.strokeStyle = '#c9d4de'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(along(-2.6).x, along(-2.6).y); g.lineTo(along(2.4).x, along(2.4).y); g.stroke();
    if (th > 0) { const b = along(-2.2), r0 = 26; g.strokeStyle = 'rgba(240,200,96,0.9)'; g.lineWidth = 1.1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + r0 + 16, b.y); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(b.x, b.y, r0, -th, 0); g.stroke(); g.font = 'italic 600 12px ' + Renderer.SERIF; g.fillStyle = '#f6dc8c'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('θ', b.x + r0 + 3, b.y - 7); }
    // the car, end on: a box standing on the road
    const nrm = { x: -s2, y: -c }, tan = { x: c, y: -s2 }, foot = R(0, 0), hw = 0.72 * sc, hh = 0.36 * sc, mid = { x: foot.x + nrm.x * hh, y: foot.y + nrm.y * hh };
    const corner = (a, b) => ({ x: mid.x + tan.x * a * hw + nrm.x * b * hh, y: mid.y + tan.y * a * hw + nrm.y * b * hh });
    g.beginPath(); [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)].forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fillStyle = sit.done ? '#9a4a44' : Renderer.C.car; g.fill(); g.strokeStyle = 'rgba(8,12,18,0.7)'; g.stroke();
    // the forces in the r-z plane, from the car's centre, to one scale (weight = 1.3 car heights)
    if (!sim.hidden && sim.show.forces) { const big = Math.max(...n.forces.map((f) => V3.len(f.F))), k = Math.min(62 / (n.m * G), (oy - y0 - 34) / big), rz = (F) => ({ r: n.rhat ? V3.dot(F, n.rhat) : 0, z: F.z }), draw = (r, z, col, lw, dash) => { const e = { x: mid.x - r * k, y: mid.y - z * k }; if (Math.hypot(e.x - mid.x, e.y - mid.y) < 3) return null; G3.arrow(g, mid, e, col, { lw, dash, head: lw > 2 ? 9 : 6 }); return e; };
      for (const f of n.forces) { const F = Renderer.FORCE[f.kind], q = rz(f.F);
        if (sim.show.comps && Math.abs(q.r) > 1e-6 && Math.abs(q.z) > 1e-6) { draw(q.r, 0, G3.alpha(F.col, 0.7), 1.3, [3, 3]); draw(0, q.z, G3.alpha(F.col, 0.7), 1.3, [3, 3]); }
        const e = draw(q.r, q.z, F.col, 2.4); if (e) { const d = Math.hypot(e.x - mid.x, e.y - mid.y), lx = e.x + (e.x - mid.x) / d * 9, ly = e.y + (e.y - mid.y) / d * 9; g.font = 'italic 600 13px ' + Renderer.SERIF; g.fillStyle = F.col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(F.l, lx, ly); if (F.s) { g.font = 'italic 600 9px ' + Renderer.SERIF; g.fillText(F.s, lx + 7, ly + 4); } } }
      if (sim.show.a && n.rhat) { const a = V3.dot(n.a, n.rhat), e = { x: mid.x - a * n.m * k, y: mid.y }; if (Math.abs(e.x - mid.x) > 3) { G3.arrow(g, { x: mid.x, y: mid.y - 3 }, { x: e.x, y: e.y - 3 }, Renderer.C.a, { lw: 1.8, head: 7 }); g.font = 'italic 600 13px ' + Renderer.SERIF; g.fillStyle = Renderer.C.a; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('a', e.x - 4, e.y - 5); } } }
    g.restore(); }

  // ---- labels: each tries spots past its arrow's tip (then round it) and takes the first that covers nothing ----
  runsWidth(runs) { const g = this.g; let w = 0; for (const r of runs) { g.font = r.f; w += g.measureText(r.t).width; } return w; }
  placeLabels() { const g = this.g, hits = (b) => this.boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) || b.x0 < 4 || b.y0 < 4 || b.x1 > this.W - 4 || b.y1 > this.H - 46,
      crosses = (b) => (this.lines || []).concat(this.labels.filter((l) => l.line).map((l) => l.line)).some(([x1, y1, x2, y2]) => Renderer.segBox(x1, y1, x2, y2, b));
    for (const L of this.labels) { const w = this.runsWidth(L.runs), h = 15, d = Math.hypot(L.dir.x, L.dir.y) || 1, ux = L.dir.x / d, uy = L.dir.y / d; let best = null, bestCost = Infinity;
      for (const r of [12, 20, 30, 44, 60, 80, 104, 132]) for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2, -2, 2.4, -2.4, 2.8, -2.8, Math.PI]) { const c = Math.cos(turn), s = Math.sin(turn), dx = ux * c - uy * s, dy = ux * s + uy * c;
        const cx = L.at.x + dx * (r + w / 2 * Math.abs(dx)), cy = L.at.y + dy * (r + h / 2 * Math.abs(dy)), b = { x0: cx - w / 2 - 2, y0: cy - h / 2, x1: cx + w / 2 + 2, y1: cy + h / 2 };
        const cost = (hits(b) ? 1000 : 0) + (crosses(b) ? 60 : 0) + r * 0.6 + Math.abs(turn) * 8; if (cost < bestCost) { bestCost = cost; best = { cx, cy, b }; } if (cost < 30) break; }
      this.boxes.push(best.b); let x = best.cx - w / 2;
      for (const pass of [0, 1]) { let xx = x; for (const r of L.runs) { g.font = r.f; g.textAlign = 'left'; g.textBaseline = 'middle'; if (!pass) { g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(10,16,24,0.92)'; g.strokeText(r.t, xx, best.cy + (r.dy || 0)); } else { g.fillStyle = r.col; g.fillText(r.t, xx, best.cy + (r.dy || 0)); } xx += g.measureText(r.t).width; } } } }
  static segBox(x1, y1, x2, y2, b) { const inside = (x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1; if (inside(x1, y1) || inside(x2, y2)) return true;
    const X = (ax, ay, bx, by, cx, cy, dx, dy) => { const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false; const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
    return X(x1, y1, x2, y2, b.x0, b.y0, b.x1, b.y0) || X(x1, y1, x2, y2, b.x1, b.y0, b.x1, b.y1) || X(x1, y1, x2, y2, b.x0, b.y1, b.x1, b.y1) || X(x1, y1, x2, y2, b.x0, b.y0, b.x0, b.y1); }

  // ---- what has happened (a cut string, a skid, a slack string), across the top ----
  // (with `measure`, only where it would go, so the labels can keep out of it)
  status(sit, measure) { const text = sit.done || sit.event; if (!text) return null; const g = this.g, maxW = Math.min(this.W - 24, 560); g.font = '600 12px ' + Renderer.SANS;
    const words = text.split(' '), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW - 20 && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur);
    const h = 10 + lines.length * 16, x = 12, y = 12, wd = Math.max(...lines.map((l) => g.measureText(l).width)) + 20; if (measure) return { x0: x, y0: y, x1: x + wd, y1: y + h };
    g.save(); g.fillStyle = sit.done ? 'rgba(84,30,30,0.86)' : 'rgba(17,26,38,0.88)'; g.strokeStyle = sit.done ? 'rgba(240,140,140,0.55)' : 'rgba(240,200,96,0.45)'; g.lineWidth = 1;
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, wd, h, 8); else g.rect(x, y, wd, h); g.fill(); g.stroke(); g.fillStyle = '#f3f6f9'; g.textAlign = 'left'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, x + 10, y + 13 + i * 16)); g.restore(); }
}
