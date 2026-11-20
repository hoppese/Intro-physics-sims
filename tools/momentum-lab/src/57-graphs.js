// =====================================================================
// Graphs -- the strip under the canvas: what the run's recording says, against time.
//   momentum  each body's p_x (or p_y), and the total, which stays flat
//   force     the force on each body from the others: mirror images, so the
//             impulses (the shaded areas) cancel. Each impulse equals that
//             body's change of momentum. "Close-up" zooms in on the last collision.
//   energy    each body's kinetic energy, energy stored (squashed bumpers, a
//             spring, gravity) and energy turned to heat
// The gold line is now.
// =====================================================================
class Graphs {
  static H = 200;
  static C = { bg: '#0f1722', panel: '#121c28', grid: 'rgba(255,255,255,0.05)', zero: 'rgba(255,255,255,0.28)', text: '#8fa1b3', ink: '#dfe7ef', cursor: '#f0c860', U: '#c99af0', th: '#ff9f6b', ex: '#f0a868' };
  static M = { l: 60, r: 14, t: 30, b: 22 };
  static step(span, n) { const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  static tunit(T) { return T < 120 ? { k: 1, u: 's' } : T < 7200 ? { k: 60, u: 'min' } : T < 3 * 86400 ? { k: 3600, u: 'h' } : { k: 86400, u: 'days' }; }
  // the last stretch of the recording in which the bodies push on each other (a collision, a spring), as [i0, i1]
  static pulse(R) { let i1 = -1; const on = (r) => r.b.some((b) => V.len(b.F) > 0); for (let i = R.length - 1; i >= 0; i--) if (on(R[i])) { i1 = i; break; } if (i1 < 0) return null;
    let i0 = i1; while (i0 > 0 && on(R[i0 - 1])) i0--; return [Math.max(0, i0 - 1), Math.min(R.length - 1, i1 + 1)]; }
  canClose(lab) { return lab.mode !== 'space' && !!Graphs.pulse(lab.world.rec); }

  draw(g, lab, W, H) { const C = Graphs.C, w = lab.world, R = w.rec; this.g = g; this.W = W; this.H = H; g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    if (R.length < 2) { this.note('Press ▶ Run: the graphs fill in as it goes.'); return; }
    if (lab.hidden && lab.graph !== 'off') { this.note('Values hidden: predict what happens first, then press Show values.'); return; }
    const tEnd = R[R.length - 1].t, M = Graphs.M; let t0 = 0, t1 = tEnd, close = lab.close && lab.graph !== 'energy' ? Graphs.pulse(R) : null;
    if (close && lab.mode !== 'space') { const a = R[close[0]].t, b = R[close[1]].t, d = Math.max(b - a, 1e-4); t0 = Math.max(0, a - 0.6 * d); t1 = Math.min(tEnd, b + 0.6 * d); } else close = null;
    const tu = Graphs.tunit(Math.max(t1, 1)); if (!close) t1 = Math.max(t1, 2 * tu.k);
    this.win = { t0, t1, tu, x0: M.l, x1: W - M.r }; const c = lab.axis, main = w.main, sub = lab.oneD ? '' : c, imp = lab.graph === 'force' && lab.mode !== 'space' && !w.hasRocket, rect = { x0: M.l, x1: W - M.r, y0: M.t, y1: H - M.b - (imp ? 16 : 0) };
    const series = [];
    if (lab.graph === 'momentum') { main.forEach((b, i) => series.push({ vals: R.map((r) => r.b[i].m * r.b[i].v[c]), col: G3.lite(b.col, 0.25), l: 'p', s: Renderer.tag(b) + (sub ? ',' + sub : ''), unit: 'kg·m/s' }));
      if (w.hasRocket) series.push({ vals: R.map((r) => r.Pex[c]), col: C.ex, l: 'p', s: 'exhaust', unit: 'kg·m/s' });
      series.push({ vals: R.map((r) => r.P[c]), col: '#f4ead2', dash: [6, 4], l: 'P', s: 'total' + (sub ? ',' + sub : ''), unit: 'kg·m/s', wide: true });
      this.plot(rect, R, series, { title: 'Momentum' + (sub ? ', ' + sub + ' parts' : '') }); return; }
    if (lab.graph === 'force') { main.forEach((b, i) => { series.push({ vals: R.map((r) => r.b[i].F[c]), col: G3.lite(b.col, 0.25), l: 'F', s: 'on ' + Renderer.tag(b) + (sub ? ',' + sub : ''), unit: 'N', fill: true });
        if (b.rk) { const u = V.polar(b.rk.ang)[c]; series.push({ vals: R.map((r) => r.b[i].th * u), col: Renderer.C.thrust, l: 'F', s: 'thrust' + (sub ? ',' + sub : ''), unit: 'N', fill: true }), series.push({ vals: R.map((r) => -r.b[i].th * u), col: C.ex, l: 'F', s: 'on exhaust', unit: 'N', fill: true }); } });
      this.plot(rect, R, series, { title: 'Force' + (sub ? ', ' + sub + ' parts' : '') + (close ? ' · close-up' : '') });
      if (imp) this.impulses(lab, R, close); return; }
    if (lab.graph === 'energy') { main.forEach((b, i) => series.push({ vals: R.map((r) => 0.5 * r.b[i].m * V.dot(r.b[i].v, r.b[i].v)), col: G3.lite(b.col, 0.25), l: 'K', s: Renderer.tag(b), unit: 'J' }));
      if (w.hasRocket) series.push({ vals: R.map((r) => r.Kex), col: C.ex, l: 'K', s: 'exhaust', unit: 'J' });
      if (R.some((r) => Math.abs(r.U) > 1e-12 * Math.max(1e-30, Math.abs(r.K)))) series.push({ vals: R.map((r) => r.U), col: C.U, l: 'U', s: lab.mode === 'space' ? 'g' : 'stored', unit: 'J' });
      if (R.some((r) => r.th > 1e-9 * Math.max(1e-30, R[0].K + Math.abs(R[0].U)))) series.push({ vals: R.map((r) => r.th), col: C.th, l: 'E', s: 'th', unit: 'J' });
      if (!w.hasRocket) series.push({ vals: R.map((r) => r.K + r.U + r.th), col: '#e8eef4', dash: [6, 4], l: 'E', s: 'total', unit: 'J', wide: true });
      else series.push({ vals: R.map((r) => r.K + r.Kex), col: '#e8eef4', dash: [6, 4], l: 'K', s: 'total', unit: 'J', wide: true });
      this.plot(rect, R, series, { title: 'Energy' }); } }

  // the impulse on each body (the area under its force curve) beside its change of momentum
  impulses(lab, R, close) { const g = this.g, c = lab.axis, i0 = close ? close[0] : 0, i1 = close ? close[1] : R.length - 1; let x = this.win.x0 + 6; const y = this.H - 3;
    lab.world.main.forEach((b, i) => { let J = R[i1].b[i].J[c] - R[i0].b[i].J[c];
      // (bodies that stick also take a jolt as they lock together: part of the impulse, though too quick to draw)
      const jolt = R[i1].b[i].jolt[c] - R[i0].b[i].jolt[c], big = Math.max(Math.abs(J), 1e-12); J += jolt;
      const dp = R[i1].b[i].m * R[i1].b[i].v[c] - R[i0].b[i].m * R[i0].b[i].v[c]; if (Math.abs(J) < 1e-12 && Math.abs(dp) < 1e-12) return;
      const txt = b.name + ': J = ' + Fmt.q(J, 'N·s', 5e-6) + (Math.abs(jolt) > 0.01 * big ? ' (with the lock-up jolt)' : '') + ',  Δp = ' + Fmt.q(dp, 'kg·m/s', 5e-6); g.font = '600 10.5px ' + Renderer.MONO; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = G3.lite(b.col, 0.35); g.fillText(txt, x, y); x += g.measureText(txt).width + 18; }); }

  tx(t) { const a = this.win; return a.x0 + (a.x1 - a.x0) * (t - a.t0) / Math.max(1e-12, a.t1 - a.t0); }
  plot(r, R, series, o) { const g = this.g, C = Graphs.C, a = this.win, inWin = (j) => R[j].t >= a.t0 - 1e-12 && R[j].t <= a.t1 + 1e-12; let lo = 0, hi = 0;
    for (const s of series) for (let j = 0; j < R.length; j++) { if (!inWin(j)) continue; const v = s.vals[j]; if (!isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-300) { lo = -1; hi = 1; } else { const pad = (hi - lo) * 0.1; if (lo < 0) lo -= pad; if (hi > 0) hi += pad; }
    // a power of ten taken out of the numbers on the axis when they are very big or small
    const big = Math.max(Math.abs(lo), Math.abs(hi)), ex = Math.floor(Math.log10(big)), pow = ex >= 4 || ex <= -3 ? ex : 0, sc = Math.pow(10, -pow);
    const ty = (v) => r.y1 - (v - lo) / (hi - lo) * (r.y1 - r.y0); g.fillStyle = C.panel; g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    const vs = Graphs.step((hi - lo) * sc, Math.max(2, Math.round((r.y1 - r.y0) / 24))) / sc; g.font = '500 10px ' + Renderer.MONO; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / vs) * vs; v <= hi + vs * 1e-6; v += vs) { const y = ty(v), zero = Math.abs(v) < vs * 1e-6; g.strokeStyle = zero ? C.zero : C.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(r.x0, y); g.lineTo(r.x1, y); g.stroke();
      const q = vs * sc; g.fillStyle = C.text; g.fillText(Fmt.num(zero ? 0 : v * sc, q < 0.01 ? 3 : q < 0.1 ? 2 : q < 1 ? 1 : 0), r.x0 - 5, y); }
    if (pow) { g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('× 10' + String(pow).split('').map((ch) => SUP[ch]).join(''), 4, r.y0 - 3); }
    const tu = a.tu, span = (a.t1 - a.t0) / tu.k, ts = Graphs.step(span, Math.max(2, Math.round((r.x1 - r.x0) / 80))); g.textAlign = 'center'; g.textBaseline = 'top';
    for (let t = Math.ceil(a.t0 / tu.k / ts) * ts; t <= a.t1 / tu.k + ts * 1e-6; t += ts) { const x = this.tx(t * tu.k); g.strokeStyle = C.grid; g.beginPath(); g.moveTo(x, r.y0); g.lineTo(x, r.y1); g.stroke(); if (x > r.x1 - 34) continue; g.fillStyle = C.text; g.fillText(Fmt.num(t, ts < 0.01 ? 3 : ts < 0.1 ? 2 : ts < 1 ? 1 : 0), x, r.y1 + 5); }
    g.textAlign = 'right'; g.fillText('t (' + tu.u + ')', r.x1, r.y1 + 5);
    g.save(); g.beginPath(); g.rect(r.x0, r.y0 - 1, r.x1 - r.x0, r.y1 - r.y0 + 2); g.clip(); g.lineJoin = 'round';
    const idx = []; for (let j = 0; j < R.length; j++) if (inWin(j) || (j + 1 < R.length && inWin(j + 1)) || (j > 0 && inWin(j - 1))) idx.push(j);
    const stride = Math.max(1, Math.floor(idx.length / Math.max(80, (r.x1 - r.x0) * 1.5)));
    series.forEach((s, k) => { const pts = []; const add = (j) => { const v = s.vals[j]; if (isFinite(v)) pts.push([this.tx(R[j].t), ty(v)]); }; for (let n = 0; n < idx.length; n += stride) add(idx[n]); if ((idx.length - 1) % stride) add(idx[idx.length - 1]);
      if (!pts.length) return;
      if (s.fill) { g.globalAlpha = 0.16; g.fillStyle = s.col; g.beginPath(); g.moveTo(pts[0][0], ty(0)); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(pts[pts.length - 1][0], ty(0)); g.closePath(); g.fill(); g.globalAlpha = 1; }
      g.strokeStyle = s.col; g.lineWidth = s.wide ? 2.4 : 1.4 + 1.6 * (series.length - 1 - k) / Math.max(1, series.length - 1); g.setLineDash(s.dash || []); g.beginPath(); pts.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); });
    g.setLineDash([]); g.restore();
    const last = R.length - 1, xc = this.tx(R[last].t); if (xc >= r.x0 - 1 && xc <= r.x1 + 1) { g.strokeStyle = G3.alpha(C.cursor, 0.7); g.lineWidth = 1.2; g.beginPath(); g.moveTo(xc, r.y0); g.lineTo(xc, r.y1); g.stroke();
      // now, on each curve: a dot with a dark ring
      for (const s of series) { const v = s.vals[last]; if (!isFinite(v)) continue; const y = ty(v); g.beginPath(); g.arc(xc, y, 3.6, 0, 2 * Math.PI); g.fillStyle = s.col; g.fill(); g.lineWidth = 1.6; g.strokeStyle = C.bg; g.stroke(); } }
    // the legend: each symbol and its value now
    let x = r.x0 + 4; const y = r.y0 - 13; g.font = '600 11px ' + Renderer.SANS; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = C.text; const tw = g.measureText(o.title).width; g.fillText(o.title, r.x1, y);
    for (const s of series) { const v0 = s.vals[last], v = Math.abs(v0) < 1e-9 * big ? 0 : v0, txt = ' = ' + Fmt.sig(isFinite(v) ? v : NaN) + ' ' + s.unit; g.textAlign = 'left'; g.font = 'italic 600 13px ' + Renderer.SERIF; const w1 = g.measureText(s.l).width; g.font = '600 9px ' + Renderer.SANS; const w2 = g.measureText(s.s).width; g.font = '600 10.5px ' + Renderer.MONO; const w3 = g.measureText(txt).width;
      if (x + w1 + w2 + w3 > r.x1 - tw - 12) break; g.font = 'italic 600 13px ' + Renderer.SERIF; g.fillStyle = s.col; g.fillText(s.l, x, y); x += w1 + 1; g.font = '600 9px ' + Renderer.SANS; g.fillText(s.s, x, y + 4); x += w2; g.font = '600 10.5px ' + Renderer.MONO; g.fillStyle = C.ink; g.fillText(txt, x, y); x += w3 + 12; } }
  note(text) { const g = this.g; g.font = '500 12px ' + Renderer.SANS; g.fillStyle = Graphs.C.text; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, this.W / 2, this.H / 2); }
}
