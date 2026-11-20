// =====================================================================
// Graphs -- the three stacked graphs under the track: x, v_x and a_x against
// one time axis, 0 to the end of the run. Each curve is solid up to the moment
// shown (the gold line) and faint after it (after a rewind). Dragging along the
// graphs moves the clock (Sim.seek); while sketching, dragging on the graph
// being sketched draws on it instead.
//   match/drive   the target (gold, dashed) on its own graph; the cart's run on all three
//   match/sketch  the sketch (violet); every real curve hidden until Check
//   cars          car A (red) and car B (blue), with the meetings marked
//   program/diag  the one car; a turning point (v_x = 0, a_x ≠ 0) is marked
// Slope & area (a toggle): the tangent to x–t at the moment shown, with its slope v_x,
// and the area under v–t (Δx) and under a–t (Δv_x) from 0 to that moment.
// =====================================================================
class Graphs {
  static C = { panel: '#121c28', grid: 'rgba(255,255,255,0.06)', zero: 'rgba(255,255,255,0.28)', text: '#8fa1b3', ink: '#dfe7ef', cursor: '#f0c860', future: 0.3, pos: 'rgba(120,214,150,0.22)', neg: 'rgba(240,120,120,0.22)' };
  static M = { l: 56, r: 12, b: 20, gap: 7 };
  static ROWS = [{ k: 'x', l: 'x', s: '', unit: 'm' }, { k: 'v', l: 'v', s: 'x', unit: 'm/s' }, { k: 'a', l: 'a', s: 'x', unit: 'm/s²' }];
  static FIXED = { x: [0, 5], v: [-1, 1], a: [-0.6, 0.6] };      // the ranges for the 5 m track

