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

  static PAST = 9;                      // (world px: a wire's air, and a little)
  static TURN = 22;                     // (world px: from a part's end to the near side of the widest symbol turning off there, and a little)
  // ---- labels: beside each part, clear of every other part, wire and label ----
  static layout(g, sc) { const out = new Map(), ls = sc.view.labelScale, obstacles = [], hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    for (const e of sc.circuit.elements) obstacles.push({ id: e.id, part: !e.isWire, ...PAINTERS[e.type].box(e) });
    // (the line of each wire itself, without the air its box keeps round it)
    const inks = sc.circuit.elements.filter((e) => e.isWire).map((e) => { const a = View.xy(e.a), b = View.xy(e.b); return { x0: Math.min(a.x, b.x) - 1, x1: Math.max(a.x, b.x) + 1, y0: Math.min(a.y, b.y) - 1, y1: Math.max(a.y, b.y) + 1 }; });
    const todo = [];
    for (const el of sc.circuit.parts) { const pt = PAINTERS[el.type], nm = sc.names.get(el.id), spec = pt.label(el, nm ? nm.text : '', { sol: sc.sol, hide: sc.hide && !sc.revealed(el.id) }); if (!spec) continue;
      let w = 0; for (const ln of spec.lines) w = Math.max(w, Renderer.textWidth(g, ln.t, ln.px * ls, ln.bold));
      // `room`: the label keeps space for this many characters on its last line, so it holds still while a reading changes
      if (spec.room) { const ln = spec.lines[spec.lines.length - 1]; w = Math.max(w, Renderer.textWidth(g, '0'.repeat(spec.room), ln.px * ls, ln.bold)); }
      const lh = 12 * ls, padX = spec.boxed ? 7 * ls : 0, padY = spec.boxed ? 2.5 * ls : 0; w += 2 * padX; todo.push({ el, pt, spec, w, h: spec.lines.length * lh + 2 * padY, lh, padX, padY }); }
    // Candidates, nearest first: beside the middle of the part on either side, then slid along
    // the part toward either end, then the same a step farther out. The first one clear of
    // everything wins; if none is, the one that covers the least. A label is never put on the
    // far side of another part, where it would read as that part's; and it goes on the far side
    // of a wire only when the near side would have it touching one (in a wire's air is fine).
    // (`others`: the labels already down)
    // A label as long as its part or longer (an enlarged reading) cannot slide within the part's length: it may go
    // off-centre instead, far enough for its end to clear a wire that turns off at the part's own end.
    // And any label may go farther off-centre still, far enough for its end to clear a PART that turns off at this
    // part's end (a meter in the next side of the loop): that is tried before moving the label a step out.
    const place = ({ el, pt, spec, w, h }, others, wide) => { const c = View.xy(el.center()), hz = el.horizontal(), sides = hz ? (spec.below ? [[0, 1], [0, -1]] : [[0, -1], [0, 1]]) : [[1, 0], [-1, 0]]; let pick = null, least = Infinity;
      const own = pt.box(el), ext = pt.extent(el), slide = (hz ? own.x1 - own.x0 - w : own.y1 - own.y0 - h) / 2, near = slide > 6 ? [0, -slide, slide] : [0, slide - Renderer.PAST, Renderer.PAST - slide], far = Renderer.TURN - slide, base = far > Math.abs(near[1]) + 1 ? [...near, -far, far] : near, reach = Math.max(far, Math.abs(near[1])), slides = wide ? [...base, -(reach + View.G), reach + View.G, -(reach + 2 * View.G), reach + 2 * View.G] : base, area = (o, box) => (Math.min(o.x1, box.x1) - Math.max(o.x0, box.x0)) * (Math.min(o.y1, box.y1) - Math.max(o.y0, box.y0));
      search: for (let k = 0; k < (wide ? 2 : 4); k++) for (const s of slides) for (const [nx, ny] of sides) { const d = ext + 5 + 12 * k * ls, cx = c.x + nx * (d + w / 2) + (hz ? s : 0), cy = c.y + ny * (d + h / 2) + (hz ? 0 : s);
        const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, nx, ny }; let over = 0;
        // (`lane`: the strip between the part's symbol and the near edge of its label. It starts at the symbol's own edge, not
        // its axis: a neighbour joined on at the part's end, or a wire carrying on in line with it, is not between the two.)
        const lane = hz ? { x0: box.x0, x1: box.x1, y0: ny < 0 ? box.y1 : c.y + ext, y1: ny < 0 ? c.y - ext : box.y0 } : { x0: nx < 0 ? box.x1 : c.x + ext, x1: nx < 0 ? c.x - ext : box.x0, y0: box.y0, y1: box.y1 };
        for (const o of obstacles) if (o.part && o.id !== el.id && hit(o, lane)) over += 1e6;
        if (inks.some((o) => hit(o, lane))) over += 4.5 * (hz ? w : h);
        for (const o of obstacles) if (o.id !== el.id && hit(o, box)) over += area(o, box);
        for (const o of others) if (hit(o, box)) over += area(o, box);
        if (over < least) { least = over; pick = box; } if (!over) break search; }
      return { box: pick, over: least }; };
    // (`wide`: when nowhere is clear, a label may go farther along its part still -- up to a square past its end, over
    // the lead or the wire there -- before it is left lying on something.)
    // Each label in turn takes the best place the labels before it have left. That can leave a late one (a meter's
    // reading, which has only two sides to choose from) lying on an early one that had somewhere else to go: so
    // while any label is on anything, each is placed again with all the others where they now are.
    // (two labels whose boxes meet by under a pixel are not on each other: the text inside does not reach the edge)
    // (but a boxed reading has an edge, and anything within three pixels of it reads as touching: it keeps that much air)
    const got = new Map(), rest = (t) => todo.filter((u) => u !== t && got.has(u.el.id)).map((u) => { const o = got.get(u.el.id).box, m = (t.spec.boxed || u.spec.boxed) ? 3 * ls : -1; return { x0: o.x0 - m, y0: o.y0 - m, x1: o.x1 + m, y1: o.y1 + m }; });
    // (a meter's reading stays beside its meter: it is the names that give way)
    const best = (t) => { const a = place(t, rest(t)); if (!a.over || t.spec.boxed) return a; const b = place(t, rest(t), true); return b.over < a.over ? b : a; };
    for (const t of todo) got.set(t.el.id, best(t));
    for (let pass = 0; pass < 3 && todo.some((t) => got.get(t.el.id).over > 0); pass++) { let moved = false;
      for (const t of todo) { const was = got.get(t.el.id).box, now = best(t); got.set(t.el.id, now); if (now.box.x0 !== was.x0 || now.box.y0 !== was.y0) moved = true; }
      if (!moved) break; }
    for (const { el, spec, lh, padX, padY } of todo) out.set(el.id, { ...got.get(el.id).box, spec, lh, ls, padX, padY });
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
    // (no moving current while the solution is hidden: its direction and speed would give the answer away)
    if (sc.flowing && sc.sol && !sc.hide) for (const el of circuit.elements) { if (turn && turn.id === el.id) continue; const I = sc.sol.flow(el); if (Math.abs(I) >= Fmt.ZERO_A) PAINTERS[el.type].current(g, el, I, this.phase.get(el.id) || 0); }
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
    if (sc.wire && sc.wire.pts.length > 1) { const ok = sc.wire.ok; path(sc.wire.pts, ok ? 'rgba(224,184,90,0.75)' : INK.bad, ok ? [5, 5] : [4, 4], ok ? 2 : 4); Draw.dot(g, View.xy(sc.wire.pts[0]), 4.5); Draw.dot(g, View.xy(sc.wire.pts[sc.wire.pts.length - 1]), 6);
      g.strokeStyle = INK.bad; g.lineWidth = 2; for (const p of sc.wire.at || []) Draw.ring(g, View.xy(p), 8); }   // where it would cross another wire
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
  // a notice, in canvas px: on one line in the middle of the top edge, unless a part, a wire or a label is in the
  // way there. Then the nearest clear place along the top edge, along the bottom edge (beside the zoom buttons),
  // or in between -- and then the same folded narrower (two lines; three or four for a long one, which will go in a
  // corner of a canvas the circuit fills). With no place clear of everything it may lie on a wire, and only if that
  // fails too does it lie on a part: where it hides the least. Chosen once for each notice, so it does not move
  // while the readings in the labels change.
  message(g, m, sc) { const W = sc.view.w, H = sc.view.h; g.save(); g.globalAlpha = Math.min(1, m.alpha); g.font = "600 12.5px 'Source Sans 3', system-ui, sans-serif";
    const key = [m.text, m.at, W, H].join('|'); let at = this.spot && this.spot.key === key ? this.spot : null;
    if (!at) { const px = (o) => { const p = sc.view.toCanvas(o.x0, o.y0), q = sc.view.toCanvas(o.x1, o.y1); return { x0: p.x, y0: p.y, x1: q.x, y1: q.y }; };
      const solid = [...sc.circuit.parts.map((e) => PAINTERS[e.type].box(e)), ...this.labels.values()].map(px).concat([{ x0: W - 140, y0: H - 46, x1: W, y1: H }]), wires = sc.circuit.wires.map((e) => PAINTERS[e.type].box(e)).map(px);
      const full = Math.max(120, Math.min(W - 60, 440)), shape = (max) => { const lines = Renderer.wrap(g, m.text, max); return { lines, w: Math.max(...lines.map((t) => g.measureText(t).width)) + 28, h: 10 + 16 * lines.length }; };
      const one = shape(full), shapes = one.w > 200 ? [one, shape(one.w * (one.lines.length === 1 ? 0.56 : 0.64))] : [one], spots = [];
      if (one.lines.length > 1 || one.w > 330) shapes.push(shape(Math.max(150, one.w * 0.42)));
      for (const S of shapes) { const mid = (W - S.w) / 2, xs = [mid], ys = [8, H - S.h - 8]; for (let d = 12; mid - d >= 8; d += 12) xs.push(mid - d, mid + d); for (let y = 16; y < H - S.h - 8; y += 8) ys.push(y);
        for (const y of ys) for (const x of xs) spots.push({ lines: S.lines, w: S.w, h: S.h, x, y }); }
      const on = (boxes, o) => boxes.some((b) => b.x0 < o.x + o.w && b.x1 > o.x && b.y0 < o.y + o.h && b.y1 > o.y);
      const hidden = (o) => solid.reduce((a, b) => a + Math.max(0, Math.min(b.x1, o.x + o.w) - Math.max(b.x0, o.x)) * Math.max(0, Math.min(b.y1, o.y + o.h) - Math.max(b.y0, o.y)), 0);
      at = spots.find((o) => !on(solid, o) && !on(wires, o)) || spots.find((o) => !on(solid, o));
      if (!at) { let least = Infinity; for (const o of spots) { const a = hidden(o); if (a < least) { least = a; at = o; } } }
      at.key = key; this.spot = at; }
    const { lines, w, h, x, y } = at;
    g.fillStyle = 'rgba(12,19,29,0.94)'; g.strokeStyle = m.bad ? 'rgba(224,110,110,0.8)' : 'rgba(95,208,224,0.6)'; g.lineWidth = 1; Renderer.roundRect(g, x, y, w, h, Math.min(13, h / 2)); g.fill(); g.stroke();
    g.fillStyle = m.bad ? '#f0b0b0' : '#cfe9ee'; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach((s, i) => g.fillText(s, x + w / 2, y + 5 + 16 * (i + 0.5) + 0.5)); g.restore(); }
}

