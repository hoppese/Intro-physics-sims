// =====================================================================
// Graphs -- the strip under the track, from the run's recording:
//   time     K, U_g, E_th and their total against time, with bars for the moment shown
//   x        energy against position: U_g of the track itself (the potential-energy curve,
//            the track's shape scaled by m g), the total mechanical energy, and the run's K
//            and U_g. Where the energy line meets the U_g curve, K = 0: the turning points.
//   normal   the normal force against time, with m g for comparison (negative: the rail pulls)
// The gold line is the moment shown; dragging along a time graph goes to that moment.
// =====================================================================
class Graphs {
  static H = 200;
  static C = { bg: '#0f1722', panel: '#121c28', grid: 'rgba(255,255,255,0.06)', zero: 'rgba(255,255,255,0.26)', text: '#8fa1b3', ink: '#dfe7ef', cursor: '#f0c860', future: 0.35 };
  static ECOL = { K: '#6cb8ff', U: '#7fd68f', th: '#ff9f6b', E: '#e8eef4', track: '#4f7a5a' };
  static M = { l: 58, r: 14, t: 26, b: 22 };
  static step(span, n) { const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  static range(vals) { let lo = 0, hi = 0; for (const v of vals) { if (!isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; } if (hi - lo < 1e-9) return [-1, 1]; const pad = (hi - lo) * 0.08; return [lo < 0 ? lo - pad : lo, hi + pad]; }
  static index(R, t) { let lo = 0, hi = R.length - 1; if (t <= R[0].t) return 0; if (t >= R[hi].t) return hi; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m].t <= t) lo = m; else hi = m; } return t - R[lo].t <= R[hi].t - t ? lo : hi; }

  draw(g, sim, W, H) { const C = Graphs.C, R = sim.ride.rec, M = Graphs.M, m = sim.vals.m, y0 = sim.vals.y0; this.g = g; this.W = W; this.H = H; this.nums = sim.show.nums !== false; this.area = null;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H); if (!R.length) return;
    const kind = sim.graph, idx = Graphs.index(R, sim.time); this.idx = idx;
    if (kind !== 'normal' && sim.hidden) { this.note('Energies hidden: work them out first, then press Show energies.'); return; }
    const U = (r) => m * G * (r.y - y0), barW = Math.min(150, W * 0.24), x1 = W - M.r - (kind === 'normal' ? 0 : barW + 22), rect = { x0: M.l, x1, y0: M.t, y1: H - M.b };
    const t0 = R[0].t, tEnd = R[R.length - 1].t, span = Math.max(2, tEnd - t0), ts = Graphs.step(span, 6), tmax = t0 + Math.max(2, Math.ceil(span / ts - 1e-9) * ts);
    if (kind === 'time' || kind === 'normal') this.area = { x0: rect.x0, x1, t0, tmax, tEnd };
    const series = [{ k: 'K', l: 'K', s: '', vals: R.map((r) => r.K) }, { k: 'U', l: 'U', s: 'g', vals: R.map(U) }, { k: 'th', l: 'E', s: 'th', vals: R.map((r) => r.th) }, { k: 'E', l: 'E', s: 'tot', dash: [5, 4], vals: R.map((r) => r.K + U(r) + r.th) }];
    series.forEach((s) => (s.col = Graphs.ECOL[s.k])); if (!sim.friction && !R.some((r) => r.th > 0.05)) series.splice(2, 1);
    if (kind === 'time') { const rng = this.plot(rect, R, series, { unit: 'J', xs: R.map((r) => r.t), xlo: t0, xhi: tmax, xlabel: 't (s)', cursor: idx }); this.bars({ x0: x1 + 22, x1: W - M.r, y0: rect.y0, y1: rect.y1 }, series, rng); return; }
    if (kind === 'x') { const S = sim.track.S, track = { k: 'track', l: 'U', s: 'g, track', col: Graphs.ECOL.track, vals: S.map((q) => m * G * (q.y - y0)), xs: S.map((q) => q.x), wide: true, noRead: true };
      const mech = series.find((s) => s.k === 'E'); const pts = [track, ...series.filter((s) => s.k === 'K' || s.k === 'U'), { ...mech, l: 'E', s: 'mech', vals: R.map((r) => r.K + U(r)) }];
      const w = Track.WORLD, rng = this.plot(rect, R, pts, { unit: 'J', xs: R.map((r) => r.x), xlo: w.x0, xhi: w.x1, xlabel: 'x (m)', cursor: idx, scatter: true }); this.bars({ x0: x1 + 22, x1: W - M.r, y0: rect.y0, y1: rect.y1 }, series, rng); return; }
    const mg = m * G; this.plot(rect, R, [{ k: 'n', l: 'n', s: '', col: '#6cb8ff', vals: R.map((r) => (r.mode === 'air' ? NaN : r.n)) }, { k: 'mg', l: 'mg', s: '', col: '#ff7a7a', dash: [5, 4], vals: R.map(() => mg) }], { unit: 'N', xs: R.map((r) => r.t), xlo: t0, xhi: tmax, xlabel: 't (s)', cursor: idx }); }

  tx(t) { const a = this.area; return a.x0 + (a.x1 - a.x0) * (t - a.t0) / (a.tmax - a.t0); }
  timeAt(px) { const a = this.area; if (!a) return null; return Math.max(a.t0, Math.min(a.tEnd, a.t0 + (px - a.x0) / (a.x1 - a.x0) * (a.tmax - a.t0))); }

  // one graph: grid, curves (faint past the moment shown), the gold line, a read-out of each curve along the top
  plot(r, R, series, o) { const g = this.g, C = Graphs.C, all = []; for (const s of series) for (const v of s.vals) all.push(v); const [lo, hi] = Graphs.range(all);
    const ty = (v) => r.y1 - (v - lo) / (hi - lo) * (r.y1 - r.y0), tx = (x) => r.x0 + (r.x1 - r.x0) * (x - o.xlo) / (o.xhi - o.xlo);
    g.fillStyle = C.panel; g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    const vs = Graphs.step(hi - lo, Math.max(2, Math.round((r.y1 - r.y0) / 26))); g.font = '500 10px ' + Renderer.MONO; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / vs) * vs; v <= hi + 1e-9; v += vs) { const y = ty(v), z = Math.abs(v) < vs * 1e-6; g.strokeStyle = z ? C.zero : C.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(r.x0, y); g.lineTo(r.x1, y); g.stroke(); g.fillStyle = C.text; g.fillText(Fmt.num(z ? 0 : v, vs < 1 ? 1 : 0), r.x0 - 5, y); }
    g.save(); g.translate(12, (r.y0 + r.y1) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText(o.unit === 'J' ? 'energy (J)' : 'force (N)', 0, 0); g.restore();
    const xs = Graphs.step(o.xhi - o.xlo, Math.max(2, Math.round((r.x1 - r.x0) / 70))); g.textAlign = 'center'; g.textBaseline = 'top';
    for (let x = Math.ceil(o.xlo / xs - 1e-9) * xs; x <= o.xhi + 1e-9; x += xs) { const px = tx(x); g.strokeStyle = C.grid; g.beginPath(); g.moveTo(px, r.y0); g.lineTo(px, r.y1); g.stroke(); g.fillStyle = C.text; if (px < r.x1 - 44) g.fillText(Fmt.num(x, xs < 1 ? 1 : 0), px, r.y1 + 5); }
    g.textAlign = 'right'; g.fillText(o.xlabel, r.x1, r.y1 + 5);
    g.save(); g.beginPath(); g.rect(r.x0, r.y0 - 1, r.x1 - r.x0, r.y1 - r.y0 + 2); g.clip(); g.lineJoin = 'round'; const cut = o.cursor;
    series.forEach((s, k) => { const X = s.xs || o.xs, n = s.vals.length; g.strokeStyle = s.col; g.lineWidth = s.wide ? 5 : 1.6 + 1.6 * (series.length - 1 - k) / Math.max(1, series.length - 1); g.setLineDash(s.dash || []);
      const parts = s.xs ? [[0, n - 1, s.wide ? 0.55 : 1]] : [[0, cut, 1], [cut, n - 1, C.future]];
      for (const [from, to, alpha] of parts) { if (to <= from) continue; g.globalAlpha = alpha; g.beginPath(); let pen = false;
        for (let j = from; j <= to; j++) { const v = s.vals[j]; if (!isFinite(v)) { pen = false; continue; } const x = tx(X[j]), y = ty(v); if (pen && (!o.scatter || Math.abs(X[j] - X[j - 1]) < 1.5)) g.lineTo(x, y); else g.moveTo(x, y); pen = true; } g.stroke(); } });
    g.globalAlpha = 1; g.setLineDash([]); g.restore();
    const xc = tx(o.xs[cut]); if (!o.scatter) { g.strokeStyle = C.cursor; g.lineWidth = 1.2; g.beginPath(); g.moveTo(xc, r.y0); g.lineTo(xc, r.y1); g.stroke(); }
    // the moment shown: each curve's point, emphasised with a soft ring
    for (const s of series) { if (s.noRead) continue; const v = s.vals[cut]; if (isFinite(v)) { const y = ty(v); g.beginPath(); g.arc(xc, y, 7.5, 0, 2 * Math.PI); g.fillStyle = G3.alpha(s.col, 0.22); g.fill(); g.beginPath(); g.arc(xc, y, 4, 0, 2 * Math.PI); g.fillStyle = s.col; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#0f1722'; g.stroke(); } }
    let x = r.x0 + 4; for (const s of series) { if (s.noRead) { x = this.readout(x, r.y0 - 12, s, '') + 16; continue; } const v = s.vals[cut]; if (!isFinite(v)) continue; x = this.readout(x, r.y0 - 12, s, !this.nums ? '' : Fmt.num(v, Math.abs(v) >= 100 ? 0 : 1) + ' ' + o.unit) + 16; }
    return [lo, hi]; }
  readout(x, y, s, value) { const g = this.g; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = 'italic 600 13px ' + Renderer.SERIF; g.fillStyle = s.col; g.fillText(s.l, x, y); x += g.measureText(s.l).width + 1;
    if (s.s) { g.font = 'italic 600 9px ' + Renderer.SERIF; g.fillText(s.s, x, y + 4); x += g.measureText(s.s).width + 1; } if (value) { g.font = '600 11px ' + Renderer.MONO; g.fillStyle = Graphs.C.ink; const t = ' = ' + value; g.fillText(t, x, y); x += g.measureText(t).width; } return x; }
  // energy bars for the moment shown, on the graph's scale: a faint grid, shaded bars, each value written above its bar
  bars(r, series, [lo, hi]) { const g = this.g, C = Graphs.C, cut = this.idx, ty = (v) => r.y1 - (v - lo) / (hi - lo) * (r.y1 - r.y0), n = series.length, bw = (r.x1 - r.x0) / n;
    g.fillStyle = C.panel; g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    const vs = Graphs.step(hi - lo, Math.max(2, Math.round((r.y1 - r.y0) / 26))); g.lineWidth = 1; for (let v = Math.ceil(lo / vs) * vs; v <= hi + 1e-9; v += vs) { const y = Math.round(ty(v)) + 0.5; g.strokeStyle = Math.abs(v) < vs * 1e-6 ? C.zero : C.grid; g.beginPath(); g.moveTo(r.x0, y); g.lineTo(r.x1, y); g.stroke(); }
    series.forEach((s, k) => { const v = s.vals[cut], x = r.x0 + k * bw + bw * 0.17, w = bw * 0.66; if (!isFinite(v)) return; const y0 = ty(0), y = ty(v), top = Math.min(y, y0), h = Math.max(1, Math.abs(y - y0));
      const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, G3.lite(s.col, 0.25, s.k === 'E' ? 0.45 : 0.95)); gr.addColorStop(1, G3.dark(s.col, 0.3, s.k === 'E' ? 0.45 : 0.95));
      g.fillStyle = gr; g.beginPath(); if (g.roundRect) g.roundRect(x, top, w, h, [3, 3, 0, 0]); else g.rect(x, top, w, h); g.fill(); if (s.k === 'E') { g.setLineDash([3, 3]); g.strokeStyle = G3.alpha(s.col, 0.8); g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 1, top + 1, w - 2, 1.2);
      g.font = '600 9.5px ' + Renderer.MONO; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = C.ink; if (this.nums) g.fillText(Fmt.num(v, 0), x + w / 2, Math.max(r.y0 + 10, (v >= 0 ? top : top + h + 12) - 2));
      g.font = 'italic 600 12px ' + Renderer.SERIF; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = s.col; const lw = g.measureText(s.l).width; g.fillText(s.l, x + w / 2 - (s.s ? 4 : 0), r.y1 + 5);
      if (s.s) { g.font = 'italic 600 8px ' + Renderer.SERIF; g.textAlign = 'left'; g.fillText(s.s, x + w / 2 - 4 + lw / 2, r.y1 + 10); } });
    g.font = '600 10px ' + Renderer.SANS; g.fillStyle = C.text; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('now (J)', (r.x0 + r.x1) / 2, r.y0 - 4); }
  note(text) { const g = this.g; g.font = '500 12px ' + Renderer.SANS; g.fillStyle = Graphs.C.text; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, this.W / 2, this.H / 2); }
}
