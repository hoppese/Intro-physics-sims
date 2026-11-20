// =====================================================================
// Renderer -- the track, side on, drawn with a little depth (as in Forces
// Lab: everything solid is extruded back along one direction, dv, up and to
// the right, and lit from the upper left): the ground as a slab with a top
// face, a height scale, the zero of U_g (a dashed line with a tag to drag),
// the energy line (the height the cart could reach with all of K + U_g as
// U_g: where the track meets it the cart turns back), the coaster track (a
// front rail and a back rail joined by cross-ties, on lit posts with shadows
// on the ground), the control points while the track can be edited, the
// start, the trail, the rider (an ice cube that slides, a ball that visibly turns as it rolls, or a coaster car),
// and its vectors (w, n, f_k or a rolling ball's f_s, and v,
// flat arrows with a dark edge) labelled with their sizes, placed so no label
// covers another. Also the screen <-> world mapping the gestures use.
// =====================================================================
class Renderer {
  static C = { bg0: '#17283a', bg1: '#0a1119', grid: 'rgba(160,190,220,0.055)', grid5: 'rgba(160,190,220,0.13)', text: '#8fa1b3', ink: '#dfe7ef',
    rail: '#c9d3dd', back: '#7d8996', tie: [96, 108, 122], post: [128, 142, 158], earth: [74, 64, 48], zero: '#5fd0c4', eline: '#f0c860', v: '#eef3f8', ball: '#4f9d6b', hollow: '#d9822b', car: [192, 87, 79], start: '#f0c860' };
  static FORCE = { weight: { l: 'w', s: '', col: '#ff7a7a' }, normal: { l: 'n', s: '', col: '#6cb8ff' }, kinetic: { l: 'f', s: 'k', col: '#ffc24d' }, static: { l: 'f', s: 's', col: '#ffc24d' } };
  static MONO = "'JetBrains Mono', monospace"; static SERIF = "'Source Serif 4', serif"; static SANS = "'Source Sans 3', sans-serif";
  static BALL = Ride.RDRAW;                   // m: the ball's radius as drawn (its turning is drawn for this radius)
  static FSCALE = 1.25;                       // m of arrow for a force of m g
  static VSCALE = 0.24;                       // m of arrow per m/s

  // ---- the world <-> the screen ----
  fit(W, H) { const w = Track.WORLD, s = Math.min(W / (w.x1 - w.x0), H / (w.y1 - w.y0)); this.s = s; this.ox = (W - (w.x1 - w.x0) * s) / 2; this.oy = H - (H - (w.y1 - w.y0) * s) / 2; this.W = W; this.H = H;
    const dp = Math.max(6, Math.min(14, 0.4 * s)); this.dv = { x: dp * 0.62, y: -dp * 0.5 }; }
  X(x) { return this.ox + (x - Track.WORLD.x0) * this.s; }
  Y(y) { return this.oy - (y - Track.WORLD.y0) * this.s; }
  P = (p) => ({ x: this.X(p.x), y: this.Y(p.y) });
  // a point partway back along the depth (0 = the front rail, 1 = the back rail)
  B(q, k) { return { x: q.x + this.dv.x * k, y: q.y + this.dv.y * k }; }
  toWorld(px, py) { return { x: (px - this.ox) / this.s + Track.WORLD.x0, y: (this.oy - py) / this.s + Track.WORLD.y0 }; }
  // where the ball (or car) is drawn: resting on the riding side of the track
  centre(n) { const N = n.nrm || { x: 0, y: 1 }; return { x: n.p.x + N.x * Renderer.BALL, y: n.p.y + N.y * Renderer.BALL }; }

  draw(g, sim, W, H) { this.g = g; this.fit(W, H); this.boxes = []; this.labels = []; this.lines = []; const n = sim.ride.now(), C = Renderer.C;
    const bg = g.createRadialGradient(W * 0.42, H * 0.25, 0, W * 0.42, H * 0.25, Math.max(W, H) * 0.9); bg.addColorStop(0, C.bg0); bg.addColorStop(1, C.bg1); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    this.grid(); this.ground(); this.zeroLine(sim); this.posts(sim.track);
    if (sim.show.eline && !sim.hidden) this.energyLine(sim, n);
    this.rail(sim.track); if (sim.time === 0 && !sim.playing) { this.handles(sim); this.start(sim); }
    if (sim.show.trail) this.trail(sim);
    this.rider(sim, n); if (sim.show.height) this.height(sim, n); this.vectors(sim, n);
    const note = this.status(sim, true); if (note) this.boxes.push(note); this.placeLabels(); this.status(sim); }