// =====================================================================
// GraphPainter -- the traces against time: volts on the left axis, current
// on the right, sharing one zero line; the last 8 s to begin with (the span
// button shows less, or 16 s). Times are shown relative to `origin` (the last
// time a switch was thrown), which is marked with a dashed line. It draws at
// whatever size it is given -- the strip under the circuit or the enlarged
// view -- and lays itself out to suit; with the pointer over it, it reads the
// traces off at that instant.
// =====================================================================
class GraphPainter {
  static SPAN = 8;                                       // seconds across the plot to begin with ...
  static SPANS = [0.5, 1, 2, 4, 8, 16];                  // ... and what the span button steps through
  span = GraphPainter.SPAN;
  // the next span down, and round again from the shortest to the longest
  shorter() { const L = GraphPainter.SPANS, i = L.indexOf(this.span); this.span = L[(i + L.length - 1) % L.length]; return this.span; }
  // the smallest of the given round numbers (times a power of ten) that is at least x
  static round(x, list) { if (!(x > 0)) return 0; const mag = Math.pow(10, Math.floor(Math.log10(x))); for (const m of list) if (m * mag >= x * (1 - 1e-9)) return +(m * mag).toPrecision(12); return 10 * mag; }
  static STEPS = [1, 2, 5, 10];                           // what a mark may count in
  static ROOMS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];  // how far an axis may reach: finer, so a trace fills its plot
  // round marks inside lo..hi, no closer together than `least`
  static marks(lo, hi, least) { const step = GraphPainter.round(least, GraphPainter.STEPS), list = []; if (!(step > 0)) return { step: 1, list };
    for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++) list.push(+(i * step).toPrecision(12)); return { step, list }; }
  // The marks of a value axis: as above, but an axis left with fewer than three takes the next finer round step
  // (never closer than 0.6 of `least`), so a scale is never just "0" and one other number.
  static axisMarks(lo, hi, least) { const T = GraphPainter.marks(lo, hi, least); if (T.list.length >= 3) return T;
    const F = GraphPainter.marks(lo, hi, least * 0.6); return F.list.length > T.list.length ? F : T; }
  // Where zero sits (a fraction of the plot's height, from the bottom) when every axis shares one zero line.
  // ext: for each axis, how far its traces reach below zero (n) and above it (p). The best place is the one
  // that leaves the most squeezed axis the most room; two axes always get at least half the height each.
  static zero(ext) { const tries = []; for (let i = 0; i <= 50; i++) tries.push(i / 50); for (const e of ext) if (e.n + e.p > 0) tries.push(e.n / (e.n + e.p));
    let best = 0, top = -1;
    for (const z of tries) { let fill = 1, sum = 0, ok = true;
      for (const e of ext) { if ((e.n > 0 && z <= 0) || (e.p > 0 && z >= 1)) { ok = false; break; } const f = (e.n + e.p) / Math.max(z > 0 ? e.n / z : 0, z < 1 ? e.p / (1 - z) : 0); fill = Math.min(fill, f); sum += f; }
      if (ok && fill + sum * 1e-3 > top + 1e-9) { top = fill + sum * 1e-3; best = z; } }
    return best; }
  // One trace as a path. Where several samples share a column of pixels (a long span, a fast swing) only four
  // of them are drawn -- the first, the lowest, the highest and the last, in the order they came -- so the cost
  // follows the width, not the samples. Each is drawn where it really is: snapped to the column, a steep climb
  // goes up in steps and looks rough.
  static path(g, samples, a0, X, Y) { let lo = 0, hi = samples.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid][0] < a0) lo = mid + 1; else hi = mid; }
    let col = null, n = 0, fx = 0, fy = 0, ax = 0, ay = 0, ai = 0, bx = 0, by = 0, bi = 0, zx = 0, zy = 0, on = false;   // (plain numbers: this runs for every sample, every frame)
    const put = (x, y) => { if (on) g.lineTo(x, y); else { g.moveTo(x, y); on = true; } };
    const flush = () => { if (col === null) return; put(fx, fy); if (n < 2) return;
      if (by - ay > 0.5) { const low = ai < bi; if ((low ? ai : bi) > 0) put(low ? ax : bx, low ? ay : by); if ((low ? bi : ai) < n - 1) put(low ? bx : ax, low ? by : ay); } put(zx, zy); };
    for (let i = lo; i < samples.length; i++) { const x = X(samples[i][0]), y = Y(samples[i][1]), c = Math.round(x * 2);
      if (y !== y) { flush(); col = null; on = false; continue; }                  // a break (see Trace.put): the pen comes up
      if (c !== col) { flush(); col = c; n = 1; fx = ax = bx = zx = x; fy = ay = by = zy = y; ai = bi = 0; } else { if (y < ay) { ax = x; ay = y; ai = n; } if (y > by) { bx = x; by = y; bi = n; } zx = x; zy = y; n++; } }
    flush(); }
  static tickText(v, step) { const d = Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9))); return (Math.abs(v) < step * 1e-6 ? 0 : v).toFixed(d).replace('-', '−'); }
  // the last sample taken at or before time t (samples are in time order)
  static at(samples, t) { let lo = 0, hi = samples.length - 1, hit = null; while (lo <= hi) { const mid = (lo + hi) >> 1; if (samples[mid][0] <= t) { hit = samples[mid]; lo = mid + 1; } else hi = mid - 1; } return hit; }
  // the unit a current axis reads in: the one the meters use for currents of that size
  static ampUnit(peak) { return peak >= 0.9995 ? { k: 1, unit: 'A' } : (peak >= Fmt.ZERO_A && peak < 0.9995e-3 ? { k: 1e6, unit: 'µA' } : { k: 1000, unit: 'mA' }); }

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
  draw(g, o) { const W = o.w, H = o.h, SPAN = this.span, fs = GraphPainter.fs(H), sans = "'Source Sans 3', system-ui, sans-serif";
    g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0); g.clearRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75); bg.addColorStop(0, '#152130'); bg.addColorStop(1, '#0b121b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const kinds = [{ kind: 'volt', k: 1, ink: INK.volt, unit: 'V', left: true }, { kind: 'amm', k: 1000, ink: INK.amp, unit: 'mA', left: false }].map((K) => ({ ...K, all: o.traces.filter((m) => m.kind === K.kind) })).filter((K) => K.all.length);
    const hasL = kinds.some((K) => K.left), hasR = kinds.some((K) => !K.left), top = o.top || 0, x0 = hasL ? Math.round(fs * 4.2) : 14, x1 = W - GraphPainter.gutter(H, hasR), y0 = top + Math.round(fs * 2.5), y1 = H - Math.round(fs * 2.9), row = top + fs * 1.05;
    const tick = mono(fs - 1), dim = 'rgba(185,198,212,0.7)', note = (s) => Draw.text(g, s, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, (fs + 1.5) + 'px ' + sans, 'rgba(180,195,210,0.6)');
    g.strokeStyle = 'rgba(150,170,190,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); g.lineTo(x1, y0); g.stroke();
    if (!kinds.length) { note(o.empty || 'Turn on graph for a meter, then run.'); return; }
    // ---- time axis: round marks (every second on the 8 s span, when there is room), counted from the origin
    const a1 = Math.max(SPAN, o.t), a0 = a1 - SPAN, X = (t) => x0 + (t - a0) / SPAN * (x1 - x0), TM = GraphPainter.marks(a0 - o.origin, a1 - o.origin, SPAN * 46 / (x1 - x0));
    for (const d of TM.list) { const x = X(d + o.origin); g.strokeStyle = 'rgba(150,170,190,0.1)'; Draw.line(g, { x, y: y0 }, { x, y: y1 }); Draw.text(g, GraphPainter.tickText(d, TM.step), { x, y: y1 + fs * 0.95 }, tick, dim); }
    if (o.origin > a0 + 1e-6) { g.save(); g.setLineDash([3, 3]); g.strokeStyle = 'rgba(224,184,90,0.55)'; Draw.line(g, { x: X(o.origin), y: y0 }, { x: X(o.origin), y: y1 }); g.restore(); }
    Draw.text(g, 't (s)', { x: (x0 + x1) / 2, y: H - fs * 0.75 }, tick, dim);
    // ---- one value axis for each kind of trace. Both share one zero line, so "the current is zero here"
    // and "the voltage is zero here" are the same height; each then reaches as far as its own traces need
    // (to a round number, so the scale holds still while a trace grows and moves in steps when it must).
    const axes = [];
    for (const K0 of kinds) { const shown = K0.all.filter((m) => m.shown); let lo = 0, hi = 0;
      for (const m of shown) for (const s of m.samples) if (s[0] >= a0 && s[1] === s[1]) { lo = Math.min(lo, s[1]); hi = Math.max(hi, s[1]); }
      const K = K0.left ? K0 : { ...K0, ...GraphPainter.ampUnit(Math.max(-lo, hi)) }; lo *= K.k; hi *= K.k;
      // numerical dust is not a signal: a flat trace gets a plain 0–1 V / 0–10 mA axis
      if (Math.abs(lo) < 1e-4) lo = 0; if (Math.abs(hi) < 1e-4) hi = 0;
      const flat = hi - lo < (K.left ? 0.01 : 0.1); if (flat) { if (hi > 0 || lo === 0) hi = lo + (K.left ? 1 : 10); else lo = hi - (K.left ? 1 : 10); }
      // (a little head room over a real trace, so its peak is not drawn on the plot's edge; the flat default needs none)
      const room = (x) => GraphPainter.round(x * (flat ? 1 : 1.04), GraphPainter.ROOMS); axes.push({ K, shown, n: room(-lo), p: room(hi) }); }
    const live = axes.filter((A) => A.shown.length), z = GraphPainter.zero(live), yz = y1 - z * (y1 - y0), least = Math.max(19, fs * 2.1);
    for (const A of live) { const reach = Math.max(z > 0 ? A.n / z : 0, z < 1 ? A.p / (1 - z) : 0), px = (y1 - y0) / reach; A.Y = (v) => yz - v * A.K.k * px; A.T = GraphPainter.axisMarks(-z * reach, (1 - z) * reach, least / px); }
    axes.forEach((A) => { const { K, T, Y } = A, side = K.left ? 'right' : 'left', x = K.left ? x0 - 5 : x1 + 5, edge = K.left ? x0 : x1, first = A === live[0];
      Draw.text(g, K.unit, { x, y: row }, mono(fs - 1, true), K.ink, side); if (!A.shown.length) return;
      // the lines across belong to the first axis; the other's marks are short ticks on its own side
      for (const v of T.list) { const y = Y(v / K.k); if (first) { g.strokeStyle = 'rgba(150,170,190,0.1)'; Draw.line(g, { x: x0, y }, { x: x1, y }); } else { g.strokeStyle = 'rgba(150,170,190,0.45)'; Draw.line(g, { x: edge - 4, y }, { x: edge, y }); }
        Draw.text(g, GraphPainter.tickText(v, T.step), { x, y }, tick, K.ink, side); } });
    if (live.length && yz < y1 - 0.5) { g.strokeStyle = 'rgba(190,205,220,0.38)'; Draw.line(g, { x: x0, y: yz }, { x: x1, y: yz }); }
    // ---- the traces (a second or third of the same kind is dashed), then what the pointer is reading
    const dashes = [[], [6, 3], [2, 3]], lw = H > 220 ? 2 : 1.6, list = [];
    for (const A of axes) { g.save(); g.beginPath(); g.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); g.clip(); g.strokeStyle = A.K.ink; g.lineWidth = lw; g.lineJoin = 'round';
      A.shown.forEach((m, i) => { const dash = dashes[i % 3]; list.push({ m, A, dash }); g.setLineDash(dash); g.beginPath(); GraphPainter.path(g, m.samples, a0, X, A.Y); g.stroke(); });
      g.restore(); }
    if (o.traces.every((m) => !m.shown)) { note(o.traces.some((m) => !m.part) ? 'Hidden — “check” a meter to see its trace.' : 'Hidden while the solution is hidden.'); return; }
    // a meter joined to nothing records nothing (see Simulation.sample): an empty grid would not say why
    const blank = list.filter(({ m }) => !m.samples.length && !m.part); if (blank.length === list.length) { note((blank.length === 1 ? blank[0].m.name + ' is' : 'These meters are') + ' not connected — nothing to plot yet.'); return; }
    const hx = o.hover, reading = hx != null && hx >= x0 && hx <= x1 && a0 + (hx - x0) / (x1 - x0) * SPAN <= o.t + 1e-9, th = reading ? a0 + (hx - x0) / (x1 - x0) * SPAN : 0;
    if (reading) { g.strokeStyle = 'rgba(235,240,246,0.45)'; g.lineWidth = 1; Draw.line(g, { x: hx, y: y0 }, { x: hx, y: y1 }); }
    // the key along the top: which line is which -- and, under the pointer, what each reads there
    const items = []; if (reading) items.push({ text: 't = ' + (th - o.origin).toFixed(2).replace('-', '−') + ' s', ink: dim });
    for (const { m, A, dash } of list) { const s = reading ? GraphPainter.at(m.samples, th) : null; if (reading && (!s || s[0] < a0 - 0.05 || Trace.gap(s))) { items.push({ text: m.name, ink: A.K.ink, dash }); continue; }
      if (s) { const y = A.Y(s[1]); g.fillStyle = A.K.ink; g.strokeStyle = INK.dark; g.lineWidth = 1.5; Draw.dot(g, { x: hx, y }, 3.6); Draw.ring(g, { x: hx, y }, 3.6); }
      items.push({ text: m.name + (s ? ' ' + (A.K.left ? Fmt.V(s[1]) : Fmt.signedA(s[1])) : ''), ink: A.K.ink, dash }); }
    const font = mono(fs, true); g.font = font; const gap = fs * 1.6, mark = fs * 1.8, width = (it) => (it.dash ? mark + 4 : 0) + g.measureText(it.text).width;
    let total = items.reduce((n, it) => n + width(it), 0) + gap * (items.length - 1); if (total > x1 - x0 - 8 - 2 * (o.clear || 0)) return;      // no room for a key: the colours and the axes still say which is which
    let x = (x0 + x1) / 2 - total / 2; for (const it of items) { if (it.dash) { g.save(); g.strokeStyle = it.ink; g.lineWidth = lw; g.setLineDash(it.dash); Draw.line(g, { x, y: row }, { x: x + mark, y: row }); g.restore(); x += mark + 4; }
      g.font = font; const w = g.measureText(it.text).width; Draw.text(g, it.text, { x, y: row }, font, it.ink, 'left'); x += w + gap; }
  }
}
