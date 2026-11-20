// =====================================================================
// Renderer -- paints the bench. Handed the workbench (set-up, world in
// motion, view) and the pointer tool, it draws, back to front: the grid,
// surfaces, ropes and springs, pulleys and anchors, the blocks where the
// world has them, the free-body arrows, and last of all the labels. No
// label is written over another, over the controls or over a block: each
// one has a few places it would like to go, and failing those it looks
// further out and draws a thin leader back to what it names. Everything is in canvas pixels; P()
// converts from the bench (metres, y up).
// =====================================================================
class Renderer {
  memory = new Map();                     // where each label went last frame
  static C = { bg: '#0f1722', off: '#0a1018', grid: 'rgba(255,255,255,0.045)', major: 'rgba(255,255,255,0.095)', axis: 'rgba(255,255,255,0.2)', tick: '#6c7f93',
    text: '#cdd8e3', dim: '#8496a8', gold: '#f0c860', halo: 'rgba(9,14,21,0.92)', surface: '#c9d3dd', hatch: 'rgba(201,211,221,0.35)', wedge: 'rgba(150,170,190,0.13)',
    rope: '#e8dcc0', spring: '#c9a0e8', pulley: '#9fb3c6' };
  // what each force is called (Knight's symbols) and its colour
  static FORCE = { weight: { l: 'w', s: '', col: '#ff7a7a' }, normal: { l: 'n', s: '', col: '#6cb8ff' }, static: { l: 'f', s: 's', col: '#ffc24d' }, kinetic: { l: 'f', s: 'k', col: '#ffc24d' },
    tension: { l: 'T', s: '', col: '#9be07a' }, spring: { l: 'F', s: 'sp', col: '#d99cf2' }, applied: { l: 'F', s: '', col: '#ff9f43' } };
  static MONO = "'JetBrains Mono', monospace"; static SERIF = "'Source Serif 4', serif"; static SANS = "'Source Sans 3', sans-serif";
  static LABEL = '600 13px ' + Renderer.MONO;
  // ---- math on the canvas, set as in print ----
  // A label can be a list of runs { t, f (font), vec (an arrow over it), dy (a subscript's drop) } instead of a string:
  // symbols in italic serif, vectors with an arrow drawn over the letter (not over its subscript), numbers in mono.
  static sym(letter, sub, o) { o = o || {}; const px = o.px || 14, out = [{ t: letter, f: 'italic 600 ' + px + 'px ' + Renderer.SERIF, vec: !!o.vec, px }];
    if (sub) out.push({ t: sub, f: 'italic 600 ' + Math.round(px * 0.7) + 'px ' + Renderer.SERIF, dy: px * 0.3 }); return out; }
  // a magnitude, the way it is written by hand: w = 19.6 N (no arrow, no bars)
  static magnitude(l, sub, value) { return [...Renderer.sym(l, sub), { t: ' = ' + value, f: '700 12px ' + Renderer.MONO }]; }