  static step(span, n) { const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  static range(vals) { let lo = 0, hi = 0; for (const v of vals) { if (!isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-9) return [-1, 1]; const pad = (hi - lo) * 0.1; return [lo < 0 ? lo - pad : lo, hi > 0 ? hi + pad : hi]; }

  // ---- where everything goes (also used to turn a pointer into a time or a value) ----
  layout(sim, rect) { const M = Graphs.M, T = sim.T, x0 = rect.x0 + M.l, x1 = rect.x1 - M.r, top = rect.y0, hh = (rect.y1 - top - M.b - 2 * M.gap) / 3;
    const ranges = this.ranges(sim);
    // (room along the top of each graph for its read-outs, so no curve runs under them)
    const room = sim.mode === 'match' ? 0 : Math.min(0.35, 22 / Math.max(30, hh - 22));
    this.area = { x0, x1, T }; this.rows = Graphs.ROWS.map((R, k) => { const [lo, hi] = ranges[R.k]; return { ...R, y0: top + k * (hh + M.gap), y1: top + k * (hh + M.gap) + hh, lo, hi: hi + (hi - lo) * room }; }); }
  ranges(sim) { if (sim.mode === 'match') return Graphs.FIXED;
    const out = { x: [], v: [], a: [] }, T = sim.T; for (const b of sim.bodies()) for (let i = 0; i <= 240; i++) { const s = b.at(i / 240 * T); out.x.push(s.x); out.v.push(s.v); out.a.push(s.a); }
    return { x: Graphs.range(out.x), v: Graphs.range(out.v), a: Graphs.range(out.a) }; }
  tx(t) { const a = this.area; return a.x0 + (a.x1 - a.x0) * t / a.T; }
  ty(row, v) { return row.y1 - (v - row.lo) / (row.hi - row.lo) * (row.y1 - row.y0); }
  timeAt(px) { const a = this.area; if (!a) return null; return clamp((px - a.x0) / (a.x1 - a.x0) * a.T, 0, a.T); }
  rowAt(py) { return (this.rows || []).find((r) => py >= r.y0 - 4 && py <= r.y1 + 4) || null; }
  valAt(row, py) { return row.lo + (row.y1 - clamp(py, row.y0, row.y1)) / (row.y1 - row.y0) * (row.hi - row.lo); }

  // ---- drawing ----
  draw(g, sim, rect, R) { this.g = g; this.R = R; this.layout(sim, rect); const C = Graphs.C, T = sim.T, t = sim.t;
    for (const row of this.rows) this.frame(row, row === this.rows[2]);
    // the curves, each a list of [t, value] points
    const curves = this.curves(sim);
    for (const row of this.rows) { g.save(); g.beginPath(); g.rect(this.area.x0, row.y0 - 1, this.area.x1 - this.area.x0, row.y1 - row.y0 + 2); g.clip();
      if (sim.show.hints && !sim.veiled) this.hintFill(sim, row);
      for (const c of curves[row.k]) this.curve(row, c);
      g.restore(); }
    // the meetings, and a turning point
    const marks = this.marks(sim); for (const m of marks) { g.save(); g.setLineDash([3, 4]); g.strokeStyle = 'rgba(240,200,96,0.55)'; g.lineWidth = 1; const x = this.tx(m.t); g.beginPath(); g.moveTo(x, this.rows[0].y0); g.lineTo(x, this.rows[2].y1); g.stroke(); g.restore();
      const row = this.rows.find((r) => r.k === m.row); this.R.dot({ x, y: this.ty(row, m.v) }, 4.5, '#f0c860', '#0f1722'); }
    if (!sim.veiled && !sim.driving) this.spikes(sim);
    // the moment shown
    const xc = Math.round(this.tx(t)) + 0.5; g.save(); g.strokeStyle = 'rgba(240,200,96,0.25)'; g.lineWidth = 4; g.beginPath(); g.moveTo(xc, this.rows[0].y0); g.lineTo(xc, this.rows[2].y1); g.stroke();
    g.strokeStyle = C.cursor; g.lineWidth = 1.2; g.stroke(); g.fillStyle = C.cursor; g.beginPath(); g.moveTo(xc - 5, this.rows[0].y0 - 6); g.lineTo(xc + 5, this.rows[0].y0 - 6); g.lineTo(xc, this.rows[0].y0); g.closePath(); g.fill(); g.restore();
    // (where each curve is now: a bright dot with a glow and a white ring)
    for (const row of this.rows) for (const c of curves[row.k]) if (c.now != null && isFinite(c.now)) { const p = { x: xc, y: this.ty(row, c.now) }; g.save(); g.shadowColor = c.col; g.shadowBlur = 7; this.R.dot(p, 4.2, c.col, null); g.restore(); g.lineWidth = 1.4; this.R.dot(p, 4.2, null, 'rgba(255,255,255,0.9)'); }
    if (sim.show.hints && !sim.veiled) this.hintLines(sim);
    const ends = {}; for (const row of this.rows) ends[row.k] = this.readouts(sim, row, curves[row.k]);
    // (a key on the graph being matched: which line is the goal, which is yours)
    if (sim.mode === 'match') { const row = this.rows.find((r) => r.k === (sim.driving ? sim.target.kind : sim.sketchOf));
      if (sim.driving) this.legend(row, ends[row.k], [{ col: Sim.COL.target, dash: [6, 4], t: 'target: make your line follow it', s: 'target' }, { col: Sim.COL.one, t: 'your cart', s: 'you' }]);
      else if (sim.checked) this.legend(row, ends[row.k], [{ col: Sim.COL.target, dash: [6, 4], t: 'the real graph', s: 'real' }, { col: Sim.COL.sketch, t: 'your sketch', s: 'yours' }]); } }
  // a key at the top right of a graph: a short sample of each line and what it is
  // (beside the read-outs if there is room, else shortened, else on a line of its own under them)
  legend(row, after, items) { const g = this.g, gap = 14, f = '600 10.5px ' + Renderer.SANS, x1 = this.area.x1 - 8; g.font = f;
    const fit = (short) => { const sw = short ? 14 : 22, ws = items.map((it) => sw + 6 + g.measureText(short ? it.s : it.t).width); return { sw, ws, w: ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1), short }; };
    let L = fit(false), y = row.y0 + 10; const room = (L2) => x1 - L2.w - 6 >= (after || this.area.x0) + 14;
    if (!room(L)) { const S = fit(true); if (room(S)) L = S; else y = row.y0 + 32; }
    const { sw, ws, w, short } = L; let x = x1 - w;
    g.beginPath(); if (g.roundRect) g.roundRect(x - 6, y - 9, w + 12, 18, 5); else g.rect(x - 6, y - 9, w + 12, 18); g.fillStyle = 'rgba(10,17,26,0.88)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1; g.stroke();
    items.forEach((it, i) => { g.save(); g.strokeStyle = it.col; g.lineWidth = 2.4; g.setLineDash(it.dash || []); g.lineCap = it.dash ? 'butt' : 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + sw, y); g.stroke(); g.restore();
      g.font = f; g.fillStyle = it.col; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(short ? it.s : it.t, x + sw + 6, y); x += ws[i] + gap; });
    this.R.boxes.push({ x0: x1 - w - 6, y0: y - 9, x1: x1 + 6, y1: y + 9, what: 'graph' }); }

