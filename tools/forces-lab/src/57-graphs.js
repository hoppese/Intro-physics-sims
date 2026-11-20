// =====================================================================
// Graphs -- the strip under the bench: what the run's recording says about
// one block (the selected one, or the first), against time.
//   motion   position, velocity and acceleration, stacked on one time axis:
//            components along x, along y, or along the surface it starts on
//   forces   the size of every force on it, and of the net force
//   energy   kinetic, gravitational, spring and thermal energy (and the work
//            done by applied forces) over time, with bars for the moment shown
// The gold line is the moment on the bench; dragging along the graphs takes
// the bench to that moment (Workbench.seek).
// =====================================================================
class Graphs {
  static H = 188;                            // css px: the strip's height (kept short so the page fits a laptop screen)
  static C = { bg: '#0f1722', panel: '#121c28', grid: 'rgba(255,255,255,0.06)', zero: 'rgba(255,255,255,0.26)', text: '#8fa1b3', ink: '#dfe7ef', cursor: '#f0c860', future: 0.35 };
  static ECOL = { K: '#6cb8ff', Ug: '#7fd68f', Us: '#c99af0', th: '#ff9f6b', W: '#f0c860', E: '#e8eef4' };
  static MOTION = '#9fe6b8';
  static M = { l: 58, r: 14, t: 8, b: 22, gap: 8 };