  // ---- shading (as in Forces Lab) ----
  static tone(c, k, a) { const f = (x) => Math.round(k >= 1 ? x + (255 - x) * (k - 1) : x * k); return 'rgba(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  // a flat shape given depth: its sides that face back along dv, shaded by how much they face the light (upper left),
  // then its front, lighter at the top, with a soft shadow, a crisp edge and a bevel of light along its lit edges
  solid(pts, c, o) { o = o || {}; const g = this.g, dv = o.dv || this.dv, n = pts.length; let area = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p.x * q.y - q.x * p.y; }
    const sgn = area > 0 ? 1 : -1, L = { x: -0.45, y: -0.89 }, dl = Math.hypot(dv.x, dv.y); g.save(); g.setLineDash([]); g.lineJoin = 'round';
    if (dl > 0) for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, N = { x: sgn * ey / el, y: -sgn * ex / el };
      if ((N.x * dv.x + N.y * dv.y) / dl < 0.05) continue; const lit = 0.5 + 0.62 * Math.max(0, N.x * L.x + N.y * L.y);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.lineTo(q.x + dv.x, q.y + dv.y); g.lineTo(p.x + dv.x, p.y + dv.y); g.closePath(); g.fillStyle = Renderer.tone(c, lit); g.fill(); g.strokeStyle = 'rgba(5,9,14,0.55)'; g.lineWidth = 1; g.stroke(); }
    const ys = pts.map((q) => q.y), top = Math.min(...ys), bot = Math.max(...ys), gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, Renderer.tone(c, 1.12)); gr.addColorStop(1, Renderer.tone(c, 0.8));
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); if (o.shadow) { g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 9; g.shadowOffsetX = 2; g.shadowOffsetY = 3; }
    g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(5,9,14,0.6)'; g.lineWidth = 1.1; g.stroke();
    g.beginPath(); for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, N = { x: sgn * ey / el, y: -sgn * ex / el };
      if (N.x * L.x + N.y * L.y < 0.3) continue; const ix = -N.x * 1.6, iy = -N.y * 1.6; g.moveTo(p.x + ix + ex / el * 1.5, p.y + iy + ey / el * 1.5); g.lineTo(q.x + ix - ex / el * 1.5, q.y + iy - ey / el * 1.5); }
    g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 1; g.stroke(); g.restore(); }

  // ---- the setting ----
  grid() { const g = this.g, w = Track.WORLD, C = Renderer.C, top = this.Y(w.y1), bot = this.Y(0); g.save(); g.lineWidth = 1;
    for (const pass of [0, 1]) { g.beginPath(); g.strokeStyle = pass ? C.grid5 : C.grid;
      for (let x = Math.ceil(w.x0); x <= w.x1; x++) { if ((x % 5 === 0) !== !!pass) continue; const X = Math.round(this.X(x)) + 0.5; g.moveTo(X, top); g.lineTo(X, bot); }
      for (let y = 1; y <= w.y1; y++) { if ((y % 5 === 0) !== !!pass) continue; const Y = Math.round(this.Y(y)) + 0.5; g.moveTo(this.X(w.x0), Y); g.lineTo(this.X(w.x1), Y); } g.stroke(); }
    g.font = '500 10px ' + Renderer.MONO; g.fillStyle = C.text; g.textAlign = 'left'; g.textBaseline = 'middle';
    for (let y = 5; y <= w.y1; y += 5) { g.fillText(y + ' m', this.X(w.x0) + 4, this.Y(y) - 7); this.boxes.push({ x0: this.X(w.x0) + 2, y0: this.Y(y) - 14, x1: this.X(w.x0) + 36, y1: this.Y(y) }); } g.restore(); }
  // the ground: a slab, its top face running back along dv, its front face darkening downward
  ground() { const g = this.g, C = Renderer.C, y = this.Y(0), dv = this.dv; g.save();
    g.beginPath(); g.moveTo(0, y); g.lineTo(this.W, y); g.lineTo(this.W, y + dv.y); g.lineTo(0, y + dv.y); g.closePath(); const top = g.createLinearGradient(0, y + dv.y, 0, y); top.addColorStop(0, Renderer.tone(C.earth, 1.12)); top.addColorStop(1, Renderer.tone(C.earth, 1.35)); g.fillStyle = top; g.fill();
    const fr = g.createLinearGradient(0, y, 0, this.H); fr.addColorStop(0, Renderer.tone(C.earth, 0.95)); fr.addColorStop(1, Renderer.tone(C.earth, 0.42)); g.fillStyle = fr; g.fillRect(0, y, this.W, this.H - y);
    g.strokeStyle = 'rgba(236,222,190,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(this.W, y + 0.5); g.stroke(); g.strokeStyle = 'rgba(236,222,190,0.22)'; g.beginPath(); g.moveTo(0, y + dv.y + 0.5); g.lineTo(this.W, y + dv.y + 0.5); g.stroke(); g.restore(); }
  // supports: lit posts down to the ground from the lowest piece of track at that x, where the rail is the right way up, each with a shadow at its foot
  posts(track) { const g = this.g, S = track.S, C = Renderer.C, w = Math.max(3, 0.14 * this.s); let last = -Infinity; g.save();
    for (let j = 0; j < S.length; j += 4) { const q = S[j]; if (Math.abs(q.x - last) < 1.6 || q.y < 0.5) continue; const geo = track.geo(q.u); if (geo.N.y < 0.3) continue;
      if (S.some((o) => Math.abs(o.x - q.x) < 0.08 && o.y < q.y - 0.4)) continue; last = q.x; const top = this.B(this.P(q), 0.5), foot = this.B({ x: this.X(q.x), y: this.Y(0) }, 0.5);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(foot.x + 3, foot.y, w * 1.6, Math.max(1.5, w * 0.45), 0, 0, 2 * Math.PI); g.fill();
      const gr = g.createLinearGradient(top.x - w / 2, 0, top.x + w / 2, 0); gr.addColorStop(0, Renderer.tone(C.post, 1.15)); gr.addColorStop(0.45, Renderer.tone(C.post, 0.9)); gr.addColorStop(1, Renderer.tone(C.post, 0.5));
      g.fillStyle = gr; g.fillRect(top.x - w / 2, top.y + 2, w, foot.y - top.y - 2); }
    g.restore(); }
  // the track: a back rail, cross-ties every 0.8 m, and the front rail (lit tubes)
  rail(track) { const g = this.g, C = Renderer.C, S = track.S, pts = S.map((q) => this.P(q)), back = pts.map((p) => this.B(p, 1)), lw = Math.max(3.5, Math.min(6, 0.2 * this.s));
    G3.tube(g, back, lw * 0.7, C.back);
    g.save(); g.lineCap = 'round'; let lastS = -Infinity;
    for (let j = 0; j < S.length; j++) { if (S[j].s - lastS < 0.8) continue; lastS = S[j].s; const a = pts[j], b = back[j];
      g.strokeStyle = 'rgba(6,10,16,0.7)'; g.lineWidth = lw * 0.9 + 1.5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.strokeStyle = Renderer.tone(C.tie, 1.25); g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    g.restore(); G3.tube(g, pts, lw, C.rail); this.lines.push(...Renderer.thin(pts, 8)); }
  static thin(pts, k) { const out = []; for (let i = 0; i + k < pts.length; i += k) out.push([pts[i].x, pts[i].y, pts[i + k].x, pts[i + k].y]); return out; }
  zeroLine(sim) { const g = this.g, y = this.Y(sim.vals.y0), C = Renderer.C; g.save(); g.setLineDash([7, 5]); g.strokeStyle = G3.alpha(C.zero, 0.7); g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, y); g.lineTo(this.W, y); g.stroke(); g.setLineDash([]);
    // the handle: a tag at the right-hand end, with grips showing it moves up and down
    const w = 66, x = this.W - w - 6; this.zeroTag = { x0: x, y0: y - 11, x1: x + w, y1: y + 11 }; this.boxes.push(this.zeroTag);
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 6; g.shadowOffsetY = 2; g.fillStyle = 'rgba(12,38,40,0.95)'; g.beginPath(); if (g.roundRect) g.roundRect(x, y - 11, w, 22, 11); else g.rect(x, y - 11, w, 22); g.fill(); g.shadowColor = 'transparent';
    g.strokeStyle = G3.alpha(C.zero, 0.9); g.lineWidth = 1.2; g.stroke(); g.fillStyle = C.zero; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = 'italic 600 13px ' + Renderer.SERIF; g.fillText('U', x + 10, y);
    g.font = 'italic 600 9px ' + Renderer.SERIF; g.fillText('g', x + 19.5, y + 4); g.font = '600 11px ' + Renderer.MONO; g.fillText(' = 0', x + 23, y);
    const gx = x + w - 11; g.beginPath(); g.moveTo(gx, y - 7); g.lineTo(gx - 3.5, y - 2.5); g.lineTo(gx + 3.5, y - 2.5); g.closePath(); g.moveTo(gx, y + 7); g.lineTo(gx - 3.5, y + 2.5); g.lineTo(gx + 3.5, y + 2.5); g.closePath(); g.fill(); g.restore(); }
  energyLine(sim, n) { const g = this.g, yE = sim.eline, y = this.Y(yE), C = Renderer.C, x0 = this.X(Track.WORLD.x0), x1 = this.X(Track.WORLD.x1); if (yE > Track.WORLD.y1 + 0.5) return; g.save();
    g.strokeStyle = G3.alpha(C.eline, 0.12); g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
    g.setLineDash([4, 4]); g.strokeStyle = G3.alpha(C.eline, 0.8); g.lineWidth = 1.3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
    // where the track reaches it: the turning points
    const S = sim.track.S; for (let j = 0; j + 1 < S.length; j++) { const a = S[j], b = S[j + 1]; if ((a.y - yE) * (b.y - yE) > 0 || a.y === b.y) continue; const f = (yE - a.y) / (b.y - a.y), x = this.X(a.x + f * (b.x - a.x));
      g.fillStyle = C.eline; g.strokeStyle = 'rgba(8,12,18,0.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x - 5, y - 10); g.lineTo(x + 5, y - 10); g.closePath(); g.fill(); g.stroke(); }
    g.restore(); this.lines.push([0, y, this.W, y]);
    this.labels.push({ runs: [{ t: 'energy line', f: '600 10.5px ' + Renderer.SANS, col: C.eline }], at: { x: this.X(1.2), y }, dir: { x: 0.2, y: -1 }, small: true });
    const A = sim.ahead(); if (A && A.turn) { const p = this.P(A.turn); this.labels.push({ runs: [{ t: 'turns back here', f: '600 10.5px ' + Renderer.SANS, col: C.eline }], at: p, dir: { x: 0, y: -1 } }); } }
  // control points: clean round handles on the front rail
  handles(sim) { const g = this.g; g.save(); sim.track.pts.forEach((p, i) => { const q = this.P(p), on = sim.sel === i || sim.hover === i, r = on ? 7 : 5.5;
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5; g.beginPath(); g.arc(q.x, q.y, r + 1.5, 0, 2 * Math.PI); g.fillStyle = 'rgba(10,16,24,0.85)'; g.fill(); g.shadowColor = 'transparent';
      g.beginPath(); g.arc(q.x, q.y, r, 0, 2 * Math.PI); g.lineWidth = 2; g.strokeStyle = on ? '#f6dc8c' : 'rgba(255,255,255,0.92)'; g.stroke();
      g.beginPath(); g.arc(q.x, q.y, on ? 3 : 2, 0, 2 * Math.PI); g.fillStyle = on ? '#f0c860' : '#ffffff'; g.fill(); this.boxes.push({ x0: q.x - 8, y0: q.y - 8, x1: q.x + 8, y1: q.y + 8 }); }); g.restore(); }
  // the start: a flag on the riding side, and its height
  start(sim) { const g = this.g, tr = sim.track, q = tr.geo(tr.uAt(sim.s0)), a = this.P(q.p), top = this.P({ x: q.p.x + q.N.x * 1.6, y: q.p.y + q.N.y * 1.6 });
    g.save(); g.strokeStyle = Renderer.C.start; g.lineWidth = 1.4; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(top.x, top.y); g.stroke(); g.fillStyle = Renderer.C.start; g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(top.x + 11, top.y + 4); g.lineTo(top.x, top.y + 8); g.closePath(); g.fill(); g.restore();
    this.lines.push([a.x, a.y, top.x, top.y]); this.labels.push({ runs: [{ t: 'start', f: '600 10.5px ' + Renderer.SANS, col: Renderer.C.start }], at: top, dir: { x: 1, y: -0.4 }, small: true }); }
  trail(sim) { const T = sim.trail, g = this.g; if (T.length < 2) return; const t1 = T[T.length - 1].t; g.save(); g.lineCap = 'round'; g.lineWidth = 2.2;
    for (let i = 0; i + 1 < T.length; i++) { const a = this.B(this.P(T[i].p), 0.5), b = this.B(this.P(T[i + 1].p), 0.5), age = (t1 - T[i].t) / Sim.TRAIL; g.strokeStyle = 'rgba(240,200,96,' + (0.5 * (1 - age)).toFixed(3) + ')'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } g.restore(); }

  // ---- the ball (riding between the rails), or a coaster car spanning them, its wheels on the front rail ----
  rider(sim, n) { const g = this.g, s = this.s;
    if (sim.rider === 'ice') { this.ice(n); return; }
    if (sim.rider !== 'car') { const c = this.B(this.P(this.centre(n)), 0.5), r = Math.max(5, Renderer.BALL * s); this.cs = c; this.ball(c, r, n.ang, sim.rider === 'hollow'); this.boxes.push({ x0: c.x - r - 2, y0: c.y - r - 2, x1: c.x + r + 2, y1: c.y + r + 2 }); this.hit = { x: c.x, y: c.y, r: Math.max(10, r + 4) }; return; }
    const N = n.nrm || { x: 0, y: 1 }, Tn = { x: N.y, y: -N.x }, c = this.P(this.centre(n)), at = (a, b) => ({ x: c.x + (Tn.x * a + N.x * b) * s, y: c.y - (Tn.y * a + N.y * b) * s });
    const body = [at(-0.85, -0.2), at(0.85, -0.2), at(0.85, 0.3), at(0.5, 0.58), at(-0.85, 0.58)], seat = [at(-0.72, 0.3), at(0.42, 0.3), at(0.42, 0.5), at(-0.72, 0.5)];
    // the clamp wheels under the rail and the running wheels on it (front side only; the back ones are hidden by the car)
    for (const a of [-0.55, 0.55]) { const w = at(a, -0.33), u = at(a, -0.33 - 0.4); g.save(); g.strokeStyle = '#59626d'; g.lineWidth = 2; g.beginPath(); g.moveTo(w.x, w.y); g.lineTo(u.x, u.y); g.stroke(); g.restore(); G3.sphere(g, u.x, u.y, Math.max(2, 0.11 * s), '#6b7480', { shadow: false }); }
    this.solid(body, Renderer.C.car, { shadow: true, dv: this.dv }); this.solid(seat, [70, 30, 30], { dv: { x: 0, y: 0 } });
    for (const a of [-0.55, 0.55]) { const w = at(a, -0.33); G3.sphere(g, w.x, w.y, Math.max(2.8, 0.17 * s), '#2a3038', { shadow: false }); }
    this.cs = c; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of body) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + Math.max(0, this.dv.x)); y0 = Math.min(y0, p.y + Math.min(0, this.dv.y)); y1 = Math.max(y1, p.y); } this.boxes.push({ x0, y0, x1, y1 }); this.hit = { x: c.x, y: c.y, r: 0.9 * s }; }
  // a ball with a band round it and a spot, turned through `ang` (anticlockwise, radians), so its rolling shows; a hollow one is orange with a thin shell
  ball(c, r, ang, hollow) { const g = this.g, C = Renderer.C; G3.sphere(g, c.x, c.y, r, hollow ? C.hollow : C.ball); const u = { x: Math.cos(ang), y: -Math.sin(ang) }, w = { x: -u.y, y: u.x };
    g.save(); g.beginPath(); g.arc(c.x, c.y, r - 0.6, 0, 2 * Math.PI); g.clip(); g.lineCap = 'butt';
    g.strokeStyle = hollow ? 'rgba(40,20,6,0.75)' : 'rgba(240,248,242,0.85)'; g.lineWidth = Math.max(1.6, r * 0.22); g.beginPath(); g.moveTo(c.x - u.x * r, c.y - u.y * r); g.lineTo(c.x + u.x * r, c.y + u.y * r); g.stroke();
    if (hollow) { g.lineWidth = Math.max(1, r * 0.1); g.beginPath(); g.moveTo(c.x - w.x * r, c.y - w.y * r); g.lineTo(c.x + w.x * r, c.y + w.y * r); g.stroke(); }
    g.restore(); g.beginPath(); g.arc(c.x + w.x * r * 0.55, c.y + w.y * r * 0.55, Math.max(1.4, r * 0.16), 0, 2 * Math.PI); g.fillStyle = hollow ? '#2a1606' : '#1d3a28'; g.fill();
    if (hollow) { g.beginPath(); g.arc(c.x, c.y, r * 0.82, 0, 2 * Math.PI); g.strokeStyle = 'rgba(255,230,200,0.35)'; g.lineWidth = 1; g.stroke(); } }
  // an ice cube: a translucent blue-white block sitting on the track, square to it; it slides without turning
  ice(n) { const g = this.g, s = this.s, N = n.nrm || { x: 0, y: 1 }, Tn = { x: N.y, y: -N.x }, c = this.P(this.centre(n)), h = Renderer.BALL * 0.92, at = (a, b) => ({ x: c.x + (Tn.x * a + N.x * b) * s, y: c.y - (Tn.y * a + N.y * b) * s });
    const sq = [at(-h, -h), at(h, -h), at(h, h), at(-h, h)], dv = { x: this.dv.x * 0.7, y: this.dv.y * 0.7 }, back = sq.map((p) => ({ x: p.x + dv.x, y: p.y + dv.y }));
    g.save(); g.setLineDash([]); g.lineJoin = 'round';
    const poly = (pts, fill, stroke) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); } };
    poly(back, 'rgba(170,215,245,0.35)', 'rgba(220,240,255,0.5)'); for (let i = 0; i < 4; i++) poly([sq[i], sq[(i + 1) % 4], back[(i + 1) % 4], back[i]], 'rgba(185,225,250,0.28)', 'rgba(220,240,255,0.45)');
    const ys = sq.map((p) => p.y), gr = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys)); gr.addColorStop(0, 'rgba(235,248,255,0.78)'); gr.addColorStop(1, 'rgba(150,200,240,0.6)');
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 7; g.shadowOffsetY = 2; poly(sq, gr, null); g.shadowColor = 'transparent'; poly(sq, null, 'rgba(240,250,255,0.95)');
    const a = at(-h * 0.62, h * 0.55), b = at(h * 0.1, h * 0.55), d = at(-h * 0.62, -h * 0.1); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(a.x, a.y); g.lineTo(d.x, d.y); g.stroke(); g.restore();
    this.cs = c; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of sq.concat(back)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    this.boxes.push({ x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 }); this.hit = { x: c.x, y: c.y, r: Math.max(10, h * s + 4) }; }
  // the height above the zero of U_g, as a dimension line
  height(sim, n) { const g = this.g, x = this.X(n.p.x) - 14, y1 = this.Y(n.p.y), y0 = this.Y(sim.vals.y0); if (Math.abs(y1 - y0) < 4) return; g.save(); g.strokeStyle = 'rgba(95,208,196,0.85)'; g.lineWidth = 1.2; g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.setLineDash([]); for (const y of [y0, y1]) { g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.stroke(); } g.restore(); this.lines.push([x, y0, x, y1]);
    this.labels.push({ runs: [{ t: 'h', f: 'italic 600 13px ' + Renderer.SERIF, col: '#8fe3d9' }, ...(sim.show.nums ? [{ t: ' = ' + Fmt.m(n.p.y - sim.vals.y0), f: '600 11px ' + Renderer.MONO, col: '#8fe3d9' }] : [])], at: { x: x - 4, y: (y0 + y1) / 2 }, dir: { x: -1, y: 0 } }); }

  // ---- the vectors, from the ball's centre: flat arrows with a dark edge, as in Forces Lab's free-body diagrams ----
  flat(a, c, col, lw, head) { const g = this.g, l = Math.hypot(c.x - a.x, c.y - a.y); if (l < 1) return; const u = { x: (c.x - a.x) / l, y: (c.y - a.y) / l };
    const draw = (w, h, colr) => { const hb = { x: c.x - u.x * h, y: c.y - u.y * h }; g.strokeStyle = colr; g.fillStyle = colr; g.lineWidth = w; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(hb.x, hb.y); g.stroke();
      g.beginPath(); g.moveTo(c.x + u.x * (w > lw ? 1 : 0), c.y + u.y * (w > lw ? 1 : 0)); g.lineTo(hb.x - u.y * h * 0.5, hb.y + u.x * h * 0.5); g.lineTo(hb.x + u.y * h * 0.5, hb.y - u.x * h * 0.5); g.closePath(); g.fill(); };
    g.save(); g.lineCap = 'butt'; g.lineJoin = 'round'; g.setLineDash([]); draw(lw + 2.4, head + 1.5, 'rgba(6,10,16,0.75)'); draw(lw, head, col); g.restore(); }
  vectors(sim, n) { const A = this.cs, mg = n.m * G, sym = (l, s, col, rest) => { if (!sim.show.nums) rest = ''; const out = [{ t: l, f: 'italic 600 14px ' + Renderer.SERIF, col }]; if (s) out.push({ t: s, f: 'italic 600 10px ' + Renderer.SERIF, col, dy: 4 }); if (rest) out.push({ t: rest, f: '700 12px ' + Renderer.MONO, col }); return out; };
    // (an arrow longer than 0.4 of the picture's height is drawn at that length: its label still gives the true size)
    const arrow = (vec, scale, col, lw, runs) => { let k = scale * this.s; const L = Math.hypot(vec.x, vec.y) * k, cap = 0.4 * this.H; if (L > cap) k *= cap / L; const B = { x: A.x + vec.x * k, y: A.y - vec.y * k }; if (Math.hypot(B.x - A.x, B.y - A.y) < 3) return;
      this.flat(A, B, col, lw, lw > 2.5 ? 9 : 8); this.labels.push({ runs, at: B, dir: { x: B.x - A.x, y: B.y - A.y }, line: [A.x, A.y, B.x, B.y] }); };
    if (sim.show.forces) for (const f of n.forces) { const F = Renderer.FORCE[f.kind], mag = Math.hypot(f.F.x, f.F.y); arrow(f.F, Renderer.FSCALE / mg, F.col, 2.6, sym(F.l, F.s, F.col, ' = ' + Fmt.N(mag))); }
    if (sim.show.v) arrow(n.v, Renderer.VSCALE, Renderer.C.v, 2.2, sym('v', '', Renderer.C.v, ' = ' + Fmt.vel(n.speed)));
    this.g.beginPath(); this.g.arc(A.x, A.y, 2.5, 0, 2 * Math.PI); this.g.fillStyle = '#fff'; this.g.fill(); }

  // ---- labels: each tries spots past its arrow's tip (then round it) and takes the first that covers nothing ----
  runsWidth(runs) { const g = this.g; let w = 0; for (const r of runs) { g.font = r.f; w += g.measureText(r.t).width + (r.pad || 0); } return w; }
  placeLabels() { const g = this.g, hits = (b) => this.boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) || b.x0 < 4 || b.y0 < 4 || b.x1 > this.W - 4 || b.y1 > this.H - 4,
      crosses = (b) => (this.lines || []).concat(this.labels.filter((l) => l.line).map((l) => l.line)).some(([x1, y1, x2, y2]) => Renderer.segBox(x1, y1, x2, y2, b));
    for (const L of this.labels) { const w = this.runsWidth(L.runs), h = 15, d = Math.hypot(L.dir.x, L.dir.y) || 1, ux = L.dir.x / d, uy = L.dir.y / d; let best = null, bestCost = Infinity;
      for (const r of [8, 14, 22, 32, 44, 60, 80, 104, 132]) for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2, -2, 2.4, -2.4, 2.8, -2.8, Math.PI]) { const c = Math.cos(turn), s = Math.sin(turn), dx = ux * c - uy * s, dy = ux * s + uy * c;
        const cx = L.at.x + dx * (r + w / 2 * Math.abs(dx)), cy = L.at.y + dy * (r + h / 2 * Math.abs(dy)), b = { x0: cx - w / 2 - 2, y0: cy - h / 2, x1: cx + w / 2 + 2, y1: cy + h / 2 };
        const cost = (hits(b) ? 1000 : 0) + (crosses(b) ? 60 : 0) + r * 0.6 + Math.abs(turn) * 8; if (cost < bestCost) { bestCost = cost; best = { cx, cy, b }; } if (cost < 30) break; }
      this.boxes.push(best.b); let x = best.cx - w / 2;
      for (const pass of [0, 1]) { let xx = x; for (const r of L.runs) { g.font = r.f; g.textAlign = 'left'; g.textBaseline = 'middle'; if (!pass) { g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(10,16,24,0.92)'; g.strokeText(r.t, xx, best.cy + (r.dy || 0)); } else { g.fillStyle = r.col; g.fillText(r.t, xx, best.cy + (r.dy || 0)); } xx += g.measureText(r.t).width; } } } }
  // Text with its symbols typeset: a lone K, U, E, m, g, h, v, n, r or θ is an italic serif variable, X_sub gets a lowered
  // subscript (one letter italic, a word like rot or th upright), and an m right after a number is the unit, left upright.
  static VARS = new Set(['K', 'U', 'E', 'm', 'g', 'h', 'v', 'n', 'r', 'θ']);
  static rich(text, w, px, face, prev = '') { const out = [], plain = w + ' ' + px + 'px ' + face, it = 'italic ' + w + ' ' + (px * 1.12).toFixed(1) + 'px ' + Renderer.SERIF;
    const sub = (x) => (x.length === 1 && /[a-zθ]/.test(x) ? 'italic ' : '') + w + ' ' + (px * 0.74).toFixed(1) + 'px ' + (x.length === 1 && /[a-zθ]/.test(x) ? Renderer.SERIF : face);
    const re = /([A-Za-zθ]+)(?:_([A-Za-z0-9]+))?/g; let k = 0, mt; text = text.replace(/v₀/g, 'v_0');
    const add = (t, f, dy) => { if (!t) return; const l = out[out.length - 1]; if (l && l.f === f && (l.dy || 0) === (dy || 0)) l.t += t; else out.push({ t, f, dy }); };
    while ((mt = re.exec(text))) { const [all, base, s] = mt, before = prev + text.slice(0, mt.index), unit = /\d\s?$/.test(before) && !s;
      add(text.slice(k, mt.index), plain); k = mt.index + all.length;
      if (!Renderer.VARS.has(base) || unit) { add(base + (s ? '_' + s : ''), plain); continue; }
      add(base, it); out[out.length - 1].pad = px * 0.12; if (s) add(s, sub(s), px * 0.32); }
    add(text.slice(k), plain); return out; }
  static runsW(g, runs) { let w = 0; for (const r of runs) { g.font = r.f; w += g.measureText(r.t).width + (r.pad || 0); } return w; }
  card(sim, i, measure) { const D = sim.describe(i), g = this.g, maxW = Math.min(this.W - 24, 600), pad = 10;
    // wrap typeset text into lines of runs
    const wrap = (text, w, px, face, width) => { const sp = Renderer.rich(' ', w, px, face), lines = []; let cur = [], cw = 0, prev = '';
      for (const word of text.split(' ')) { const R = Renderer.rich(word, w, px, face, prev), ww = Renderer.runsW(g, R), sw = cur.length ? Renderer.runsW(g, sp) : 0;
        prev = word + ' '; if (cur.length && cw + sw + ww > width) { lines.push(cur); cur = R.slice(); cw = ww; } else { if (cur.length) cur.push(...sp); cur.push(...R); cw += sw + ww; } }
      if (cur.length) lines.push(cur); return lines; };
    const inner = maxW - 2 * pad, S = Renderer.SANS;
    const rows = [...wrap((i + 1) + ' of ' + sim.events.length + ' · ' + D.title, 700, 12.5, S, inner).map((t) => ({ t, c: '#f0c860', h: 18 })), ...wrap(D.why, 500, 11.5, S, inner).map((t) => ({ t, c: '#e6edf3', h: 16 })),
      ...(D.tally ? wrap(D.tally, 600, 10, Renderer.MONO, inner).map((t, k) => ({ t, c: '#9fb2c4', h: 15, gap: k === 0 ? 4 : 0 })) : [])];
    let wd = 0; for (const r of rows) wd = Math.max(wd, Renderer.runsW(g, r.t)); wd += 2 * pad; const h = rows.reduce((a, r) => a + r.h + (r.gap || 0), 0) + 10, x = Math.max(12, (this.W - wd) / 2), y = 10;
    if (measure) return { x0: x, y0: y, x1: x + wd, y1: y + h };
    g.save(); g.fillStyle = 'rgba(14,22,33,0.93)'; g.strokeStyle = 'rgba(240,200,96,0.55)'; g.lineWidth = 1; g.beginPath(); if (g.roundRect) g.roundRect(x, y, wd, h, 8); else g.rect(x, y, wd, h); g.fill(); g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'middle'; let yy = y + 5; for (const r of rows) { yy += r.gap || 0; g.fillStyle = r.c; let xx = x + pad; for (const q of r.t) { g.font = q.f; g.fillText(q.t, xx, yy + r.h / 2 + (q.dy || 0)); xx += g.measureText(q.t).width + (q.pad || 0); } yy += r.h; }
    // and a ring round the rider, where it happened
    const p = this.P(sim.ride.now().p); g.strokeStyle = 'rgba(240,200,96,0.9)'; g.lineWidth = 1.6; g.setLineDash([3, 3]); g.beginPath(); g.arc(p.x, p.y - (sim.ride.now().mode === 'air' ? 0 : 0), Math.max(14, Renderer.BALL * this.s + 7), 0, 2 * Math.PI); g.stroke(); g.restore(); }
  static segBox(x1, y1, x2, y2, b) { const inside = (x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1; if (inside(x1, y1) || inside(x2, y2)) return true;
    const X = (ax, ay, bx, by, cx, cy, dx, dy) => { const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false; const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
    return X(x1, y1, x2, y2, b.x0, b.y0, b.x1, b.y0) || X(x1, y1, x2, y2, b.x1, b.y0, b.x1, b.y1) || X(x1, y1, x2, y2, b.x0, b.y1, b.x1, b.y1) || X(x1, y1, x2, y2, b.x0, b.y0, b.x0, b.y1); }

  // ---- what has happened (it left the track, it landed, it stopped), across the top ----
  // Paused at an event of the history, it is a card instead: what happened and why, then the energies there and what changed since the event before.
  status(sim, measure) { const ride = sim.ride, at = sim.playing ? -1 : sim.evIndex; if (at >= 0) return this.card(sim, at, measure); const text = ride.done || ride.event; if (!text) return null; const g = this.g, maxW = Math.min(this.W - 24, 520); g.font = '600 12px ' + Renderer.SANS;
    const words = text.split(' '), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW - 20 && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur);
    const h = 10 + lines.length * 16, wd = Math.max(...lines.map((l) => g.measureText(l).width)) + 20, x = Math.max(12, (this.W - wd) / 2), y = 10; if (measure) return { x0: x, y0: y, x1: x + wd, y1: y + h };
    g.save(); g.fillStyle = ride.done ? 'rgba(60,40,22,0.9)' : 'rgba(17,26,38,0.9)'; g.strokeStyle = 'rgba(240,200,96,0.45)'; g.lineWidth = 1;
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, wd, h, 8); else g.rect(x, y, wd, h); g.fill(); g.stroke(); g.fillStyle = '#f3f6f9'; g.textAlign = 'left'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, x + 10, y + 13 + i * 16)); g.restore(); }
}