  // a graph's box, value grid and (on the last) the time axis
  frame(row, last) { const g = this.g, C = Graphs.C, a = this.area, bg = g.createLinearGradient(0, row.y0, 0, row.y1); bg.addColorStop(0, '#152232'); bg.addColorStop(1, '#0f1824'); g.fillStyle = bg; g.fillRect(a.x0, row.y0, a.x1 - a.x0, row.y1 - row.y0);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.strokeRect(a.x0 + 0.5, row.y0 + 0.5, a.x1 - a.x0 - 1, row.y1 - row.y0 - 1);
    const vs = Graphs.step(row.hi - row.lo, Math.max(2, Math.round((row.y1 - row.y0) / 24))); g.font = '500 10px ' + Renderer.MONO; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(row.lo / vs - 1e-9) * vs; v <= row.hi + 1e-9; v += vs) { const y = this.ty(row, v); const zero = Math.abs(v) < vs * 1e-6; g.strokeStyle = zero ? C.zero : C.grid; g.lineWidth = zero ? 1.3 : 1; g.beginPath(); g.moveTo(a.x0, Math.round(y) + 0.5); g.lineTo(a.x1, Math.round(y) + 0.5); g.stroke(); g.strokeStyle = 'rgba(200,212,224,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x0 - 3, Math.round(y) + 0.5); g.lineTo(a.x0, Math.round(y) + 0.5); g.stroke();
      if (y > row.y0 + 5 && y < row.y1 - 5 || Math.abs(v) < vs * 1e-6) { g.fillStyle = C.text; g.fillText(Fmt.num(Math.abs(v) < vs * 1e-6 ? 0 : v, vs < 0.1 ? 2 : vs < 1 ? 1 : 0), a.x0 - 5, y); } }
    // (the quantity and its unit, turned, at the far left)
    g.save(); g.translate(a.x0 - 44, (row.y0 + row.y1) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = C.text; g.font = 'italic 600 12px ' + Renderer.SERIF; const lw = g.measureText(row.l).width, sw = row.s ? 6 : 0;
    g.font = '500 10px ' + Renderer.SANS; const uw = g.measureText(' (' + row.unit + ')').width, x0 = -(lw + sw + uw) / 2; g.font = 'italic 600 12px ' + Renderer.SERIF; g.textAlign = 'left'; g.fillText(row.l, x0, 0);
    if (row.s) { g.font = 'italic 600 9px ' + Renderer.SERIF; g.fillText(row.s, x0 + lw, 4); } g.font = '500 10px ' + Renderer.SANS; g.fillText(' (' + row.unit + ')', x0 + lw + sw, 0); g.restore();
    const ts = Graphs.step(a.T, Math.max(2, Math.round((a.x1 - a.x0) / 60))); g.textAlign = 'center'; g.textBaseline = 'top'; g.font = '500 10px ' + Renderer.MONO;
    for (let t = 0; t <= a.T + 1e-9; t += ts) { const x = this.tx(t); g.strokeStyle = C.grid; g.beginPath(); g.moveTo(x, row.y0); g.lineTo(x, row.y1); g.stroke(); if (last && x < a.x1 - 40) { g.fillStyle = C.text; g.fillText(Fmt.num(t, ts < 1 ? 1 : 0), x, row.y1 + 4); } }
    if (last) { g.textAlign = 'right'; g.fillStyle = C.text; g.fillText('t (s)', a.x1, row.y1 + 4); } }