  // a round step that cuts `span` into about n pieces
  static step(span, n) { const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  // the range a graph shows: always includes zero, with a little room
  static range(vals) { let lo = 0, hi = 0; for (const v of vals) { if (!isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-9) return [-1, 1]; const pad = (hi - lo) * 0.1; return [lo < 0 ? lo - pad : lo, hi > 0 ? hi + pad : hi]; }

  // the block the graphs are about, and its place in the recording
  static subject(bench) { const sel = bench.selected, w = bench.world, el = sel instanceof Block ? sel : bench.scene.blocks[0]; if (!el) return null;
    const i = w.bodies.findIndex((b) => b.id === el.id); return i < 0 ? null : { el, i }; }
  // what the motion graphs measure along: x, y, or s, along the surface it starts on (pointed the way it first speeds up,
  // so that a block sliding down a ramp has positive s, v and a)
  static along(bench, R, i) { const a = bench.axis;
    if (a === 'y') return { u: { x: 0, y: 1 }, l: 'y', o: { x: 0, y: 0 } };
    if (a === 's') { const r0 = R[0].b[i]; let u = V.polar(r0.ang); const first = R.find((r) => !r.b[i].gone && V.len(r.b[i].a) > 1e-6);
      if (first && V.dot(first.b[i].a, u) < 0) u = V.mul(u, -1); return { u, l: 's', o: r0.p }; }
    return { u: { x: 1, y: 0 }, l: 'x', o: { x: 0, y: 0 } }; }

  // ---- drawing ----
  draw(g, bench, W, H) { const C = Graphs.C, w = bench.world, R = w.rec; this.g = g; this.W = W; this.H = H; this.area = null;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const sub = Graphs.subject(bench); if (!sub || !R.length) { this.note('Put a block on the bench and press Run: its graphs appear here.'); return; }
    const tEnd = R[R.length - 1].t, ts = Graphs.step(Math.max(tEnd, 2), 6), tmax = Math.max(2, Math.ceil(tEnd / ts - 1e-9) * ts);
    const M = Graphs.M, kind = bench.graph, x1 = W - M.r - (kind === 'energy' ? Math.min(170, W * 0.26) : 0);
    this.area = { x0: M.l, x1, tmax, tEnd }; this.cur = w.t; this.idx = Graphs.index(R, w.t);
    if (kind === 'motion') { const ax = Graphs.along(bench, R, sub.i), u = ax.u, at = (f) => R.map((r) => (r.b[sub.i].gone ? NaN : f(r.b[sub.i])));
      const rows = [{ vals: at((b) => V.dot(V.sub(b.p, ax.o), u)), l: ax.l, s: '', unit: 'm' }, { vals: at((b) => V.dot(b.v, u)), l: 'v', s: ax.l, unit: 'm/s' }, { vals: at((b) => V.dot(b.a, u)), l: 'a', s: ax.l, unit: 'm/s²' }];
      const hh = (H - M.t - M.b - 2 * M.gap) / 3;
      rows.forEach((row, k) => this.plot({ x0: M.l, x1, y0: M.t + k * (hh + M.gap), y1: M.t + k * (hh + M.gap) + hh }, R, [{ vals: row.vals, col: Graphs.MOTION, l: row.l, s: row.s, unit: row.unit }], { last: k === 2, unit: row.unit }));
      return; }
    if (kind === 'forces') { if (bench.hidden) { this.note('Forces hidden: draw the free-body diagram first, then press Show forces.'); this.area = null; return; }
      // (one curve for the friction at each contact, static then kinetic: so the drop when it breaks free shows as a drop)
      const keys = new Map(); R.forEach((r, j) => { for (const f of r.f[sub.i]) { const fric = f.kind === 'static' || f.kind === 'kinetic', k = (fric ? 'friction' : f.kind) + '|' + f.by;
        let e = keys.get(k); if (!e) keys.set(k, (e = { kind: f.kind, kinds: [], vals: new Float64Array(R.length).fill(NaN) })); e.vals[j] = V.len(f.F); e.kinds[j] = f.kind; } });
      const series = [...keys.values()].map((e) => { const now = e.kinds[this.idx] || e.kind, F = Renderer.FORCE[now] || { l: 'F', s: '', col: '#ccc' }; return { vals: e.vals, col: F.col, l: F.l, s: F.s, unit: 'N' }; });
      const m = w.bodies[sub.i].m; series.push({ vals: R.map((r) => (r.b[sub.i].gone ? NaN : m * V.len(r.b[sub.i].a))), col: C.ink, dash: [5, 4], l: 'F', s: 'net', unit: 'N' });
      this.plot({ x0: M.l, x1, y0: M.t + 18, y1: H - M.b }, R, series, { last: true, unit: 'N', legend: true, positive: true }); return; }
    if (kind === 'energy') { const off = Graphs.ugZero(w), E = (k) => R.map((r) => r.e[k] - (k === 'Ug' ? off : 0)), has = (k) => R.some((r) => Math.abs(r.e[k]) > 1e-6);
      const series = [{ k: 'K', l: 'K', s: '' }, { k: 'Ug', l: 'U', s: 'g' }, { k: 'Us', l: 'U', s: 's' }, { k: 'th', l: 'E', s: 'th' }, { k: 'W', l: 'W', s: 'ext' }].filter((q) => q.k === 'K' || q.k === 'Ug' || has(q.k))
        .map((q) => ({ vals: E(q.k), col: Graphs.ECOL[q.k], l: q.l, s: q.s, unit: 'J', k: q.k }));
      series.push({ vals: R.map((r) => r.e.K + r.e.Ug - off + r.e.Us + r.e.th), col: Graphs.ECOL.E, dash: [5, 4], l: 'E', s: 'tot', unit: 'J', k: 'E' });
      const rect = { x0: M.l, x1, y0: M.t + 18, y1: H - M.b }, rng = this.plot(rect, R, series, { last: true, unit: 'J', legend: true });
      this.bars({ x0: x1 + 26, x1: W - M.r, y0: rect.y0, y1: rect.y1 }, series, rng); } }

  // Gravitational energy is drawn from zero at the lowest point each block reaches in the run (as in an energy bar
  // chart), not from y = 0: a pendulum high on the bench then trades a joule of K for a joule of U_g, visibly.
  static ugZero(w) { let off = 0; w.bodies.forEach((b, i) => { let lo = Infinity; for (const r of w.rec) if (!r.b[i].gone) lo = Math.min(lo, r.b[i].p.y); if (isFinite(lo)) off += b.m * w.g * lo; }); return off; }
  // nearest recorded moment to t
  static index(R, t) { let lo = 0, hi = R.length - 1; if (t <= R[0].t) return 0; if (t >= R[hi].t) return hi; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m].t <= t) lo = m; else hi = m; } return t - R[lo].t <= R[hi].t - t ? lo : hi; }
  tx(t) { const a = this.area; return a.x0 + (a.x1 - a.x0) * t / a.tmax; }
  // the moment under a point of the strip, or null
  timeAt(px) { const a = this.area; if (!a) return null; return Math.max(0, Math.min(a.tEnd, (px - a.x0) / (a.x1 - a.x0) * a.tmax)); }

  // one graph: its grid, zero line, curves (faint past the moment shown), the gold line, and a read-out of each curve there
  plot(r, R, series, o) { const g = this.g, C = Graphs.C, all = []; for (const s of series) for (const v of s.vals) all.push(v);
    let [lo, hi] = Graphs.range(all); if (o.positive) lo = Math.min(0, lo); const ty = (v) => r.y1 - (v - lo) / (hi - lo) * (r.y1 - r.y0);
    g.fillStyle = C.panel; g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    // grid: values
    const vs = Graphs.step(hi - lo, Math.max(2, Math.round((r.y1 - r.y0) / 22))); g.font = '500 10px ' + Renderer.MONO; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / vs) * vs; v <= hi + 1e-9; v += vs) { const y = ty(v); g.strokeStyle = Math.abs(v) < vs * 1e-6 ? C.zero : C.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(r.x0, y); g.lineTo(r.x1, y); g.stroke();
      g.fillStyle = C.text; g.fillText(Fmt.num(Math.abs(v) < vs * 1e-6 ? 0 : v, vs < 0.1 ? 2 : vs < 1 ? 1 : 0), r.x0 - 5, y); }
    // grid: time
    const a = this.area, ts = Graphs.step(a.tmax, Math.max(2, Math.round((a.x1 - a.x0) / 70))); g.textAlign = 'center'; g.textBaseline = 'top';
    for (let t = 0; t <= a.tmax + 1e-9; t += ts) { const x = this.tx(t); g.strokeStyle = C.grid; g.beginPath(); g.moveTo(x, r.y0); g.lineTo(x, r.y1); g.stroke(); if (o.last) { g.fillStyle = C.text; g.fillText(Fmt.num(t, ts < 1 ? 1 : 0), x, r.y1 + 5); } }
    if (o.last) { g.textAlign = 'right'; g.fillText('t (s)', r.x1, r.y1 + 5); }
    // the curves: solid up to the moment shown, faint after it (after a rewind)
    g.save(); g.beginPath(); g.rect(r.x0, r.y0 - 1, r.x1 - r.x0, r.y1 - r.y0 + 2); g.clip(); g.lineJoin = 'round';
    const n = R.length, stride = Math.max(1, Math.floor(n / Math.max(50, (r.x1 - r.x0)))), cut = this.idx;
    // (earlier curves wider, underneath: two forces that are equal, like w and n on a level floor, both still show)
    series.forEach((s, k) => { g.strokeStyle = s.col; g.lineWidth = series.length > 1 ? 1.6 + 2.2 * (series.length - 1 - k) / (series.length - 1) : 1.8; g.setLineDash(s.dash || []);
      for (const [from, to, alpha] of [[0, cut, 1], [cut, n - 1, C.future]]) { if (to <= from) continue; g.globalAlpha = alpha; g.beginPath(); let pen = false;
        for (let j = from; j <= to; j = j === to ? to + 1 : Math.min(to, j + stride)) { const v = s.vals[j]; if (!isFinite(v)) { pen = false; continue; } const x = this.tx(R[j].t), y = ty(v); if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; } }
        g.stroke(); } });
    g.globalAlpha = 1; g.setLineDash([]); g.restore();
    // the moment shown
    const xc = this.tx(R[cut].t); g.strokeStyle = C.cursor; g.lineWidth = 1.2; g.beginPath(); g.moveTo(xc, r.y0); g.lineTo(xc, r.y1); g.stroke();
    for (const s of series) { const v = s.vals[cut]; if (isFinite(v)) Renderer.prototype.dot.call({ g }, { x: xc, y: ty(v) }, 3, s.col, '#0f1722'); }
    // read-outs: the symbol (italic, as in print) and its value there
    let x = r.x0 + 6; const y = o.legend ? r.y0 - 10 : r.y0 + 10;
    if (o.title) { g.font = '600 11px ' + Renderer.SANS; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = C.text; g.fillText(o.title, r.x1 - 4, o.legend ? r.y0 - 10 : r.y0 + 10); }
    // (a force not acting at that moment keeps its curve but gets no read-out)
    const outs = series.map((s) => [s, s.vals[cut]]).filter(([, v]) => isFinite(v)).map(([s, v]) => [s, Fmt.num(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) + ' ' + s.unit]);
    // (on a backing, so a curve passing under them does not get in the way)
    if (!o.legend && outs.length) { let wsum = 0; for (const [s, txt] of outs) wsum += this.readout(0, -999, s, txt, true) + 14; g.fillStyle = 'rgba(15,23,34,0.82)'; g.fillRect(x - 4, y - 9, wsum - 6, 18); }
    for (const [s, txt] of outs) x = this.readout(x, y, s, txt) + 14;
    return [lo, hi]; }

  // a symbol (italic, as in print) and its value; with `measure`, only how wide it would be
  readout(x, y, s, value, measure) { const g = this.g, x0 = x, put = (t, a, b) => { if (!measure) g.fillText(t, a, b); }; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = 'italic 600 13px ' + Renderer.SERIF; g.fillStyle = s.col; put(s.l, x, y); x += g.measureText(s.l).width + 1;
    if (s.s) { g.font = 'italic 600 9px ' + Renderer.SERIF; put(s.s, x, y + 4); x += g.measureText(s.s).width + 1; }
    g.font = '600 11px ' + Renderer.MONO; g.fillStyle = Graphs.C.ink; const str = ' = ' + value; put(str, x, y); x += g.measureText(str).width; return measure ? x - x0 : x; }

  // energy bars for the moment shown, on the same scale as the graph beside them
  bars(r, series, [lo, hi]) { const g = this.g, C = Graphs.C, cut = this.idx, ty = (v) => r.y1 - (v - lo) / (hi - lo) * (r.y1 - r.y0), n = series.length, bw = (r.x1 - r.x0) / n;
    g.fillStyle = C.panel; g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); g.strokeStyle = C.zero; g.lineWidth = 1; g.beginPath(); g.moveTo(r.x0, ty(0)); g.lineTo(r.x1, ty(0)); g.stroke();
    series.forEach((s, k) => { const v = s.vals[cut], x = r.x0 + k * bw + bw * 0.18, wdt = bw * 0.64; if (!isFinite(v)) return; const y0 = ty(0), y = ty(v);
      g.globalAlpha = s.k === 'E' ? 0.35 : 0.9; g.fillStyle = s.col; g.fillRect(x, Math.min(y, y0), wdt, Math.max(1, Math.abs(y - y0))); g.globalAlpha = 1;
      g.font = 'italic 600 12px ' + Renderer.SERIF; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = s.col; const lw = g.measureText(s.l).width; g.fillText(s.l, x + wdt / 2 - (s.s ? 3 : 0), r.y1 + 5);
      if (s.s) { g.font = 'italic 600 8px ' + Renderer.SERIF; g.textAlign = 'left'; g.fillText(s.s, x + wdt / 2 - 3 + lw / 2, r.y1 + 10); } }); }

  note(text) { const g = this.g; g.font = '500 12px ' + Renderer.SANS; g.fillStyle = Graphs.C.text; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, this.W / 2, this.H / 2); }
}