  draw(g, bench, tool) { const v = bench.view, sc = bench.scene, w = bench.world, C = Renderer.C; this.g = g; this.bench = bench; this.v = v; this.sc = sc; this.w = v.w; this.h = v.h; this.s = v.scale; this.world = w;
    const opts = sc.opts, sel = bench.selected, hov = bench.hoverId && bench.hoverId !== bench.selId ? sc.get(bench.hoverId) : null, hidden = bench.hidden;
    this.boxes = [{ x0: this.w - 262, y0: this.h - 52, x1: this.w, y1: this.h }, { x0: 0, y0: this.h - 52, x1: 250, y1: this.h }, { x0: 0, y0: 0, x1: 150, y1: 24 }]; this.lines = []; this.seen = new Set(); this.massOut = new Set();
    // (labels keep off the blocks themselves)
    // (the bench is drawn with a little depth: every solid is extruded back along this one direction, lit from the upper left)
    const dp = Math.max(6, Math.min(18, 0.2 * this.s)); this.dv = { x: dp * 0.62, y: -dp * 0.5 };
    this.bodies = w.bodies.filter((b) => !b.gone).map((b) => { const pts = b.el.corners(b.p, b.ang).map((q) => this.P(q)); return { x0: Math.min(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)) + Math.min(0, this.dv.y), x1: Math.max(...pts.map((q) => q.x)) + Math.max(0, this.dv.x), y1: Math.max(...pts.map((q) => q.y)) }; });
    // (with a block selected, only its diagram; otherwise every block's, except where two would run into each other)
    const only = sel instanceof Block ? sel.id : 0, plan = opts.fbd && !hidden ? this.diagrams(w, only) : { shown: new Map(), crowded: false };
    this.shownFbd = plan.shown;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    this.ground(opts.grid);
    for (const s of w.surfaces) this.surface(s);
    for (const el of sc.els) if (el instanceof Pulley) this.pulley(el);
    for (const r of w.ropes) this.rope(r, w);
    for (const s of w.springs) this.spring(s, w);
    for (const el of sc.els) if (el instanceof Anchor) this.anchor(el);
    if (opts.trails) this.trail(w);
    if (hov) this.glow(hov, 0.18); if (sel) this.glow(sel, 0.38);
    // (every block's sides first, then every front: a front is nearer than any side)
    for (const b of w.bodies) if (!b.gone) this.solid(b.el.corners(b.p, b.ang).map((p) => this.P(p)), Renderer.rgb(b.el.colour), { sides: true });
    for (const b of w.bodies) this.block(b);
    for (const p of w.pushes) this.push(p, w);
    if (bench.link) this.linking(bench);
    this.fbdLabels = [];
    for (const b of w.bodies) { const arrows = plan.shown.get(b.id); if (arrows) this.fbd(b, arrows, b.id === only && opts.components); }
    if (sel) this.handle(sel, tool);
    // the words: first what sits in the corners, then the measuring tools, the forces, the names and the tensions
    const live = this.hud(bench, tool, plan.crowded && !only);
    this.tape(bench.measure); this.angle(bench.measure);
    for (const lab of this.fbdLabels) this.put(lab.str, lab.at, { color: lab.col, halo: 3.5, anchor: lab.tip, key: lab.key });
    const L = sc.labels();
    for (const b of w.bodies) if (!b.gone) this.blockName(b, L.get(b.id), sel && sel.id === b.id);
    for (const s of w.surfaces) this.surfaceName(s, L.get(s.id), sel && sel.id === s.id);
    if (!hidden && !opts.fbd) for (const r of w.sol.ropes) this.ropeName(r, L.get(r.rope.id));       // (with the arrows on, the tension is on the arrows)
    if (opts.grid) this.ticks();
    for (const k of this.memory.keys()) if (!this.seen.has(k)) this.memory.delete(k);
    g.restore(); return live; }

  // ---- shading ----
  static rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  static tone(c, k, a) { const f = (x) => Math.round(k >= 1 ? x + (255 - x) * (k - 1) : x * k); return 'rgba(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  // A flat shape given depth: its visible sides (the edges facing back along this.dv) as faces shaded by how much
  // they face the light (upper left), and/or its front, lighter at the top, with a soft shadow and a crisp edge.
  solid(pts, c, o) { const g = this.g, dv = this.dv, n = pts.length; let area = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p.x * q.y - q.x * p.y; }
    const sgn = area > 0 ? 1 : -1, L = { x: -0.45, y: -0.89 }, dl = Math.hypot(dv.x, dv.y);
    g.save(); g.setLineDash([]); g.lineJoin = 'round';
    if (o.sides) for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, N = { x: sgn * ey / el, y: -sgn * ex / el };
      if ((N.x * dv.x + N.y * dv.y) / dl < 0.05) continue;
      const lit = 0.5 + 0.62 * Math.max(0, N.x * L.x + N.y * L.y);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.lineTo(q.x + dv.x, q.y + dv.y); g.lineTo(p.x + dv.x, p.y + dv.y); g.closePath();
      g.fillStyle = Renderer.tone(c, lit, o.alpha); g.fill(); g.strokeStyle = 'rgba(5,9,14,' + (o.edge == null ? 0.55 : o.edge) + ')'; g.lineWidth = 1; g.stroke(); }
    if (o.front !== false && !o.sides) { const ys = pts.map((q) => q.y), top = Math.min(...ys), bot = Math.max(...ys), gr = g.createLinearGradient(0, top, 0, bot);
      gr.addColorStop(0, Renderer.tone(c, 1.12, o.alpha)); gr.addColorStop(1, Renderer.tone(c, 0.8, o.alpha));
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
      if (o.shadow) { g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 9; g.shadowOffsetX = 2; g.shadowOffsetY = 3; }
      g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(5,9,14,' + (o.edge == null ? 0.6 : o.edge) + ')'; g.lineWidth = 1.1; g.stroke();
      // a bevel: a fine highlight just inside the edges that face the light
      if (o.bevel !== false) { g.beginPath(); for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, el = Math.hypot(ex, ey) || 1, N = { x: sgn * ey / el, y: -sgn * ex / el };
          if (N.x * L.x + N.y * L.y < 0.3) continue; const ix = -N.x * 1.6, iy = -N.y * 1.6; g.moveTo(p.x + ix + ex / el * 1.5, p.y + iy + ey / el * 1.5); g.lineTo(q.x + ix - ex / el * 1.5, q.y + iy - ey / el * 1.5); }
        g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 1; g.stroke(); } }
    g.restore(); }
  P(p) { return this.v.toCanvas(p); }
  D(d) { return { x: d.x, y: -d.y }; }
  text(str, x, y, o) { const g = this.g; g.font = o.font || Renderer.LABEL; g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
    g.lineWidth = o.halo || 4; g.strokeStyle = Renderer.C.halo; g.setLineDash([]); g.strokeText(str, x, y); g.fillStyle = o.color || Renderer.C.text; g.fillText(str, x, y); }
  // text that labels must keep off (the corners' read-outs, a block's mass)
  mark(str, x, y, o) { const g = this.g; g.font = o.font || Renderer.LABEL; const tw = g.measureText(str).width, al = o.align || 'center', x0 = al === 'left' ? x : al === 'right' ? x - tw : x - tw / 2, th = o.th || 16;
    this.boxes.push({ x0: x0 - 3, y0: y - th / 2, x1: x0 + tw + 3, y1: y + th / 2 }); this.text(str, x, y, o); }
  path(pts, closed) { const g = this.g; g.beginPath(); pts.forEach((p, i) => { const c = this.P(p); if (i) g.lineTo(c.x, c.y); else g.moveTo(c.x, c.y); }); if (closed) g.closePath(); }
  line(a, b) { const g = this.g; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  dot(c, r, fill, stroke) { const g = this.g; g.beginPath(); g.arc(c.x, c.y, r, 0, 2 * Math.PI); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); } }

  // A label with a choice of places, best first. Each is scored: writing over another label or the
  // controls is all but forbidden, over a block costs a lot, a line through the words costs a little,
  // and running off the canvas is slid back on at a price. Given an anchor (what the label names), it
  // also tries rings further out, and if one of those wins a thin leader joins the words to the anchor.
  // A label keeps last frame's place when that is still as good, so nothing flickers while things move.
  put(str, cands, o) { const g = this.g, rich = Array.isArray(str); g.font = o.font || Renderer.LABEL; const tw = rich ? this.runsWidth(str) : g.measureText(str).width, th = rich ? 20 : 16, anchor = o.anchor, prev = o.key ? this.memory.get(o.key) : undefined;
    const all = cands.slice();
    if (anchor) for (const r of [30, 44, 60, 80, 104]) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, cx = Math.cos(a), cy = Math.sin(a);
      all.push({ x: anchor.x + cx * (r + tw / 2 * Math.abs(cx)), y: anchor.y + cy * (r + th / 2 * Math.abs(cy)), far: 30 + r, lead: true }); }
    let best = null, least = Infinity;
    for (let i = 0; i < all.length; i++) { const c = all[i]; let x0 = c.align === 'left' ? c.x : c.align === 'right' ? c.x - tw : c.x - tw / 2;
      const slid = Math.max(5, Math.min(this.w - tw - 5, x0)), slip = Math.abs(slid - x0); x0 = slid; const box = { x0: x0 - 3, y0: c.y - th / 2, x1: x0 + tw + 3, y1: c.y + th / 2, tx: x0 };
      let cost = (c.far || i * 2) + 2 * slip + 200 * (Math.max(0, 2 - box.y0) + Math.max(0, box.y1 - this.h + 2)) - (i === prev ? 6 : 0);
      if (cost >= least) continue;
      for (const b of this.boxes) { const ox = Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0), oy = Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0); if (ox > 0 && oy > 0) cost += 400 + 40 * ox * oy; }
      if (cost >= least) continue;
      for (const b of this.bodies) { const ox = Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0), oy = Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0); if (ox > 0 && oy > 0) cost += 60 + 4 * ox * oy; }
      if (cost >= least) continue;
      for (const l of this.lines) { cost += 6 * Renderer.within(l, box.x0, box.y0 + 2, box.x1, box.y1 - 2); if (cost >= least) break; }
      if (cost < least) { least = cost; best = { c, box, i }; } }
    if (o.key) { this.memory.set(o.key, best.i); this.seen.add(o.key); }
    const box = best.box; this.boxes.push(box);
    if (best.c.lead) { const g = this.g, nx = Math.max(box.x0, Math.min(box.x1, anchor.x)), ny = Math.max(box.y0, Math.min(box.y1, anchor.y));
      g.save(); g.strokeStyle = o.color || Renderer.C.text; g.globalAlpha = 0.55; g.lineWidth = 1; g.setLineDash([2, 3]); this.line(anchor, { x: nx, y: ny }); g.restore(); }
    if (rich) this.runs(str, box.tx, best.c.y, o); else this.text(str, box.tx, best.c.y, { ...o, align: 'left' }); }
  runsWidth(runs) { const g = this.g; let w = 0; for (const r of runs) { g.font = r.f; w += g.measureText(r.t).width; } return w; }
  // runs written left to right from x, centred on y: first every halo, then the ink, so no halo covers a neighbour's ink
  runs(runs, x, y, o) { const g = this.g; g.save(); g.textAlign = 'left'; g.textBaseline = 'middle'; g.setLineDash([]); g.lineJoin = 'round';
    for (const pass of [0, 1]) { let at = x;
      for (const r of runs) { g.font = r.f; const w = g.measureText(r.t).width, yy = y + (r.dy || 0);
        if (pass === 0) { g.lineWidth = o.halo || 3.5; g.strokeStyle = Renderer.C.halo; g.strokeText(r.t, at, yy); } else { g.fillStyle = o.color || Renderer.C.text; g.fillText(r.t, at, yy); }
        if (r.vec) { const ay = y - r.px * 0.72, a0 = at + r.px * 0.12, a1 = at + w + r.px * 0.08; g.beginPath(); g.moveTo(a0, ay); g.lineTo(a1, ay); g.moveTo(a1 - 3.2, ay - 2.4); g.lineTo(a1, ay); g.lineTo(a1 - 3.2, ay + 2.4);
          if (pass === 0) { g.lineWidth = 3.6; g.strokeStyle = Renderer.C.halo; } else { g.lineWidth = 1.3; g.strokeStyle = o.color || Renderer.C.text; } g.stroke(); }
        at += w; } }
    g.restore(); }
  // how much of the line [ax, ay, bx, by] lies inside a box, in pixels
  static within(l, x0, y0, x1, y1) { const dx = l[2] - l[0], dy = l[3] - l[1]; let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, l[0] - x0], [dx, x1 - l[0]], [-dy, l[1] - y0], [dy, y1 - l[1]]]) { if (p === 0) { if (q < 0) return 0; continue; } const r = q / p; if (p < 0) { if (r > t1) return 0; if (r > t0) t0 = r; } else { if (r < t0) return 0; if (r < t1) t1 = r; } }
    return (t1 - t0) * Math.hypot(dx, dy); }
  taken(x0, y0, x1, y1) { return this.boxes.some((b) => b.x0 < x1 && b.x1 > x0 && b.y0 < y1 && b.y1 > y0); }
  keep(c, r) { this.boxes.push({ x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r }); }

  // ---- the bench ----
  gridSteps() { for (const [minor, major] of [[0.1, 0.5], [0.5, 1], [1, 5]]) if (minor * this.s >= 12) return { minor, major }; return { minor: 1, major: 5 }; }
  ground(grid) { const g = this.g, C = Renderer.C, a = this.P({ x: BOARD.x0, y: BOARD.y1 }), b = this.P({ x: BOARD.x1, y: BOARD.y0 }), vis = this.v.visible;
    g.fillStyle = C.off; g.fillRect(0, 0, this.w, this.h);
    const lamp = g.createRadialGradient(this.w * 0.42, this.h * 0.3, 0, this.w * 0.42, this.h * 0.3, Math.max(this.w, this.h) * 0.85); lamp.addColorStop(0, '#16222f'); lamp.addColorStop(1, '#0c131c');
    g.fillStyle = lamp; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    if (grid) { const { minor, major } = this.gridSteps(), x0 = Math.max(BOARD.x0, vis.x0), x1 = Math.min(BOARD.x1, vis.x1), y0 = Math.max(BOARD.y0, vis.y0), y1 = Math.min(BOARD.y1, vis.y1);
      const top = this.P({ x: 0, y: y1 }).y, bot = this.P({ x: 0, y: y0 }).y, left = this.P({ x: x0, y: 0 }).x, right = this.P({ x: x1, y: 0 }).x, on = (q, m) => Math.abs(q / m - Math.round(q / m)) < 1e-6;
      for (const pass of [0, 1]) { g.beginPath(); g.lineWidth = 1; g.strokeStyle = [C.grid, C.major][pass];
        for (let x = Math.ceil(x0 / minor - 1e-9) * minor; x <= x1 + 1e-9; x += minor) { if ((on(x, major) ? 1 : 0) !== pass) continue; const X = Math.round(this.P({ x, y: 0 }).x) + 0.5; g.moveTo(X, top); g.lineTo(X, bot); }
        for (let y = Math.ceil(y0 / minor - 1e-9) * minor; y <= y1 + 1e-9; y += minor) { if ((on(y, major) ? 1 : 0) !== pass) continue; const Y = Math.round(this.P({ x: 0, y }).y) + 0.5; g.moveTo(left, Y); g.lineTo(right, Y); }
        g.stroke(); } }
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1; g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
  ticks() { const C = Renderer.C, vis = this.v.visible; let { major } = this.gridSteps(); while (major * this.s < 44) major *= 2; const o = { font: '500 11px ' + Renderer.MONO, color: C.tick, halo: 3 }, fmt = (q) => Fmt.num(q, 1);
    for (let x = Math.ceil(Math.max(BOARD.x0, vis.x0) / major) * major; x <= Math.min(BOARD.x1, vis.x1) + 1e-9; x += major) { const X = this.P({ x, y: 0 }).x; if (X < 14 || X > this.w - 14 || this.taken(X - 14, this.h - 16, X + 14, this.h - 2)) continue; this.text(fmt(x), X, this.h - 9, o); }
    for (let y = Math.ceil(Math.max(BOARD.y0, vis.y0) / major) * major; y <= Math.min(BOARD.y1, vis.y1) + 1e-9; y += major) { const Y = this.P({ x: 0, y }).y; if (Y < 24 || Y > this.h - 60 || this.taken(4, Y - 7, 30, Y + 7)) continue; this.text(fmt(y), 6, Y, { ...o, align: 'left' }); }
    if (!this.taken(4, this.h - 71, 16, this.h - 57)) this.text('m', 6, this.h - 64, { ...o, align: 'left' }); }

  // A surface: a slab of material on its solid side (a wedge under a ramp), with its top face seen in depth
  // when that face is towards the viewer, the hatching of a solid, and a dotted gold line when it is rough.
  surface(s) { const g = this.g, C = Renderer.C, a = this.P(s.a), b = this.P(s.b), n = this.D(s.n), slope = s.el.slope, dv = this.dv, stone = [128, 142, 158];
    const len = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / (len || 1), y: (b.y - a.y) / (len || 1) }, T = 9;
    const wedge = s.n.y > 0.2 && slope > 0.5 && slope < 89.5;
    let body;
    if (wedge) { const lo = s.a.y < s.b.y ? s.a : s.b, hi = s.a.y < s.b.y ? s.b : s.a, pl = this.P(lo), ph = this.P(hi), foot = this.P({ x: hi.x, y: lo.y }); body = [pl, ph, foot]; }
    else body = [a, b, { x: b.x - n.x * T, y: b.y - n.y * T }, { x: a.x - n.x * T, y: a.y - n.y * T }];
    this.solid(body, stone, { sides: true, alpha: 0.85, edge: 0.4 });
    this.solid(body, stone, { alpha: wedge ? 0.42 : 0.66, edge: 0.35, bevel: false });
    // the top face: towards the viewer when the free side faces back along the depth
    const faces = n.x * dv.x + n.y * dv.y > 0;
    if (faces) { g.save(); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(b.x + dv.x, b.y + dv.y); g.lineTo(a.x + dv.x, a.y + dv.y); g.closePath();
      const gr = g.createLinearGradient(a.x, a.y, a.x + dv.x, a.y + dv.y); gr.addColorStop(0, 'rgba(215,224,233,0.5)'); gr.addColorStop(1, 'rgba(215,224,233,0.2)'); g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(215,224,233,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x + dv.x, a.y + dv.y); g.lineTo(b.x + dv.x, b.y + dv.y); g.stroke();
      if (s.muS > 0 || s.muK > 0) { g.strokeStyle = 'rgba(240,200,96,0.6)'; g.lineWidth = 1.2; g.setLineDash([1.5, 4]); g.beginPath(); g.moveTo(a.x + dv.x * 0.45, a.y + dv.y * 0.45); g.lineTo(b.x + dv.x * 0.45, b.y + dv.y * 0.45); g.stroke(); g.setLineDash([]); }
      g.restore(); }
    else if (s.muS > 0 || s.muK > 0) { g.strokeStyle = 'rgba(240,200,96,0.45)'; g.lineWidth = 1; g.setLineDash([2, 4]); this.line({ x: a.x + n.x * 2.5, y: a.y + n.y * 2.5 }, { x: b.x + n.x * 2.5, y: b.y + n.y * 2.5 }); g.setLineDash([]); }
    // the hatching of a solid, just under the face
    g.strokeStyle = C.hatch; g.lineWidth = 1; g.beginPath();
    for (let d = 4; d < len; d += 9) { const c = { x: a.x + u.x * d, y: a.y + u.y * d }; g.moveTo(c.x - n.x * 1.5, c.y - n.y * 1.5); g.lineTo(c.x - n.x * 7 - u.x * 5, c.y - n.y * 7 - u.y * 5); } g.stroke();
    if (wedge) { const [pl, ph, foot] = body, r = 26, a0 = Math.atan2(ph.y - pl.y, ph.x - pl.x), base = foot.x > pl.x ? 0 : Math.PI; g.strokeStyle = 'rgba(200,214,228,0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(pl.x, pl.y, r, Math.min(a0, base), Math.max(a0, base)); g.stroke(); }
    // the working face itself, bright
    g.strokeStyle = C.surface; g.lineWidth = 2.4; this.line(a, b);
    this.lines.push([a.x, a.y, b.x, b.y]); }

  rope(r, w) { const g = this.g, C = Renderer.C, geo = r.geo || w.route(r); if (!geo) return; const pts = geo.pts.map((p) => this.P(p)), slack = w.sol.ropes.find((x) => x.rope === r), taut = slack ? slack.taut : true;
    g.setLineDash([]); g.beginPath();
    // a slack rope sags: its straight runs are drawn as curves holding the extra length
    const extra = Math.max(0, r.L0 - geo.length);
    if (!taut && extra > 1e-3 && pts.length >= 2) { let total = 0; for (let i = 0; i + 1 < pts.length; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      g.moveTo(pts[0].x, pts[0].y); for (let i = 0; i + 1 < pts.length; i++) { const p = pts[i], q = pts[i + 1], l = Math.hypot(q.x - p.x, q.y - p.y), sag = l > 6 ? Math.sqrt(3 * l * extra * this.s * l / Math.max(total, 1e-6) / 8) : 0;
        g.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2 + 2 * sag, q.x, q.y); } }
    else pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    // (a dark edge, the cord, and the lay of its strands)
    g.lineCap = 'round'; g.strokeStyle = 'rgba(20,14,6,0.7)'; g.lineWidth = 3.6; g.stroke(); g.strokeStyle = C.rope; g.lineWidth = 2.2; g.stroke();
    g.strokeStyle = 'rgba(120,96,52,0.75)'; g.lineWidth = 2.2; g.setLineDash([1.2, 2.6]); g.stroke(); g.setLineDash([]);
    for (let i = 0; i + 1 < pts.length; i++) this.lines.push([pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y]); }
  spring(s, w) { const g = this.g, pa = w.posOf(s.from), pb = w.posOf(s.to); if (!pa || !pb) return; const a = this.P(pa), b = this.P(pb), L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 2) return;
    // a helix seen in the bench's depth: radius set by the zoom, as many coils as its natural length holds (so they spread as it stretches)
    const rest = (s.el || s).rest || 1, amp = Math.max(4.5, Math.min(11, 0.075 * this.s)), coils = Math.max(5, Math.min(36, Math.round(rest * this.s / (amp * 1.7)))), lead = Math.min(amp * 1.6, L * 0.15), run = L - 2 * lead, steps = coils * 24;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y, y: u.x }, dl = Math.hypot(this.dv.x, this.dv.y), d = { x: this.dv.x / dl, y: this.dv.y / dl };
    const at = (t) => { const th = 2 * Math.PI * coils * t, x = lead + run * t, si = amp * Math.sin(th), co = amp * 0.6 * Math.cos(th); return { x: a.x + u.x * x + n.x * si + d.x * co, y: a.y + u.y * x + n.y * si + d.y * co, front: Math.cos(th) < 0 }; };
    g.save(); g.setLineDash([]); g.lineCap = 'round';
    for (const front of [false, true]) { g.beginPath(); let prev = at(0);
      for (let i = 1; i <= steps; i++) { const q = at(i / steps); if (q.front === front) { g.moveTo(prev.x, prev.y); g.lineTo(q.x, q.y); } prev = q; }
      if (front) { g.strokeStyle = 'rgba(20,10,30,0.6)'; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = '#dcb8f2'; g.lineWidth = 1.8; } else { g.strokeStyle = '#7f5c99'; g.lineWidth = 1.7; }
      g.stroke(); }
    g.strokeStyle = '#c9a0e8'; g.lineWidth = 2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + u.x * lead, a.y + u.y * lead); g.moveTo(b.x - u.x * lead, b.y - u.y * lead); g.lineTo(b.x, b.y); g.stroke(); g.restore();
    this.lines.push([a.x, a.y, b.x, b.y]); }
  // a pulley: a metal wheel with some thickness, a groove for the rope, and a hub
  pulley(el) { const g = this.g, c = this.P(el.pos), r = Math.max(5, el.r * this.s), k = Math.min(0.45, 7 / Math.hypot(this.dv.x, this.dv.y)), back = { x: c.x + this.dv.x * k, y: c.y + this.dv.y * k };
    g.save(); g.setLineDash([]);
    for (let i = 6; i >= 1; i--) { const f = i / 6; this.dot({ x: c.x + (back.x - c.x) * f, y: c.y + (back.y - c.y) * f }, r, '#3c4a58'); }
    this.dot(back, r, null, 'rgba(5,9,14,0.6)');
    const gr = g.createRadialGradient(c.x - r * 0.35, c.y - r * 0.4, r * 0.1, c.x, c.y, r); gr.addColorStop(0, '#e3ebf2'); gr.addColorStop(0.55, '#9fb1c2'); gr.addColorStop(1, '#5b6c7d');
    g.lineWidth = 1.2; this.dot(c, r, gr, 'rgba(5,9,14,0.7)');
    g.lineWidth = Math.max(1, r * 0.12); this.dot(c, r * 0.8, null, 'rgba(40,52,64,0.55)');
    g.lineWidth = 1; this.dot(c, Math.max(2.5, r * 0.26), '#46576a', 'rgba(5,9,14,0.7)'); this.dot({ x: c.x - r * 0.06, y: c.y - r * 0.06 }, Math.max(1, r * 0.08), '#e9f0f6');
    g.restore(); }
  // an anchor: a bolt in a plate
  anchor(el) { const g = this.g, c = this.P(el.pos); g.save(); g.setLineDash([]);
    const gr = g.createRadialGradient(c.x - 2, c.y - 2, 0.5, c.x, c.y, 6.5); gr.addColorStop(0, '#eef3f7'); gr.addColorStop(1, '#6b7d8e');
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 4; g.shadowOffsetX = 1; g.shadowOffsetY = 2; g.lineWidth = 1; this.dot(c, 6, gr, 'rgba(5,9,14,0.7)'); g.shadowColor = 'transparent';
    this.dot(c, 2, '#3a4856'); g.restore(); }

  // A block where the world has it, tilted to whatever it rests on.
  block(b) { if (b.gone) return; const g = this.g, pts = b.el.corners(b.p, b.ang).map((p) => this.P(p));
    this.solid(pts, Renderer.rgb(b.el.colour), { shadow: true });
    // (its mass is written on it if it fits, clear of everything else, and neither its own arrows start there nor another's cross it;
    // otherwise the mass goes with its name)
    const c = this.P(b.p), size = Math.min(b.w, b.h) * this.s, px = Math.min(12, Math.max(9, size * 0.28));
    const str = Fmt.num(b.m, 2) + ' kg', font = '700 ' + px + 'px ' + Renderer.MONO; g.font = font; const tw = g.measureText(str).width, box = { x0: c.x - tw / 2 - 3, y0: c.y - px / 2 - 1, x1: c.x + tw / 2 + 3, y1: c.y + px / 2 + 1 };
    const crossed = [...this.shownFbd.values()].some((list) => list.some((f) => Renderer.within([f.c.x, f.c.y, f.tip.x, f.tip.y], box.x0, box.y0, box.x1, box.y1) > 0));
    const fits = size > 22 && tw + 8 <= b.w * this.s;
    const clear = !this.boxes.some((q) => Math.min(box.x1, q.x1) > Math.max(box.x0, q.x0) && Math.min(box.y1, q.y1) > Math.max(box.y0, q.y0));
    if (!fits || !clear || crossed || this.shownFbd.has(b.id)) this.massOut.add(b.id); else this.mark(str, c.x, c.y, { font, color: '#fff', halo: 2.5, th: px + 2 });
    for (let i = 0; i < 4; i++) this.lines.push([pts[i].x, pts[i].y, pts[(i + 1) % 4].x, pts[(i + 1) % 4].y]); }
  // an applied force: a fat arrow pushing (or pulling) on the block
  push(p, w) { const b = w.body(p.on); if (!b || b.gone) return; const g = this.g, [tail, tip] = p.el.arrowAt(b.p, b.ang, b.w, b.h, p.el.at(w.t)), a = this.P(tail), c = this.P(tip);
    const l = Math.hypot(c.x - a.x, c.y - a.y); if (l < 4) return; const ux = (c.x - a.x) / l, uy = (c.y - a.y) / l, nx = -uy, ny = ux, hw = 3.4, hh = 8.5, hl = Math.min(15, l * 0.6), bx = c.x - ux * hl, by = c.y - uy * hl;
    const pts = [[a.x + nx * hw, a.y + ny * hw], [bx + nx * hw, by + ny * hw], [bx + nx * hh, by + ny * hh], [c.x, c.y], [bx - nx * hh, by - ny * hh], [bx - nx * hw, by - ny * hw], [a.x - nx * hw, a.y - ny * hw]];
    g.save(); g.setLineDash([]); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    const gr = g.createLinearGradient(a.x + nx * hh, a.y + ny * hh, a.x - nx * hh, a.y - ny * hh); gr.addColorStop(0, '#ffc98a'); gr.addColorStop(0.5, '#ff9f43'); gr.addColorStop(1, '#c86a14');
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 6; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2.5; g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(60,25,0,0.75)'; g.lineWidth = 1; g.lineJoin = 'round'; g.stroke(); g.restore(); this.lines.push([a.x, a.y, c.x, c.y]); }
  // how far from a block's centre its edge is, along d
  edge(b, d) { const u = V.polar(b.ang), v = V.left(u); return Math.min(Math.abs(b.w / 2 / (V.dot(d, u) || 1e-9)), Math.abs(b.h / 2 / (V.dot(d, v) || 1e-9))); }
  arrow(a, c, head) { const g = this.g, l = Math.hypot(c.x - a.x, c.y - a.y); if (l < 1) return; const u = { x: (c.x - a.x) / l, y: (c.y - a.y) / l }, hb = { x: c.x - u.x * head, y: c.y - u.y * head };
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(hb.x, hb.y); g.stroke(); g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(hb.x - u.y * head * 0.5, hb.y + u.x * head * 0.5); g.lineTo(hb.x + u.y * head * 0.5, hb.y - u.x * head * 0.5); g.closePath(); g.fill(); }

  // ---- free-body diagrams ----
  // Every force on the block, drawn from its centre, all to one scale (the biggest force on the bench is about 80 px).
  // Forces of one kind from one thing are added (the two normal forces of a block pressed on a floor and a wall stay apart).
  arrows(b, w) { const list = [], add = (f) => { const k = f.kind + '|' + (f.by ? f.by.id : ''), e = list.find((x) => x.k === k); if (e) e.F = V.add(e.F, f.F); else list.push({ k, kind: f.kind, F: { ...f.F }, by: f.by }); };
    for (const f of w.forcesOn(b.id)) add(f);
    const k = this.forceScale(w), c = this.P(b.p), out = [];
    for (const f of list) { const m = V.len(f.F); if (m < 1e-6) continue; const d = this.D(V.mul(f.F, 1 / m)), L = Math.max(10, m * k); out.push({ ...f, m, d, c, tip: { x: c.x + d.x * L, y: c.y + d.y * L } }); }
    return out; }
  // Which blocks get their diagram: the selected one, or with none selected every block whose arrows keep
  // clear of every other block and its arrows (blocks stacked or pushed together would draw over each other).
  diagrams(w, only) { const shown = new Map(), live = w.bodies.filter((b) => !b.gone && (!only || b.id === only));
    for (const b of live) shown.set(b.id, this.arrows(b, w)); if (only || live.length < 2) return { shown, crowded: false };
    const poly = new Map(live.map((b) => [b.id, b.el.corners(b.p, b.ang).map((q) => this.P(q))])), clash = new Set();
    const into = (arrows, pts) => arrows.some((a) => Renderer.segPoly(a.c, a.tip, pts, 8));
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) { const A = live[i], B = live[j], aa = shown.get(A.id), bb = shown.get(B.id);
      if (into(aa, poly.get(B.id)) || into(bb, poly.get(A.id)) || aa.some((x) => bb.some((y) => Renderer.segDist(x.c, x.tip, y.c, y.tip) < 26))) { clash.add(A.id); clash.add(B.id); } }
    for (const id of clash) shown.delete(id); return { shown, crowded: clash.size > 0 }; }
  fbd(b, arrows, components) { const g = this.g, k = this.forceScale(this.world), c = this.P(b.p);
    for (const f of arrows) { const spec = Renderer.FORCE[f.kind] || { l: '?', s: '', col: '#fff' }, d = f.d, tip = f.tip;
      g.setLineDash([]); g.strokeStyle = 'rgba(6,10,16,0.75)'; g.fillStyle = 'rgba(6,10,16,0.75)'; g.lineWidth = 5; this.arrow(c, tip, 10.5);
      g.strokeStyle = spec.col; g.fillStyle = spec.col; g.lineWidth = 2.6; this.arrow(c, tip, 9); this.lines.push([c.x, c.y, tip.x, tip.y]);
      if (components) { const u = V.polar(b.ang), v = V.left(u); g.lineWidth = 1.2; g.setLineDash([3, 3]); for (const ax of [u, v]) { const comp = V.dot(f.F, ax); if (Math.abs(comp) < 1e-6) continue; const e = this.D(V.mul(ax, comp * k)), end = { x: c.x + e.x, y: c.y + e.y }; this.arrow(c, end, 6); this.lines.push([c.x, c.y, end.x, end.y]); } g.setLineDash([]); }
      const str = this.bench.values ? Renderer.magnitude(spec.l, spec.s, Fmt.N(f.m)) : Renderer.sym(spec.l, spec.s), side = { x: -d.y, y: d.x }, out = [14, 26].map((r) => ({ x: tip.x + d.x * r, y: tip.y + d.y * r }));
      for (const s of [1, -1]) out.push({ x: tip.x + side.x * s * 16 - d.x * 6, y: tip.y + side.y * s * 16 - d.y * 6, align: side.x * s > 0.3 ? 'left' : side.x * s < -0.3 ? 'right' : undefined });
      out.push({ x: tip.x + d.x * 40, y: tip.y + d.y * 40 });
      this.fbdLabels.push({ str, at: out, col: spec.col, tip, key: 'f' + b.id + f.k }); }
    this.dot(c, 2.5, '#fff'); }
  // the distance between two segments (canvas px), and whether a segment comes within `pad` of a polygon
  static segDist(a, b, c, d) { const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    if (Math.sign(cross(a, b, c)) !== Math.sign(cross(a, b, d)) && Math.sign(cross(c, d, a)) !== Math.sign(cross(c, d, b))) return 0;
    const to = (p, q, r) => { const dx = r.x - q.x, dy = r.y - q.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / l2)) : 0; return Math.hypot(p.x - q.x - t * dx, p.y - q.y - t * dy); };
    return Math.min(to(a, c, d), to(b, c, d), to(c, a, b), to(d, a, b)); }
  static segPoly(a, b, pts, pad) { const inside = (p) => { let s = 0; for (let i = 0; i < pts.length; i++) { const q = pts[i], r = pts[(i + 1) % pts.length]; s += Math.sign((r.x - q.x) * (p.y - q.y) - (r.y - q.y) * (p.x - q.x)); } return Math.abs(s) === pts.length; };
    if (inside(a) || inside(b)) return true; return pts.some((q, i) => Renderer.segDist(a, b, q, pts[(i + 1) % pts.length]) < pad); }
  forceScale(w) { if (w._k && w._kAt === this.s) return w._k; let big = 0; for (const b of w.bodies) for (const f of w.forcesOn(b.id)) big = Math.max(big, V.len(f.F));
    w._k = big > 0 ? 80 / big : 1; w._kAt = this.s; return w._k; }

  // ---- labels ----
  // a block's name sits against one of its own edges: above, beside, then below
  blockName(b, name, selected) { const c = this.P(b.p), pts = b.el.corners(b.p, b.ang).map((q) => this.P(q)), x0 = Math.min(...pts.map((q) => q.x)), x1 = Math.max(...pts.map((q) => q.x)), y0 = Math.min(...pts.map((q) => q.y)), y1 = Math.max(...pts.map((q) => q.y));
    const str = this.massOut.has(b.id) ? name + ' · ' + Fmt.num(b.m, 2) + ' kg' : name;
    const up = Math.min(0, this.dv.y), side = Math.max(0, this.dv.x);
    this.put(str, [{ x: c.x + side / 2, y: y0 + up - 11 }, { x: x1 + side + 7, y: c.y, align: 'left' }, { x: x0 - 7, y: c.y, align: 'right' }, { x: c.x, y: y1 + 11 }, { x: x1 + side + 7, y: y0 + up - 9, align: 'left' }, { x: x0 - 7, y: y0 + up - 9, align: 'right' }],
      { color: selected ? '#f6e3ad' : Renderer.C.text, anchor: c, key: 'n' + b.id }); }
  surfaceName(s, name, selected) { const a = this.P(s.a), b = this.P(s.b), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, n = this.D(s.n), tag = s.el.tag, mono = '600 11px ' + Renderer.MONO, txt = (t) => ({ t, f: mono });
    // Ramp 1  30°  μ_s = 0.4, μ_k = 0.3   (the coefficients set as symbols)
    const str = [txt(name + (tag ? '  ' + tag : '') + (s.muS || s.muK ? '  ' : '  frictionless'))];
    if (s.muS || s.muK) str.push(...Renderer.sym('μ', 's', { px: 13 }), txt(' = ' + Fmt.num(s.muS, 2) + ', '), ...Renderer.sym('μ', 'k', { px: 13 }), txt(' = ' + Fmt.num(s.muK, 2)));
    this.put(str, [{ x: m.x - n.x * 18, y: m.y - n.y * 18 }, { x: m.x - n.x * 34, y: m.y - n.y * 34 }, { x: a.x - n.x * 18, y: a.y - n.y * 18 }], { font: '600 11px ' + Renderer.MONO, color: selected ? '#f6e3ad' : Renderer.C.dim, anchor: m, key: 's' + s.id }); }
  ropeName(r, name) { const geo = r.rope.geo; if (!geo || geo.pts.length < 2) return; let best = null, bl = 0; for (let i = 0; i + 1 < geo.pts.length; i++) { const l = V.dist(geo.pts[i], geo.pts[i + 1]); if (l > bl) { bl = l; best = i; } }
    if (best === null || bl * this.s < 40) return; const a = this.P(geo.pts[best]), b = this.P(geo.pts[best + 1]), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, u = { x: (b.x - a.x) / (bl * this.s), y: (b.y - a.y) / (bl * this.s) };
    this.put([...Renderer.sym('T', ''), ...(this.bench.values ? [{ t: ' = ' + Fmt.N(r.T), f: '600 11px ' + Renderer.MONO }] : [])], [{ x: m.x - u.y * 14 + 4, y: m.y + u.x * 14, align: 'left' }, { x: m.x + u.y * 14 - 4, y: m.y - u.x * 14, align: 'right' }], { font: '600 11px ' + Renderer.MONO, color: '#c7e8b3', anchor: m, key: 'r' + r.rope.id }); }

  // ---- the motion diagram: where each block was every TRAIL seconds (the latest MAXIMG of them), a dot at its
  // centre and its velocity there, drawn as the distance it would cover in one interval ----
  static TRAIL = 0.1;
  static MAXIMG = 40;
  trail(w) { const R = w.rec, step = Math.max(1, Math.round(Renderer.TRAIL * World.REC)), g = this.g; if (R.length < 2) return; const pick = [];
    for (let i = 0; i < R.length && R[i].t <= w.t + 1e-9; i += step) pick.push(R[i]); const imgs = pick.slice(-Renderer.MAXIMG); if (!imgs.length) return;
    g.save(); g.setLineDash([]);
    imgs.forEach((r, k) => { const age = (imgs.length - 1 - k) / Math.max(1, imgs.length - 1), alpha = 0.55 - 0.35 * age;
      r.b.forEach((x, i) => { if (x.gone) return; const body = w.bodies[i]; if (!body) return; const col = Renderer.rgb(body.el.colour), pts = body.el.corners(x.p, x.ang).map((q) => this.P(q)), c = this.P(x.p);
        g.globalAlpha = alpha * 0.8; g.fillStyle = 'rgba(' + col.join(',') + ',0.4)'; g.strokeStyle = 'rgba(' + col.join(',') + ',0.9)'; g.lineWidth = 1;
        g.beginPath(); pts.forEach((q, j) => (j ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill(); g.stroke();
        g.globalAlpha = Math.min(1, alpha + 0.3); this.dot(c, 2.6, '#f4f7fa', 'rgba(5,9,14,0.6)');
        const d = this.D(V.mul(x.v, Renderer.TRAIL * this.s)), L = Math.hypot(d.x, d.y); if (L > 4) { g.strokeStyle = '#9fe6b8'; g.fillStyle = '#9fe6b8'; g.lineWidth = 1.6; this.line(c, { x: c.x + d.x, y: c.y + d.y });
          const ux = d.x / L, uy = d.y / L, e = { x: c.x + d.x, y: c.y + d.y }; g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x - ux * 6 - uy * 3, e.y - uy * 6 + ux * 3); g.lineTo(e.x - ux * 6 + uy * 3, e.y - uy * 6 - ux * 3); g.closePath(); g.fill(); } }); });
    g.restore(); }

  // ---- the selection ----
  glow(el, alpha) { const g = this.g; g.setLineDash([]); g.strokeStyle = 'rgba(240,200,96,' + alpha + ')';
    if (el instanceof Block) { const b = this.world.body(el.id); if (!b) return; const pts = el.corners(b.p, b.ang).map((p) => this.P(p)); g.lineWidth = 6; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke(); return; }
    if (el instanceof Rope) { const r = this.world.ropes.find((x) => x.id === el.id), geo = r && r.geo; if (!geo) return; g.lineWidth = 9; g.beginPath(); geo.pts.forEach((p, i) => { const c = this.P(p); if (i) g.lineTo(c.x, c.y); else g.moveTo(c.x, c.y); }); g.stroke(); return; }
    if (el instanceof Spring) { const w = this.world, pa = w.posOf(el.from), pb = w.posOf(el.to); if (!pa || !pb) return; g.lineWidth = 16; this.line(this.P(pa), this.P(pb)); return; }
    if (el instanceof Push) { const b = this.world.body(el.on); if (!b || b.gone) return; const [tail, tip] = el.arrowAt(b.p, b.ang, b.w, b.h, el.at(this.world.t)); g.lineWidth = 13; this.line(this.P(tail), this.P(tip)); return; }
    const o = el.outline(); this.path(o.pts, o.closed); g.lineWidth = o.closed ? 6 : Math.max(10, 2 * el.pad * this.s + 6); g.stroke(); }
  handle(el, tool) { const h = tool.handle(el); if (!h) return; const g = this.g, C = Renderer.C, a = this.P(el instanceof Surface ? tool.grip(el).end : el.path()[0]), c = this.P(h); g.setLineDash([]); g.strokeStyle = 'rgba(240,200,96,0.7)'; g.lineWidth = 1.2; this.line(a, c);
    g.lineWidth = 1.6; this.dot(c, tool.overHandle || tool.turning ? 7 : 6, C.gold, '#0f1722');
    if (tool.turning === el) this.text(el instanceof Surface ? Fmt.deg(el.slope, 0) + '  ' + Fmt.m(el.length) : Fmt.deg(el.angle, 0), c.x, c.y - 18, { font: Renderer.LABEL, color: C.gold }); }
  // joining things: what has been picked so far, and what can be picked next
  linking(bench) { const g = this.g, l = bench.link; g.save(); g.setLineDash([4, 4]); g.strokeStyle = 'rgba(127,224,255,0.9)'; g.lineWidth = 2;
    const pts = l.picks.map((id) => bench.world.posOf(id) || (bench.scene.get(id) || {}).pos).filter(Boolean).map((p) => this.P(p));
    for (const p of pts) this.dot(p, 9, null, 'rgba(127,224,255,0.9)'); if (pts.length > 1) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
    g.restore(); }

  // a tape measure: a band with centimetre marks, its case at one end and its hook at the other
  tape(m) { const t = m.tape; if (!t) return; const g = this.g, a = this.P(t.a), b = this.P(t.b), len = Math.hypot(b.x - a.x, b.y - a.y), L = m.length;
    const u = len > 1e-9 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: 1, y: 0 }, n = { x: -u.y, y: u.x };
    g.save(); g.setLineDash([]); g.lineCap = 'butt'; g.strokeStyle = 'rgba(232,192,70,0.92)'; g.lineWidth = 9; this.line(a, b);
    // the marks: every centimetre if they are far enough apart, else every 5 or 10; longer every 5 and 10
    let step = 0.01; while (step * this.s < 5) step = step < 0.04 ? 0.05 : step * 2; g.strokeStyle = 'rgba(40,30,10,0.85)'; g.lineWidth = 1; g.beginPath();
    for (let d = 0; d <= L + 1e-9; d += step) { const k = Math.round(d * 100), big = k % 10 === 0 ? 7 : k % 5 === 0 ? 5 : 3, c = { x: a.x + u.x * d * this.s, y: a.y + u.y * d * this.s }; g.moveTo(c.x + n.x * 4.5, c.y + n.y * 4.5); g.lineTo(c.x + n.x * (4.5 - big), c.y + n.y * (4.5 - big)); }
    g.stroke();
    // the case (at a) and the hook (at b): both can be dragged
    g.fillStyle = '#d9a520'; g.strokeStyle = '#3a2a08'; g.lineWidth = 1.4; g.beginPath(); if (g.roundRect) g.roundRect(a.x - 8, a.y - 8, 16, 16, 4); else g.rect(a.x - 8, a.y - 8, 16, 16); g.fill(); g.stroke(); this.dot(a, 2.5, '#3a2a08');
    g.lineWidth = 3; g.strokeStyle = '#3a2a08'; this.line({ x: b.x + n.x * 6, y: b.y + n.y * 6 }, { x: b.x - n.x * 6, y: b.y - n.y * 6 }); g.restore();
    for (let i = 0; i <= Math.ceil(len / 12); i++) { const f = Math.min(1, i * 12 / (len || 1)); this.keep({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, 7); } this.keep(a, 9);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, o = { font: '700 13px ' + Renderer.MONO, color: '#f6dc8c' };
    this.put(Fmt.fix(L, 2) + ' m', [{ x: mid.x - n.x * 17, y: mid.y - n.y * 17 }, { x: mid.x + n.x * 17, y: mid.y + n.y * 17 }, { x: mid.x - n.x * 32, y: mid.y - n.y * 32 }, { x: mid.x + n.x * 32, y: mid.y + n.y * 32 }], { ...o, anchor: mid, key: 'tape' }); }
  // the picked lines, carried on (dashed) to where they meet, and the angle between them there
  angle(m) { if (!m.angleOn) return; const g = this.g, lines = m.fresh(), A = m.angle, col = '#7fe0ff'; g.save(); g.setLineDash([]); g.lineCap = 'round';
    for (const l of lines) { g.strokeStyle = 'rgba(127,224,255,0.9)'; g.lineWidth = 3; this.line(this.P(l.a), this.P(l.b)); this.dot(this.P(l.at), 3.5, col); }
    if (A && A.at) { const c = this.P(A.at), r = 30;
      g.strokeStyle = 'rgba(127,224,255,0.55)'; g.lineWidth = 1.2; g.setLineDash([4, 4]); for (const l of lines) this.line(c, this.P(l.at)); g.setLineDash([]);
      const a0 = Math.atan2(-A.u.y, A.u.x), a1 = Math.atan2(-A.w.y, A.w.x); let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(c.x, c.y, r, a0, a0 + d, d < 0); g.stroke(); this.dot(c, 2.5, col); g.restore();
      const mid = a0 + d / 2; this.put(Fmt.deg(A.deg), [r + 20, r + 36, r + 52].map((k) => ({ x: c.x + Math.cos(mid) * k, y: c.y + Math.sin(mid) * k })), { font: '700 13px ' + Renderer.MONO, color: col, anchor: c, key: 'angle' }); return; }
    g.restore(); }


  // ---- the corners: the pointer, hints and notices ----
  hud(bench, tool, crowded) { const g = this.g, C = Renderer.C, mv = tool.moving, p = mv ? mv.pos : tool.pointer, small = { font: '500 12px ' + Renderer.MONO, color: C.dim, align: 'left', halo: 3.5 }; let live = false;
    if (p) this.mark((mv ? 'at ' : '') + '(' + Fmt.fix(p.x, 2) + ', ' + Fmt.fix(p.y, 2) + ') m', 10, 14, { ...small, color: mv ? C.gold : C.dim });
    if (bench.hidden) this.mark('Forces hidden: predict, then press Show forces', this.w - 10, 14, { ...small, align: 'right', color: C.gold });
    if (bench.link) this.mark(bench.linkHint + '   (Esc to stop)', this.w / 2, 34, { font: '600 13px ' + Renderer.SANS, color: '#7fe0ff' });
    const m = bench.measure;
    if (m.angleOn) { const A = m.angle, k = m.fresh().length;
      this.mark(A ? (A.at ? 'Angle between the lines: ' + Fmt.deg(A.deg) + ' (' + Fmt.deg(A.other) + ' on the other side)' : 'The lines are parallel') : 'Angle: click a surface, rope or spring (' + k + ' of 2)', 10, 34, { ...small, color: '#7fe0ff' }); }
    if (bench.scene.isEmpty) { this.text('The bench is empty.', this.w / 2, this.h / 2 - 12, { font: '600 15px ' + Renderer.SANS, color: C.text }); this.text('Use + Add to put a surface and a block on it, or pick a preset.', this.w / 2, this.h / 2 + 12, { font: '500 13px ' + Renderer.SANS, color: C.dim }); }
    const n = bench.notice;
    if (n) { const age = Date.now() - n.at, life = 2600 + 35 * Math.max(0, n.text.length - 40); if (age >= life) bench.notice = null;
      else { const alpha = Math.min(1, (life - age) / 400); live = true; g.save(); g.globalAlpha = alpha; g.font = '600 13px ' + Renderer.SANS; const tw = Math.min(this.w - 40, g.measureText(n.text).width + 26), x = (this.w - tw) / 2, y = this.h - 92;
        g.fillStyle = 'rgba(15,23,34,0.94)'; g.strokeStyle = 'rgba(240,200,96,0.7)'; g.lineWidth = 1; g.setLineDash([]); g.beginPath(); if (g.roundRect) g.roundRect(x, y, tw, 30, 8); else g.rect(x, y, tw, 30); g.fill(); g.stroke();
        g.fillStyle = '#f3e3b3'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.text, this.w / 2, y + 15.5, tw - 16); g.restore(); this.boxes.push({ x0: x, y0: y, x1: x + tw, y1: y + 30 }); } }
    // (with no notice showing, a word on why some blocks have no arrows)
    if (crowded && !bench.notice) this.mark('Blocks touching: click one to see the forces on it', this.w / 2, this.h - 66, { ...small, align: 'center', color: C.gold });
    return live; }
}