  // ---- the curves on each graph: { pts: [[t, v]], col, dash, lw, now (value at the moment shown), name, upto } ----
  curves(sim) { const out = { x: [], v: [], a: [] }, T = sim.T, t = sim.t, C = Sim.COL, n = Math.max(120, Math.round(this.area.x1 - this.area.x0));
    const sample = (f, t1) => { const p = []; for (let i = 0; i <= n; i++) { const s = i / n * t1; p.push([s, f(s)]); } if (p.length && p[p.length - 1][0] < t1) p.push([t1, f(t1)]); return p; };
    if (sim.mode === 'match') { const Tg = sim.target, m = Tg.motion;
      if (sim.driving) { const target = (k) => ({ pts: sample((s) => m.at(Math.min(s, T - 1e-9))[k], T).concat(Graphs.jumpPts(m, k)).sort((a, b) => a[0] - b[0]), col: C.target, dash: [6, 4], lw: 2.4, now: m.at(Math.min(t, T - 1e-9))[k], name: 'target', all: true });
        out[Tg.kind].push(target(Tg.kind)); const R = sim.rec;
        for (const k of ['x', 'v', 'a']) out[k].push({ pts: R.length ? R.map((r) => [r.t, r[k]]) : [[0, sim.driver[k === 'x' ? 'x' : k === 'v' ? 'v' : 'a']]], col: C.one, lw: 2, now: sim.recAt(t)[k], name: 'cart', upto: t });
        return out; }
      // sketching: the sketch on its graph; the real curves only once checked
      const sk = []; for (let i = 0; i < Sim.N; i++) sk.push([i / (Sim.N - 1) * T, sim.sketch[i]]); out[sim.sketchOf].push({ pts: sk, col: C.sketch, lw: 2.4, name: 'sketch', all: true, now: null });
      if (sim.checked) for (const k of ['x', 'v', 'a']) out[k].push({ pts: Graphs.withJumps(sample((s) => m.at(Math.min(s, T - 1e-9))[k], T), m, k), col: k === sim.sketchOf ? C.target : C.one, dash: k === sim.sketchOf ? [6, 4] : null, lw: 2, now: m.at(Math.min(t, T - 1e-9))[k], name: k === sim.sketchOf ? 'actual' : '', all: true });
      return out; }
    for (const b of sim.bodies()) for (const k of ['x', 'v', 'a']) out[k].push({ pts: Graphs.withJumps(sample((s) => b.at(s)[k], Math.max(sim.reached, t)), b.motion, k), col: b.col, lw: 2, now: b.at(t)[k], name: sim.mode === 'cars' ? b.key : '', upto: t });
    return out; }
  // (a velocity jump, or a change of acceleration, drawn as the vertical step it is, not a slant)
  static jumpPts(m, k) { const P = []; if (!m || k === 'x') return P; for (const q of m.knots) { if (q.t <= 0) continue; P.push([q.t - 1e-6, m.at(q.t - 1e-6)[k]], [q.t + 1e-6, m.at(q.t + 1e-6)[k]]); } return P; }
  static withJumps(pts, m, k) { const J = Graphs.jumpPts(m, k), end = pts.length ? pts[pts.length - 1][0] : 0; return J.length ? pts.concat(J.filter((p) => p[0] <= end)).sort((a, b) => a[0] - b[0]) : pts; }
  // a curve: a dark edge under it so it reads over the grid and the shading, then the colour; faint past the moment shown
  curve(row, c) { const g = this.g, t = this.R.sim.t; g.lineJoin = 'round'; g.lineCap = c.dash ? 'butt' : 'round'; g.setLineDash(c.dash || []);
    const passes = c.all ? [[-Infinity, Infinity, 1]] : [[-Infinity, t + 1e-9, 1], [t - 1e-9, Infinity, Graphs.C.future]];
    for (const [a, b, alpha] of passes) { g.beginPath(); let pen = false;
      for (const [s, v] of c.pts) { if (s < a || s > b || !isFinite(v)) { pen = false; continue; } const x = this.tx(s), y = this.ty(row, v); if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; } }
      g.globalAlpha = alpha * 0.7; g.strokeStyle = 'rgba(5,9,14,0.85)'; g.lineWidth = (c.lw || 2) + 2.4; g.stroke(); g.globalAlpha = alpha; g.strokeStyle = c.col; g.lineWidth = c.lw || 2; g.stroke(); }
    g.globalAlpha = 1; g.setLineDash([]); }

  // A velocity that jumps (an x–t corner) has no finite acceleration at that instant: the a–t graph marks it with a
  // spike, an arrow up (vₓ jumps up) or down to the graph's edge, rather than a made-up value.
  spikes(sim) { const g = this.g, row = this.rows[2], z = this.ty(row, 0), upto = Math.max(sim.reached, sim.t) + 1e-9;
    for (const b of sim.bodies()) { const m = b.motion; if (!m) continue; for (const tj of m.jumps) { if (tj > upto || tj <= 0) continue; const dv = m.at(tj + 1e-7).v - m.at(tj - 1e-7).v, x = this.tx(tj), y = dv > 0 ? row.y0 + 22 : row.y1 - 4;
      g.save(); g.strokeStyle = b.col; g.fillStyle = b.col; g.lineWidth = 1.6; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(x, z); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      const s = dv > 0 ? 1 : -1; g.beginPath(); g.moveTo(x, y - 2 * s); g.lineTo(x - 4, y + 5 * s); g.lineTo(x + 4, y + 5 * s); g.closePath(); g.fill(); g.restore(); } } }
  static hasJumps(m, t) { return !!m && m.jumps.some((tj) => tj > 0 && tj <= t + 1e-9); }
  marks(sim) { const out = [];
    if (sim.mode === 'cars') { const m = sim.meeting; if (m) m.times.forEach((t, i) => { if (t <= sim.T + 1e-9 && t <= Math.max(sim.reached, sim.t) + 1e-9) out.push({ t, row: 'x', v: m.xs[i] }); }); }
    const tp = sim.veiled ? null : sim.turn; if (tp && tp.t <= Math.max(sim.reached, sim.t) + 1e-9) out.push({ t: tp.t, row: 'v', v: 0 });
    return out; }

  // ---- the read-outs along the top of each graph: the symbol and its value at the moment shown ----
  readouts(sim, row, curves) { const g = this.g; let x = this.area.x0 + 6; const y = row.y0 + 10, items = curves.filter((c) => c.now != null && isFinite(c.now));
    if (sim.veiled && row.k !== sim.sketchOf) { this.label(x, y, [{ t: 'hidden until you check your sketch', f: 'italic 500 11px ' + Renderer.SANS, col: Graphs.C.text }]); return; }
    if (sim.veiled) { if (sim.sketchCoverage > 0) return; this.label(x, y, [{ t: 'Sketch the ' + (row.k === 'x' ? 'x' : 'v') + '–t graph here: press and drag across', f: '600 11px ' + Renderer.SANS, col: Sim.COL.sketch }]); return; }
    for (const c of items) { const runs = [];
      if (c.name && (c.name !== 'cart' || items.length > 1)) runs.push({ t: (c.name === 'cart' ? 'your cart' : c.name) + ' ', f: '600 10.5px ' + Renderer.SANS, col: c.col });
      runs.push({ t: row.l, f: 'italic 600 13px ' + Renderer.SERIF, col: c.col }); if (row.s) runs.push({ t: row.s, f: 'italic 600 9px ' + Renderer.SERIF, col: c.col, dy: 4 });
      runs.push({ t: ' = ' + Fmt.short(c.now) + ' ' + row.unit, f: '600 11px ' + Renderer.MONO, col: Graphs.C.ink }); x = this.label(x, y, runs) + 12; } return x - 12; }
  // a run of text on a dark backing (so a curve under it does not get in the way); returns the right edge
  label(x, y, runs, align) { const g = this.g, w = this.R.width(runs); if (align === 'right') x -= w; g.beginPath(); if (g.roundRect) g.roundRect(x - 4.5, y - 9, w + 9, 18, 5); else g.rect(x - 4.5, y - 9, w + 9, 18); g.fillStyle = 'rgba(10,17,26,0.88)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1; g.stroke(); this.R.runs(runs, x, y); this.R.boxes.push({ x0: x - 4, y0: y - 9, x1: x + w + 4, y1: y + 9, what: 'graph' }); return x + w; }

  // ---- slope & area, for the first body ----
  first(sim) { const b = sim.bodies()[0]; return b; }
  hintFill(sim, row) { if (row.k === 'x') return; const g = this.g, b = this.first(sim), t = sim.t; if (t <= 0) return; if (row.k === 'a' && (sim.mode === 'match' || Graphs.hasJumps(b.motion, t))) return;
    const n = 160, z = this.ty(row, 0); for (const sign of [1, -1]) { g.beginPath(); g.moveTo(this.tx(0), z); for (let i = 0; i <= n; i++) { const s = i / n * t, v = b.at(s)[row.k]; g.lineTo(this.tx(s), this.ty(row, sign > 0 ? Math.max(0, v) : Math.min(0, v))); } g.lineTo(this.tx(t), z); g.closePath(); g.fillStyle = sign > 0 ? Graphs.C.pos : Graphs.C.neg; g.fill(); } }
  hintLines(sim) { const g = this.g, b = this.first(sim), t = sim.t, s = b.at(t), T = sim.T, [rx, rv, ra] = this.rows, right = this.area.x1 - 6;
    // the tangent to x–t: slope v_x
    const dt = 0.14 * T, p0 = [Math.max(0, t - dt), s.x - s.v * Math.min(dt, t)], p1 = [Math.min(T, t + dt), s.x + s.v * Math.min(dt, T - t)];
    g.save(); g.beginPath(); g.rect(this.area.x0, rx.y0, this.area.x1 - this.area.x0, rx.y1 - rx.y0); g.clip(); g.strokeStyle = '#ffffff'; g.lineWidth = 1.4; g.setLineDash([5, 3]); g.beginPath(); g.moveTo(this.tx(p0[0]), this.ty(rx, p0[1])); g.lineTo(this.tx(p1[0]), this.ty(rx, p1[1])); g.stroke(); g.restore();
    const sub = (l, s2) => [{ t: l, f: 'italic 600 12px ' + Renderer.SERIF, col: '#ffffff' }, { t: s2, f: 'italic 600 9px ' + Renderer.SERIF, col: '#ffffff', dy: 4 }], mono = (x) => ({ t: x, f: '600 11px ' + Renderer.MONO, col: '#ffffff' }), word = (x) => ({ t: x, f: '600 11px ' + Renderer.SANS, col: '#cfd9e3' });
    const yb = (r) => r.y1 - 10;
    this.label(right, yb(rx), [word('slope = '), ...sub('v', 'x'), mono(' = ' + Fmt.short(s.v) + ' m/s')], 'right');
    const x0 = b.at(0), dx = sim.driving ? Graphs.trap(sim.rec, 'v', t) : s.x - x0.x; this.label(right, yb(rv), [word('area = Δ'), { t: 'x', f: 'italic 600 12px ' + Renderer.SERIF, col: '#ffffff' }, mono(' = ' + Fmt.short(dx) + ' m')], 'right');
    if (sim.mode !== 'match' && !Graphs.hasJumps(b.motion, t)) this.label(right, yb(ra), [word('area = Δ'), ...sub('v', 'x'), mono(' = ' + Fmt.short(s.v - x0.v) + ' m/s')], 'right'); }
  static trap(R, k, t) { let s = 0; for (let i = 1; i < R.length && R[i - 1].t < t; i++) { const t1 = Math.min(R[i].t, t), f = (t1 - R[i - 1].t) / (R[i].t - R[i - 1].t || 1), v1 = R[i - 1][k] + (R[i][k] - R[i - 1][k]) * f; s += 0.5 * (R[i - 1][k] + v1) * (t1 - R[i - 1].t); } return s; }
}
