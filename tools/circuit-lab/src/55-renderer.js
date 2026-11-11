// =====================================================================
// Renderer -- draws one frame of the scene the controller describes:
//   { circuit, view, sol, dpr, names, selId, hide, revealed(id), flowing,
//     probe, probeV, hover, wire:{pts, ok}, ghost, flash:{segs, alpha}, message:{text, bad, alpha},
//     turn:{id, pivot, angle, settled} }   (a part part-way through a quarter turn: see `spun`)
// It owns the purely visual state (how far the current dots have drifted,
// where the labels were put) and nothing else.
// =====================================================================
class Renderer {
  constructor() { this.phase = new Map(); this.labels = new Map(); }

  // move the current dots on by dt seconds
  advance(dt, circuit, sol) { if (!sol) return; const seen = new Set();
    for (const el of circuit.elements) { const I = sol.flow(el); seen.add(el.id); if (Math.abs(I) < Fmt.ZERO_A) continue; this.phase.set(el.id, (this.phase.get(el.id) || 0) + Math.sign(I) * Painter.speed(I) * dt); }
    for (const id of [...this.phase.keys()]) if (!seen.has(id)) this.phase.delete(id); }

  // the world-pixel box to bring into view: every symbol and every label, laid
  // out as they will be drawn when labels are `ls` times their normal size
  static fitBox(circuit, ls) { const b = circuit.bounds(); if (!b) return null; const p = View.xy({ c: b.c0, r: b.r0 }), q = View.xy({ c: b.c1, r: b.r1 }), box = { x0: p.x - 22, y0: p.y - 22, x1: q.x + 22, y1: q.y + 22 };
    for (const o of Renderer.boxes(circuit, ls)) { box.x0 = Math.min(box.x0, o.x0); box.y0 = Math.min(box.y0, o.y0); box.x1 = Math.max(box.x1, o.x1); box.y1 = Math.max(box.y1, o.y1); }
    return box; }
  // everything that will be drawn, as world-pixel boxes with a little air round each
  static boxes(circuit, ls) { const out = [], add = (o, m) => out.push({ x0: o.x0 - m, y0: o.y0 - m, x1: o.x1 + m, y1: o.y1 + m });
    for (const e of circuit.elements) add(PAINTERS[e.type].box(e), 6);
    for (const L of Renderer.layout(null, { circuit, names: circuit.labels(), sol: null, hide: true, revealed: () => false, view: { labelScale: ls || 1 } }).values()) add(L, 8);
    return out; }

  // Label text is monospace, so when there is no canvas to measure with (choosing a zoom) its width is a character count.
  static textWidth(g, t, px, bold) { if (!g) return t.length * px * 0.6; g.font = mono(px, bold); return g.measureText(t).width; }

  // ---- labels: beside each part, clear of every other part, wire and label ----
  static layout(g, sc) { const out = new Map(), ls = sc.view.labelScale, obstacles = [], hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    for (const e of sc.circuit.elements) obstacles.push({ id: e.id, part: !e.isWire, ...PAINTERS[e.type].box(e) });
    for (const el of sc.circuit.parts) { const pt = PAINTERS[el.type], nm = sc.names.get(el.id), spec = pt.label(el, nm ? nm.text : '', { sol: sc.sol, hide: sc.hide && !sc.revealed(el.id) }); if (!spec) continue;
      let w = 0; for (const ln of spec.lines) w = Math.max(w, Renderer.textWidth(g, ln.t, ln.px * ls, ln.bold));
      // `room`: the label keeps space for this many characters on its last line, so it holds still while a reading changes
      if (spec.room) { const ln = spec.lines[spec.lines.length - 1]; w = Math.max(w, Renderer.textWidth(g, '0'.repeat(spec.room), ln.px * ls, ln.bold)); }
      const lh = 12 * ls, padX = spec.boxed ? 7 * ls : 0, padY = spec.boxed ? 2.5 * ls : 0; w += 2 * padX; const h = spec.lines.length * lh + 2 * padY;
      const c = View.xy(el.center()), hz = el.horizontal(), sides = hz ? (spec.below ? [[0, 1], [0, -1]] : [[0, -1], [0, 1]]) : [[1, 0], [-1, 0]]; let pick = null, least = Infinity;
      // Candidates, nearest first: beside the middle of the part on either side, then slid along
      // the part toward either end, then the same a step farther out. The first one clear of
      // everything wins; if none is, the one that covers the least. A label is never put on the
      // far side of another part, where it would read as that part's.
      const own = pt.box(el), slide = Math.max(0, ((hz ? own.x1 - own.x0 - w : own.y1 - own.y0 - h)) / 2), slides = slide > 6 ? [0, -slide, slide] : [0];
      search: for (let k = 0; k < 4; k++) for (const s of slides) for (const [nx, ny] of sides) { const d = pt.extent(el) + 5 + 12 * k * ls, cx = c.x + nx * (d + w / 2) + (hz ? s : 0), cy = c.y + ny * (d + h / 2) + (hz ? 0 : s);
        const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, nx, ny }; let over = 0;
        // (`lane`: the strip between the part and the near edge of its label)
        const lane = hz ? { x0: box.x0, x1: box.x1, y0: ny < 0 ? box.y1 : c.y, y1: ny < 0 ? c.y : box.y0 } : { x0: nx < 0 ? box.x1 : c.x, x1: nx < 0 ? c.x : box.x0, y0: box.y0, y1: box.y1 };
        for (const o of obstacles) if (o.part && o.id !== el.id && hit(o, lane)) over += 1e6;
        for (const o of obstacles) if (o.id !== el.id && hit(o, box)) over += (Math.min(o.x1, box.x1) - Math.max(o.x0, box.x0)) * (Math.min(o.y1, box.y1) - Math.max(o.y0, box.y0));
        if (over < least) { least = over; pick = box; } if (!over) break search; }
      out.set(el.id, { ...pick, spec, lh, ls, padX, padY }); obstacles.push({ id: 'label' + el.id, ...pick }); }
    return out; }
  drawLabel(g, L) { const { spec, lh, ls } = L;
    if (spec.boxed) { g.fillStyle = 'rgba(15,23,34,0.9)'; g.strokeStyle = spec.boxed; g.lineWidth = 1; Renderer.roundRect(g, L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0, 4 * ls); g.fill(); g.stroke(); }
    const align = (spec.boxed || L.ny) ? 'center' : (L.nx > 0 ? 'left' : 'right'), x = align === 'center' ? (L.x0 + L.x1) / 2 : (L.nx > 0 ? L.x0 : L.x1);
    spec.lines.forEach((ln, i) => Draw.text(g, ln.t, { x, y: L.y0 + L.padY + lh * (i + 0.5) + 0.5 }, mono(ln.px * ls, ln.bold), ln.color, align)); }
  static roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  draw(g, sc) { const { circuit, view, dpr } = sc, W = view.w, H = view.h;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75); bg.addColorStop(0, '#141f2c'); bg.addColorStop(1, '#0a1119'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy); g.lineCap = 'round'; g.lineJoin = 'round';
    this.labels = Renderer.layout(g, sc);
    this.grid(g, sc);
    const state = (el) => { const L = this.labels.get(el.id), hz = el.horizontal(); return { sel: el.id === sc.selId, nx: L ? L.nx : (hz ? 0 : 1), ny: L ? L.ny : (hz ? -1 : 0), sol: sc.sol, hide: sc.hide }; };
    const sel = circuit.byId(sc.selId), turn = sc.turn;
    // A part that is being turned is drawn where it has got to: its finished picture, swung back
    // about the pivot by the angle it still has to go. Its wires are already where they will end up.
    const spun = (el, paint) => { if (!turn || turn.id !== el.id) return paint(); const p = View.xy(turn.pivot);
      g.save(); g.translate(p.x, p.y); g.rotate(turn.angle); g.translate(-p.x, -p.y); paint(); g.restore(); };
    for (const el of circuit.wires) if (el !== sel) PAINTERS.wire.paint(g, el, state(el));
    for (const el of circuit.parts) if (el !== sel) spun(el, () => PAINTERS[el.type].paint(g, el, state(el)));
    if (sel) spun(sel, () => PAINTERS[sel.type].paint(g, sel, state(sel)));
    this.nodes(g, sc);
    if (sc.flowing && sc.sol) for (const el of circuit.elements) { if (turn && turn.id === el.id) continue; const I = sc.sol.flow(el); if (Math.abs(I) >= Fmt.ZERO_A) PAINTERS[el.type].current(g, el, I, this.phase.get(el.id) || 0); }
    for (const [id, L] of this.labels) { if (turn && turn.id === id) { g.save(); g.globalAlpha = turn.settled; this.drawLabel(g, L); g.restore(); } else this.drawLabel(g, L); }
    if (sel) spun(sel, () => this.selection(g, sc, sel, state(sel)));
    this.previews(g, sc);
    if (sc.probe) this.probe(g, sc);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sc.message && sc.message.alpha > 0) this.message(g, sc.message, sc);
  }

  // the grid dots, leaving out any that would sit behind a label's text
  grid(g, sc) { const v = sc.view.visibleGrid(), c0 = Math.max(0, v.c0), c1 = Math.min(sc.circuit.NC, v.c1), r0 = Math.max(0, v.r0), r1 = Math.min(sc.circuit.NR, v.r1), r = Math.min(3, 2 * Math.max(1, sc.view.labelScale * 0.8));
    const boxes = [...this.labels.values()], m = r + 1.5, behind = (p) => boxes.some((L) => p.x > L.x0 - m && p.x < L.x1 + m && p.y > L.y0 - m && p.y < L.y1 + m);
    g.fillStyle = 'rgba(150,170,190,0.28)'; g.beginPath(); for (let c = c0; c <= c1; c++) for (let rr = r0; rr <= r1; rr++) { const p = View.xy({ c, r: rr }); if (behind(p)) continue; g.moveTo(p.x + r, p.y); g.arc(p.x, p.y, r, 0, Math.PI * 2); } g.fill(); }

  // junction dots, loose wire ends, and terminals nothing is connected to
  nodes(g, sc) { const c = sc.circuit, E = c.wireEdges(), adj = Circuit.adjacency(E), terms = c.terminalMap(null);
    g.fillStyle = INK.lead; for (const p of c.junctions()) Draw.dot(g, View.xy(p), 3.8);
    g.lineWidth = 1.6; for (const [k, nb] of adj) if (nb.length === 1 && !terms.has(k)) { g.strokeStyle = INK.lead; g.fillStyle = INK.dark; const p = View.xy(P.parse(k)); Draw.dot(g, p, 3.4); Draw.ring(g, p, 3.4); }
    for (const [k, list] of terms) if (list.length === 1 && !adj.has(k)) { g.strokeStyle = list[0].el.id === sc.selId ? INK.sel : 'rgba(224,184,90,0.9)'; g.fillStyle = INK.dark; const p = View.xy(P.parse(k)); Draw.dot(g, p, 3.4); Draw.ring(g, p, 3.4); } }

  selection(g, sc, el, st) { g.fillStyle = INK.sel; g.strokeStyle = INK.dark; g.lineWidth = 1.5;
    for (const t of el.terminals()) { const p = View.xy(t.p); Draw.dot(g, p, 5.5); Draw.ring(g, p, 5.5); }
    // which end is at the higher potential
    // (not for a symbol that already carries its own + and -)
    if (sc.hide || !sc.sol || el.isWire || !el.info.showMeas || el.info.isThrow || PAINTERS[el.type].signed) return;
    const dV = sc.sol.drop(el.a, el.b); if (!isFinite(dV) || Math.abs(dV) < 1e-6) return; const f = new Frame(el.a, el.b), k = dV > 0 ? -1 : 1, s = f.L / 2 - 9;
    Draw.text(g, '+', f.off(k * s, 11, -st.nx, -st.ny), mono(12, true), INK.mark); Draw.text(g, '−', f.off(-k * s, 11, -st.nx, -st.ny), mono(12, true), INK.mark); }

  previews(g, sc) { const path = (pts, color, dash, lw) => { g.save(); g.strokeStyle = color; g.lineWidth = lw; g.setLineDash(dash); Draw.poly(g, pts.map(View.xy)); g.restore(); g.fillStyle = color; };
    if (sc.hover) { g.strokeStyle = 'rgba(224,184,90,0.85)'; g.lineWidth = 1.6; Draw.ring(g, View.xy(sc.hover), 6.5); }
    if (sc.wire && sc.wire.pts.length > 1) { const ok = sc.wire.ok; path(sc.wire.pts, ok ? 'rgba(224,184,90,0.75)' : INK.bad, ok ? [5, 5] : [4, 4], ok ? 2 : 4); Draw.dot(g, View.xy(sc.wire.pts[0]), 4.5); Draw.dot(g, View.xy(sc.wire.pts[sc.wire.pts.length - 1]), 6); }
    if (sc.ghost) for (const [p, q] of sc.ghost.segments()) { path([p, q], INK.bad, [4, 4], 4); Draw.dot(g, View.xy(p), 4); Draw.dot(g, View.xy(q), 4); }
    if (sc.flash && sc.flash.alpha > 0) { g.save(); g.globalAlpha = sc.flash.alpha; for (const [p, q] of sc.flash.segs) { path([p, q], INK.bad, [], 5); Draw.dot(g, View.xy(p), 6); Draw.dot(g, View.xy(q), 6); } g.restore(); } }

  probe(g, sc) { const ls = sc.view.labelScale, p = View.xy(sc.probe), v = sc.probeV; g.fillStyle = INK.gold; g.strokeStyle = INK.dark; g.lineWidth = 1.5; Draw.dot(g, p, 5); Draw.ring(g, p, 5);
    const txt = sc.hide ? 'V = ?' : (isFinite(v) ? Fmt.V(v) : (sc.circuit.ofType(Ground).length ? 'not connected to ground' : 'add a ground to read V here')); g.font = mono(11 * ls, true); const w = g.measureText(txt).width + 14 * ls, h = 18 * ls;
    // the flag goes above the point if it fits there without covering a part or a label; else below, right, left -- and always inside the canvas
    const lo = sc.view.toWorld(0, 0), hi = sc.view.toWorld(sc.view.w, sc.view.h), m = 4 / sc.view.scale, busy = sc.circuit.parts.map((e) => PAINTERS[e.type].box(e)).concat([...this.labels.values()]);
    const spots = [[p.x - w / 2, p.y - 11 - h], [p.x - w / 2, p.y + 11], [p.x + 11, p.y - h / 2], [p.x - 11 - w, p.y - h / 2]];
    const inside = ([x, y]) => x >= lo.x + m && x + w <= hi.x - m && y >= lo.y + m && y + h <= hi.y - m, clear = ([x, y]) => !busy.some((o) => o.x0 < x + w && o.x1 > x && o.y0 < y + h && o.y1 > y);
    let [x, y] = spots.find((s) => inside(s) && clear(s)) || spots.find(inside) || spots[0];
    x = Math.max(lo.x + m, Math.min(hi.x - m - w, x)); y = Math.max(lo.y + m, Math.min(hi.y - m - h, y));
    g.fillStyle = 'rgba(15,23,34,0.94)'; g.strokeStyle = 'rgba(224,184,90,0.7)'; g.lineWidth = 1; Renderer.roundRect(g, x, y, w, h, 4 * ls); g.fill(); g.stroke();
    Draw.text(g, txt, { x: x + w / 2, y: y + h / 2 + 0.5 }, mono(11 * ls, true), INK.gold); }

  static wrap(g, text, max) { const out = []; let line = ''; for (const word of text.split(' ')) { const t = line ? line + ' ' + word : word; if (line && g.measureText(t).width > max) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
  // a notice, in canvas px: along the top edge unless the circuit is in the way there and the bottom (above the zoom buttons) is free
  message(g, m, sc) { const W = sc.view.w, H = sc.view.h; g.save(); g.globalAlpha = Math.min(1, m.alpha); g.font = "600 12.5px 'Source Sans 3', system-ui, sans-serif";
    const lines = Renderer.wrap(g, m.text, Math.max(120, Math.min(W - 60, 440))), w = Math.max(...lines.map((s) => g.measureText(s).width)) + 28, h = 10 + 16 * lines.length, x = (W - w) / 2;
    const boxes = sc.circuit.elements.map((e) => { const o = PAINTERS[e.type].box(e), p = sc.view.toCanvas(o.x0, o.y0), q = sc.view.toCanvas(o.x1, o.y1); return { x0: p.x, y0: p.y, x1: q.x, y1: q.y }; });
    const busy = (y) => boxes.some((o) => o.x0 < x + w && o.x1 > x && o.y0 < y + h && o.y1 > y), top = 10, bottom = H - h - 44, y = !busy(top) || busy(bottom) ? top : bottom;
    g.fillStyle = 'rgba(12,19,29,0.94)'; g.strokeStyle = m.bad ? 'rgba(224,110,110,0.8)' : 'rgba(95,208,224,0.6)'; g.lineWidth = 1; Renderer.roundRect(g, x, y, w, h, Math.min(13, h / 2)); g.fill(); g.stroke();
    g.fillStyle = m.bad ? '#f0b0b0' : '#cfe9ee'; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach((s, i) => g.fillText(s, W / 2, y + 5 + 16 * (i + 0.5) + 0.5)); g.restore(); }
}

// =====================================================================
// GraphPainter -- the traces against time: volts on the left axis, current
// on the right, the last 8 s. Times are shown relative to `origin` (the last
// time a switch was thrown), which is marked with a dashed line. It draws at
// whatever size it is given -- the strip under the circuit or the enlarged
// view -- and lays itself out to suit; with the pointer over it, it reads the
// traces off at that instant.
// =====================================================================
class GraphPainter {
  static SPAN = 8;
  // round tick values covering lo..hi
  static ticks(lo, hi, n) { if (!(hi > lo)) hi = lo + 1; const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
    const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, list = []; for (let i = 0; a + i * step <= b + step * 1e-6; i++) list.push(+(a + i * step).toPrecision(12));
    return { lo: a, hi: b, step, list }; }
  static tickText(v, step) { const d = Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9))); return v.toFixed(d).replace('-', '−'); }
  // the last sample taken at or before time t (samples are in time order)
  static at(samples, t) { let lo = 0, hi = samples.length - 1, hit = null; while (lo <= hi) { const mid = (lo + hi) >> 1; if (samples[mid][0] <= t) { hit = samples[mid]; lo = mid + 1; } else hi = mid - 1; } return hit; }
  // the unit a current axis reads in: the one the meters use for currents of that size
  static ampUnit(peak) { return peak >= 0.9995 ? { k: 1, unit: 'A' } : (peak > 0 && peak < 0.9995e-3 ? { k: 1e6, unit: 'µA' } : { k: 1000, unit: 'mA' }); }

  // o = { dpr, w, h, top, t, origin, hover, traces: [{ kind: 'volt' | 'amm', name, samples, shown, part }] }
  //   (part: the trace is a part's own, from the Scope, not a meter's)
  //   top: canvas px kept clear along the top edge (the enlarged view's buttons sit there)
  //   hover: the pointer's x in canvas px, or null
  //   empty: what to say when there is nothing to plot
  // text size for a graph h px tall, and the width of the strip an axis's numbers need beside the plot:
  // the page puts the enlarge button against the plot's corner with these, clear of the right-hand numbers
  static fs(h) { return Math.max(9, Math.min(11, 7 + h / 75)); }
  static gutter(h, numbered) { return numbered ? Math.round(GraphPainter.fs(h) * 4.8) : 14; }
  //   clear: px at the right-hand end of the top row kept free of the key (a button sits there)
  draw(g, o) { const W = o.w, H = o.h, SPAN = GraphPainter.SPAN, fs = GraphPainter.fs(H), sans = "'Source Sans 3', system-ui, sans-serif";
    g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0); g.clearRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75); bg.addColorStop(0, '#152130'); bg.addColorStop(1, '#0b121b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const kinds = [{ kind: 'volt', k: 1, ink: INK.volt, unit: 'V', left: true }, { kind: 'amm', k: 1000, ink: INK.amp, unit: 'mA', left: false }].map((K) => ({ ...K, all: o.traces.filter((m) => m.kind === K.kind) })).filter((K) => K.all.length);
    const hasL = kinds.some((K) => K.left), hasR = kinds.some((K) => !K.left), top = o.top || 0, x0 = hasL ? Math.round(fs * 4.2) : 14, x1 = W - GraphPainter.gutter(H, hasR), y0 = top + Math.round(fs * 2.5), y1 = H - Math.round(fs * 2.9), row = top + fs * 1.05;
    const tick = mono(fs - 1), dim = 'rgba(185,198,212,0.7)', note = (s) => Draw.text(g, s, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, (fs + 1.5) + 'px ' + sans, 'rgba(180,195,210,0.6)');
    g.strokeStyle = 'rgba(150,170,190,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); g.lineTo(x1, y0); g.stroke();
    if (!kinds.length) { note(o.empty || 'Turn on graph for a meter, then run.'); return; }
    // ---- time axis: a mark every second when there is room, else every two
    const a1 = Math.max(SPAN, o.t), a0 = a1 - SPAN, X = (t) => x0 + (t - a0) / SPAN * (x1 - x0), every = (x1 - x0) / SPAN >= 46 ? 1 : 2;
    for (let d = Math.ceil((a0 - o.origin) / every - 1e-9) * every; d + o.origin <= a1 + 1e-9; d += every) { const x = X(d + o.origin); g.strokeStyle = 'rgba(150,170,190,0.1)'; Draw.line(g, { x, y: y0 }, { x, y: y1 }); Draw.text(g, String(d).replace('-', '−'), { x, y: y1 + fs * 0.95 }, tick, dim); }
    if (o.origin > a0 + 1e-6) { g.save(); g.setLineDash([3, 3]); g.strokeStyle = 'rgba(224,184,90,0.55)'; Draw.line(g, { x: X(o.origin), y: y0 }, { x: X(o.origin), y: y1 }); g.restore(); }
    Draw.text(g, 't (s)', { x: (x0 + x1) / 2, y: H - fs * 0.75 }, tick, dim);
    // ---- one value axis for each kind of trace
    const axes = [], rows = Math.max(3, Math.min(8, Math.round((y1 - y0) / 27)));
    for (const K0 of kinds) { const shown = K0.all.filter((m) => m.shown); let lo = 0, hi = 0;
      for (const m of shown) for (const s of m.samples) if (s[0] >= a0) { lo = Math.min(lo, s[1]); hi = Math.max(hi, s[1]); }
      const K = K0.left ? K0 : { ...K0, ...GraphPainter.ampUnit(Math.max(-lo, hi)) }; lo *= K.k; hi *= K.k;
      // numerical dust is not a signal: a flat trace gets a plain 0–1 V / 0–10 mA axis
      if (Math.abs(lo) < 1e-4) lo = 0; if (Math.abs(hi) < 1e-4) hi = 0;
      const pad = (hi - lo) * 0.08; if (hi - lo < (K.left ? 0.01 : 0.1)) { if (hi > 0 || lo === 0) hi = lo + (K.left ? 1 : 10); else lo = hi - (K.left ? 1 : 10); }
      const T = GraphPainter.ticks(lo < 0 ? lo - pad : lo, hi > 0 ? hi + pad : hi, rows); axes.push({ K, T, shown, Y: (v) => y1 - (v * K.k - T.lo) / (T.hi - T.lo) * (y1 - y0) }); }
    axes.forEach((A, n) => { const { K, T, Y } = A, side = K.left ? 'right' : 'left', x = K.left ? x0 - 5 : x1 + 5;
      Draw.text(g, K.unit, { x, y: row }, mono(fs - 1, true), K.ink, side); if (!A.shown.length) return;
      for (const v of T.list) { const y = Y(v / K.k); if (A === axes.find((B) => B.shown.length)) { g.strokeStyle = v === 0 ? 'rgba(150,170,190,0.28)' : 'rgba(150,170,190,0.1)'; Draw.line(g, { x: x0, y }, { x: x1, y }); }
        Draw.text(g, GraphPainter.tickText(v, T.step), { x, y }, tick, K.ink, side); } });
    // ---- the traces (a second or third of the same kind is dashed), then what the pointer is reading
    const dashes = [[], [6, 3], [2, 3]], lw = H > 220 ? 2 : 1.6, list = [];
    for (const A of axes) { g.save(); g.beginPath(); g.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); g.clip(); g.strokeStyle = A.K.ink; g.lineWidth = lw; g.lineJoin = 'round';
      A.shown.forEach((m, i) => { const dash = dashes[i % 3]; list.push({ m, A, dash }); g.setLineDash(dash); g.beginPath(); let on = false;
        for (const s of m.samples) { if (s[0] < a0) continue; const x = X(s[0]), y = A.Y(s[1]); if (on) g.lineTo(x, y); else { g.moveTo(x, y); on = true; } } g.stroke(); });
      g.restore(); }
    if (o.traces.every((m) => !m.shown)) { note(o.traces.some((m) => !m.part) ? 'Hidden — “check” a meter to see its trace.' : 'Hidden while the solution is hidden.'); return; }
    const hx = o.hover, reading = hx != null && hx >= x0 && hx <= x1 && a0 + (hx - x0) / (x1 - x0) * SPAN <= o.t + 1e-9, th = reading ? a0 + (hx - x0) / (x1 - x0) * SPAN : 0;
    if (reading) { g.strokeStyle = 'rgba(235,240,246,0.45)'; g.lineWidth = 1; Draw.line(g, { x: hx, y: y0 }, { x: hx, y: y1 }); }
    // the key along the top: which line is which -- and, under the pointer, what each reads there
    const items = []; if (reading) items.push({ text: 't = ' + (th - o.origin).toFixed(2).replace('-', '−') + ' s', ink: dim });
    for (const { m, A, dash } of list) { const s = reading ? GraphPainter.at(m.samples, th) : null; if (reading && (!s || s[0] < a0 - 0.05)) { items.push({ text: m.name, ink: A.K.ink, dash }); continue; }
      if (s) { const y = A.Y(s[1]); g.fillStyle = A.K.ink; g.strokeStyle = INK.dark; g.lineWidth = 1.5; Draw.dot(g, { x: hx, y }, 3.6); Draw.ring(g, { x: hx, y }, 3.6); }
      items.push({ text: m.name + (s ? ' ' + (A.K.left ? Fmt.V(s[1]) : Fmt.signedA(s[1])) : ''), ink: A.K.ink, dash }); }
    const font = mono(fs, true); g.font = font; const gap = fs * 1.6, mark = fs * 1.8, width = (it) => (it.dash ? mark + 4 : 0) + g.measureText(it.text).width;
    let total = items.reduce((n, it) => n + width(it), 0) + gap * (items.length - 1); if (total > x1 - x0 - 8 - 2 * (o.clear || 0)) return;      // no room for a key: the colours and the axes still say which is which
    let x = (x0 + x1) / 2 - total / 2; for (const it of items) { if (it.dash) { g.save(); g.strokeStyle = it.ink; g.lineWidth = lw; g.setLineDash(it.dash); Draw.line(g, { x, y: row }, { x: x + mark, y: row }); g.restore(); x += mark + 4; }
      g.font = font; const w = g.measureText(it.text).width; Draw.text(g, it.text, { x, y: row }, font, it.ink, 'left'); x += w + gap; }
  }
}
