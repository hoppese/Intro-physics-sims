// =====================================================================
// Renderer -- paints the bench on the canvas. It is handed the workbench
// (scene, traced light, view) and the pointer tool, and draws, back to front:
//   the grid, glass, the light, what the View menu adds (extended rays,
//   angles, images), the thin elements, the selection, and last of all the
//   labels, so that no line ever runs through a number.
// Everything here is in canvas pixels; P() converts from the bench.
// =====================================================================
class Renderer {
  static C = { bg: '#0f1722', off: '#0a1018', grid: 'rgba(255,255,255,0.045)', major: 'rgba(255,255,255,0.095)', axis: 'rgba(255,255,255,0.2)', tick: '#6c7f93',
    text: '#cdd8e3', dim: '#8496a8', gold: '#f0c860', halo: 'rgba(9,14,21,0.92)', glass: 'rgba(120,190,255,0.14)', glassEdge: 'rgba(170,215,255,0.8)',
    lens: '#a8e4ff', mirror: '#eef3f8', body: '#2b3644', bodyEdge: '#93a4b6', inc: '#ffd66b', out: '#8fd3ff' };
  static MONO = "'JetBrains Mono', monospace"; static SERIF = "'Source Serif 4', serif"; static SANS = "'Source Sans 3', sans-serif";
  static LABEL = '600 13px ' + Renderer.MONO;

  // returns true while something on the canvas is still changing by itself (a notice fading)
  draw(g, bench, tool) { const v = bench.view, sc = bench.scene, res = bench.result, C = Renderer.C; this.g = g; this.v = v; this.sc = sc; this.s = v.scale; this.w = v.w; this.h = v.h;
    const hidden = bench.hidden, opts = sc.opts, sel = bench.selected, hov = bench.hoverId && bench.hoverId !== bench.selId ? sc.get(bench.hoverId) : null;
    // where words already are (to begin with: the zoom buttons, and the pointer read-out in the corner)
    this.boxes = [{ x0: this.w - 262, y0: this.h - 52, x1: this.w, y1: this.h }, { x0: 0, y0: 0, x1: 150, y1: 24 }]; this.letters = []; this.hotFocus = bench.hotFocus || null;
    // ... and where the light runs, so that a label can keep off a ray when there is a clear place for it
    // ... and where the light sources sit: a label is kept off a neighbouring source's body (a copy lands close by)
    this.bodies = []; for (const el of sc.els) { if (!el.emits) continue; const bb = el.bounds(), p = this.P({ x: bb.x0, y: bb.y1 }), q = this.P({ x: bb.x1, y: bb.y0 }); this.bodies.push({ x0: p.x, y0: p.y, x1: q.x, y1: q.y }); }
    this.lines = []; for (const sg of res.segs) { if (!sg.ref || (hidden && sg.k > 0)) continue; if (this.lines.length >= 500) break; const p = this.P(sg.a), q = this.P(sg.b); this.lines.push([p.x, p.y, q.x, q.y]); }
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    this.ground(opts.grid);
    for (const el of sc.els) if (el.glassy) this.glass(el);
    this.rays(res, hidden);
    if (opts.extend && !hidden) this.extensions(res);
    if (sel && (sel instanceof Lens || sel instanceof Mirror)) this.axis(sel);
    if (hov) this.glow(hov, 0.16); if (sel) this.glow(sel, 0.34);
    if (opts.images && !hidden) for (const im of res.images) this.imageLines(im);
    for (const el of sc.els) if (!(el instanceof Solid)) this.element(el);
    if (opts.images && !hidden) for (const im of res.images) if (im.foot) this.imagePicture(im);
    if (!hidden) this.spots(res);
    this.arrows(res, hidden);
    if (opts.angles && !hidden) this.angles(sc, res);
    const shown = opts.images && !hidden ? res.images : [];
    for (const im of shown) this.imageMark(im);
    if (sel) this.handle(sel, tool);
    this.tape(bench.measure); this.angle(bench.measure);          // (before the names, which then keep off them)
    // the words, most important first: each goes where it does not sit on one already written
    for (const im of shown) this.imageName(im);
    const L = sc.labels(); for (const el of sc.els) this.label(el, L.get(el.id), el === sel);
    for (const l of this.letters) this.put(l.str, [{ x: l.c.x, y: l.c.y + 12 }, { x: l.c.x, y: l.c.y - 12 }, { x: l.c.x + 11, y: l.c.y + 9 }, { x: l.c.x - 11, y: l.c.y + 9 }], { font: 'italic 600 14px ' + Renderer.SERIF, color: l.color, halo: 3.5 });
    if (opts.grid) this.ticks();
    const live = this.hud(bench, tool);
    g.restore(); return live; }

  P(p) { return this.v.toCanvas(p); }
  // a bench direction as a canvas direction (y flips)
  D(d) { return { x: d.x, y: -d.y }; }
  path(pts, closed) { const g = this.g; g.beginPath(); pts.forEach((p, i) => { const c = this.P(p); if (i) g.lineTo(c.x, c.y); else g.moveTo(c.x, c.y); }); if (closed) g.closePath(); }
  line(a, b) { const g = this.g; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  dot(c, r, fill, stroke) { const g = this.g; g.beginPath(); g.arc(c.x, c.y, r, 0, 2 * Math.PI); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); } }
  // text with a dark halo, so it reads over rays and grid lines alike
  text(str, x, y, o) { const g = this.g; g.font = o.font || Renderer.LABEL; g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
    g.lineWidth = o.halo || 4; g.strokeStyle = Renderer.C.halo; g.setLineDash([]); g.strokeText(str, x, y); g.fillStyle = o.color || Renderer.C.text; g.fillText(str, x, y); }

  // A label with a choice of places: the first that is clear of every label already written (and of the
  // canvas's edge) is used, or failing that the one that overlaps least.
  put(str, cands, o) { const g = this.g; g.font = o.font || Renderer.LABEL; const tw = g.measureText(str).width, th = 16; let best = null, least = Infinity;
    for (let i = 0; i < cands.length; i++) { const c = cands[i]; let x0 = c.align === 'left' ? c.x : c.align === 'right' ? c.x - tw : c.x - tw / 2;
      // (a label that would run off the side is slid back on, at a small price)
      const slid = Math.max(5, Math.min(this.w - tw - 5, x0)), slip = Math.abs(slid - x0); x0 = slid; const box = { x0: x0 - 3, y0: c.y - th / 2, x1: x0 + tw + 3, y1: c.y + th / 2, tx: x0 };
      let cost = i * 0.01 + 0.5 * slip + 60 * (Math.max(0, 2 - box.y0) + Math.max(0, box.y1 - this.h + 2));
      for (const b of this.boxes) { const ox = Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0), oy = Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0); if (ox > 0 && oy > 0) cost += ox * oy; }
      for (const b of this.bodies) { const ox = Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0), oy = Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0); if (ox > 0 && oy > 0) cost += 0.6 * ox * oy; }
      if (cost < least) for (const l of this.lines) { cost += 1.2 * Renderer.within(l, box.x0, box.y0 + 2, box.x1, box.y1 - 2); if (cost >= least) break; }
      if (cost < least) { least = cost; best = { c, box }; } if (cost < 0.5) break; }
    this.boxes.push(best.box); this.text(str, best.box.tx, best.c.y, { ...o, align: 'left' }); }
  // how much of the line [ax, ay, bx, by] lies inside a box, in pixels
  static within(l, x0, y0, x1, y1) { const dx = l[2] - l[0], dy = l[3] - l[1]; let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, l[0] - x0], [dx, x1 - l[0]], [-dy, l[1] - y0], [dy, y1 - l[1]]]) { if (p === 0) { if (q < 0) return 0; continue; } const r = q / p; if (p < 0) { if (r > t1) return 0; if (r > t0) t0 = r; } else { if (r < t0) return 0; if (r < t1) t1 = r; } }
    return (t1 - t0) * Math.hypot(dx, dy); }
  taken(x0, y0, x1, y1) { return this.boxes.slice(2).some((b) => b.x0 < x1 && b.x1 > x0 && b.y0 < y1 && b.y1 > y0); }
  keep(c, r) { this.boxes.push({ x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r }); }

  // ---- the bench itself ----
  gridSteps() { for (const [minor, major] of [[1, 5], [5, 10], [10, 50], [50, 100]]) if (minor * this.s >= 12) return { minor, major }; return { minor: 100, major: 100 }; }
  ground(grid) { const g = this.g, C = Renderer.C, a = this.P({ x: BOARD.x0, y: BOARD.y1 }), b = this.P({ x: BOARD.x1, y: BOARD.y0 }), vis = this.v.visible;
    g.fillStyle = C.off; g.fillRect(0, 0, this.w, this.h); g.fillStyle = C.bg; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    if (grid) { const { minor, major } = this.gridSteps(), x0 = Math.max(BOARD.x0, vis.x0), x1 = Math.min(BOARD.x1, vis.x1), y0 = Math.max(BOARD.y0, vis.y0), y1 = Math.min(BOARD.y1, vis.y1);
      const top = this.P({ x: 0, y: y1 }).y, bot = this.P({ x: 0, y: y0 }).y, left = this.P({ x: x0, y: 0 }).x, right = this.P({ x: x1, y: 0 }).x;
      for (const pass of [0, 1, 2]) { g.beginPath(); g.lineWidth = 1; g.strokeStyle = [C.grid, C.major, C.axis][pass];
        for (let x = Math.ceil(x0 / minor) * minor; x <= x1 + 1e-9; x += minor) { const k = x === 0 ? 2 : Math.abs(x / major - Math.round(x / major)) < 1e-9 ? 1 : 0; if (k !== pass) continue; const X = Math.round(this.P({ x, y: 0 }).x) + 0.5; g.moveTo(X, top); g.lineTo(X, bot); }
        for (let y = Math.ceil(y0 / minor) * minor; y <= y1 + 1e-9; y += minor) { const k = y === 0 ? 2 : Math.abs(y / major - Math.round(y / major)) < 1e-9 ? 1 : 0; if (k !== pass) continue; const Y = Math.round(this.P({ x: 0, y }).y) + 0.5; g.moveTo(left, Y); g.lineTo(right, Y); }
        g.stroke(); } }
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1; g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
  // the numbers along the bottom and left edges (drawn late, with halos, so light never hides them)
  ticks() { const C = Renderer.C, vis = this.v.visible; let { major } = this.gridSteps(); while (major * this.s < 38) major *= 2; const o = { font: '500 11px ' + Renderer.MONO, color: C.tick, halo: 3 };
    for (let x = Math.ceil(Math.max(BOARD.x0, vis.x0) / major) * major; x <= Math.min(BOARD.x1, vis.x1); x += major) { const X = this.P({ x, y: 0 }).x; if (X < 34 || X > this.w - 274 || this.taken(X - 14, this.h - 16, X + 14, this.h - 2)) continue; this.text(Fmt.num(x, 0), X, this.h - 9, o); }
    for (let y = Math.ceil(Math.max(BOARD.y0, vis.y0) / major) * major; y <= Math.min(BOARD.y1, vis.y1); y += major) { const Y = this.P({ x: 0, y }).y; if (Y < 24 || Y > this.h - 22 || this.taken(4, Y - 7, 30, Y + 7)) continue; this.text(Fmt.num(y, 0), 6, Y, { ...o, align: 'left' }); }
    this.text('cm', 6, this.h - 9, { ...o, align: 'left' }); }

  // ---- light ----
  // Rays are added to what is under them, so eleven colours on one line make white and a
  // prism's fan shows each colour where they part. One stroke per colour and brightness.
  rays(res, hidden) { const g = this.g, groups = new Map();
    for (const sg of res.segs) { if (hidden && sg.k > 0) continue; const a = Math.round(Math.max(0.2, Math.min(1, Math.sqrt(sg.I))) * 8) / 8, key = (sg.white ? 'w' : 'm') + sg.nm + '|' + a;
      let grp = groups.get(key); if (!grp) groups.set(key, (grp = { css: sg.white ? Spectrum.partCss(sg.nm, a) : Spectrum.css(sg.nm, a), segs: [] })); grp.segs.push(sg); }
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = 1.7; g.setLineDash([]);
    for (const grp of groups.values()) { g.strokeStyle = grp.css; g.beginPath(); for (const sg of grp.segs) { const a = this.P(sg.a), b = this.P(sg.b); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); } g.stroke(); }
    g.restore(); }
  // a small arrowhead on each stretch of a ray's reference colour: which way the light is going
  arrows(res, hidden) { const g = this.g, put = [];
    for (const sg of res.segs) { if (!sg.ref || !sg.main || (hidden && sg.k > 0)) continue; const a = this.P(sg.a), b = this.P(sg.b), len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 46) continue;
      const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, fan = sg.k === 0 && (this.sc.get(sg.src) instanceof Lamp || this.sc.get(sg.src) instanceof Figure), t = Math.min(len / 2, fan ? 104 : 44), c = { x: a.x + u.x * t, y: a.y + u.y * t };       // (out where a lamp's rays have parted)
      if (c.x < -8 || c.y < -8 || c.x > this.w + 8 || c.y > this.h + 8) continue;
      if (put.some((q) => Math.abs(q.x - c.x) < 8.5 && Math.abs(q.y - c.y) < 8.5)) continue; put.push(c);      // (rays that have barely parted share one)
      g.fillStyle = sg.white ? 'rgba(255,255,255,0.95)' : Spectrum.css(sg.nm, 1); g.beginPath(); g.moveTo(c.x + u.x * 5.5, c.y + u.y * 5.5); g.lineTo(c.x - u.x * 3.5 - u.y * 3.6, c.y - u.y * 3.5 + u.x * 3.6); g.lineTo(c.x - u.x * 3.5 + u.y * 3.6, c.y - u.y * 3.5 - u.x * 3.6); g.closePath(); g.fill(); } }
  // "Extended rays": each bent ray carried backwards, dashed, to show where it seems to come from
  extensions(res) { const g = this.g; g.save(); g.strokeStyle = 'rgba(255,214,107,0.34)'; g.lineWidth = 1; g.setLineDash([4, 5]); g.beginPath();
    for (const p of res.paths) for (let k = 1; k < p.dirs.length; k++) { const a = this.P(p.pts[k]), b = this.P(V.at(p.pts[k], p.dirs[k], -400)); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
    g.stroke(); g.restore(); }
  spots(res) { const g = this.g; g.save(); g.globalCompositeOperation = 'lighter';
    for (const sp of res.spots) { const c = this.P(sp.q); this.dot(c, 3.2, sp.white ? Spectrum.partCss(sp.nm, 1) : Spectrum.css(sp.nm, 1)); }
    g.restore(); }

  // ---- elements ----
  glass(el) { const g = this.g, C = Renderer.C; this.path(el.outline().pts, true); g.fillStyle = C.glass; g.fill(); g.strokeStyle = C.glassEdge; g.lineWidth = 1.3; g.setLineDash([]); g.stroke(); }
  // a soft gold band along an element: it is selected (or the pointer is on it)
  glow(el, alpha) { const g = this.g, o = el.outline(); this.path(o.pts, o.closed); g.setLineDash([]); g.strokeStyle = 'rgba(240,200,96,' + alpha + ')';
    g.lineWidth = o.closed ? 5 : Math.max(11, 2 * el.pad * this.s + 9); g.stroke(); }
  axis(el) { const g = this.g, a = this.P(V.at(el.pos, el.dir, -600)), b = this.P(V.at(el.pos, el.dir, 600)); g.save(); g.strokeStyle = 'rgba(255,255,255,0.24)'; g.lineWidth = 1; g.setLineDash([7, 5]); this.line(a, b); g.restore(); }
  element(el) { if (el instanceof Lens) this.lens(el); else if (el instanceof Mirror) this.mirror(el); else if (el instanceof Screen) this.screen(el); else if (el instanceof Laser) this.laser(el); else if (el instanceof Beam) this.beam(el); else if (el instanceof Lamp) this.lamp(el); else if (el instanceof Figure) this.figure(el); }
  // a focal point; the one under the pointer (or being dragged) is drawn larger, ringed in gold, to show it can be pulled
  focal(p, letter, color, el, k) { const c = this.P(p); if (c.x < -20 || c.y < -20 || c.x > this.w + 20 || c.y > this.h + 20) return; const hf = this.hotFocus;
    if (hf && el && hf.id === el.id && hf.k === k) { this.g.save(); this.g.lineWidth = 1.6; this.g.shadowColor = 'rgba(240,200,96,0.8)'; this.g.shadowBlur = 8; this.dot(c, 5.5, color, Renderer.C.gold); this.g.restore(); } else this.dot(c, 2.6, color); this.keep(c, 4); this.letters.push({ str: letter, c, color }); }

  lens(el) { if (el.real) { this.focal(V.at(el.pos, el.dir, el.f), 'F', Renderer.C.lens, el, 1); this.focal(V.at(el.pos, el.dir, -el.f), 'F', Renderer.C.lens, el, -1); return; }
    const g = this.g, C = Renderer.C, [e0, e1] = el.ends.map((p) => this.P(p)), d = this.D(el.dir), t = this.D(el.across), mid = this.P(el.pos), len = Math.hypot(e1.x - e0.x, e1.y - e0.y);
    const bw = Math.max(3.5, Math.min(10, len * 0.085)), at = (p, a, b) => ({ x: p.x + d.x * a + t.x * b, y: p.y + d.y * a + t.y * b });
    g.setLineDash([]); g.beginPath();
    if (el.converging) { const c1 = at(mid, 2 * bw, 0), c2 = at(mid, -2 * bw, 0); g.moveTo(e0.x, e0.y); g.quadraticCurveTo(c1.x, c1.y, e1.x, e1.y); g.quadraticCurveTo(c2.x, c2.y, e0.x, e0.y); }
    else { const k = 3 - bw, a = at(e0, -bw, 0), b = at(e0, bw, 0), c = at(e1, bw, 0), e = at(e1, -bw, 0), c1 = at(mid, k, 0), c2 = at(mid, -k, 0);
      g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.quadraticCurveTo(c1.x, c1.y, c.x, c.y); g.lineTo(e.x, e.y); g.quadraticCurveTo(c2.x, c2.y, a.x, a.y); }
    g.fillStyle = 'rgba(120,200,255,0.16)'; g.fill(); g.strokeStyle = 'rgba(168,228,255,0.45)'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = C.lens; g.lineWidth = 1.8; this.line(e0, e1);
    // the ray-diagram symbol: arrowheads pointing out for a converging lens, in for a diverging one
    const head = (e, sign) => { const s = el.converging ? -1 : 1, a = at(e, 5, sign * s * 7), b = at(e, -5, sign * s * 7); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(e.x, e.y); g.lineTo(b.x, b.y); g.stroke(); };
    head(e0, -1); head(e1, 1);
    this.focal(V.at(el.pos, el.dir, el.f), 'F', C.lens, el, 1); this.focal(V.at(el.pos, el.dir, -el.f), 'F', C.lens, el, -1); }

  mirror(el) { const g = this.g, C = Renderer.C, o = el.outline().pts.map((p) => this.P(p)), N = this.D(el.dir), a = el.sphere ? el.arc : null, cc = a ? this.P(a.c) : null; g.setLineDash([]);
    // the hatching on the side that does not reflect
    const back = (c) => { if (!a) return { x: -N.x, y: -N.y }; const r = Math.hypot(c.x - cc.x, c.y - cc.y) || 1; return { x: -a.sign * (c.x - cc.x) / r, y: -a.sign * (c.y - cc.y) / r }; };
    g.strokeStyle = 'rgba(200,214,228,0.5)'; g.lineWidth = 1; g.beginPath(); let run = 3.5;
    for (let i = 0; i + 1 < o.length; i++) { const p = o[i], q = o[i + 1], l = Math.hypot(q.x - p.x, q.y - p.y), u = { x: (q.x - p.x) / (l || 1), y: (q.y - p.y) / (l || 1) };
      for (; run < l; run += 7) { const c = { x: p.x + u.x * run, y: p.y + u.y * run }, b = back(c); g.moveTo(c.x, c.y); g.lineTo(c.x + b.x * 5.5 + u.x * 3, c.y + b.y * 5.5 + u.y * 3); } run -= l; }
    g.stroke();
    g.strokeStyle = C.mirror; g.lineWidth = 2.4; g.beginPath(); o.forEach((p, i) => { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
    // an ideal curved mirror is drawn flat (that is where it reflects), with its ends curled the way the real one curves
    if (el.curved && !el.sphere) { const e0 = o[0], e1 = o[o.length - 1], l = Math.hypot(e1.x - e0.x, e1.y - e0.y) || 1, u = { x: (e1.x - e0.x) / l, y: (e1.y - e0.y) / l }, k = el.f > 0 ? 1 : -1;
      g.moveTo(e0.x, e0.y); g.quadraticCurveTo(e0.x - u.x * 5, e0.y - u.y * 5, e0.x - u.x * 6 + N.x * k * 7, e0.y - u.y * 6 + N.y * k * 7); g.moveTo(e1.x, e1.y); g.quadraticCurveTo(e1.x + u.x * 5, e1.y + u.y * 5, e1.x + u.x * 6 + N.x * k * 7, e1.y + u.y * 6 + N.y * k * 7); }
    g.stroke();
    if (el.curved) { this.focal(V.at(el.pos, el.dir, el.f), 'F', C.mirror, el, 1); this.focal(V.at(el.pos, el.dir, 2 * el.f), 'C', 'rgba(238,243,248,0.7)', el, 2); } }

  screen(el) { const g = this.g, [e0, e1] = el.ends.map((p) => this.P(p)), N = this.D(el.dir); g.setLineDash([]);
    g.strokeStyle = '#4a5868'; g.lineWidth = 4; g.lineCap = 'butt'; this.line({ x: e0.x - N.x * 3, y: e0.y - N.y * 3 }, { x: e1.x - N.x * 3, y: e1.y - N.y * 3 });
    g.strokeStyle = '#dfe6ee'; g.lineWidth = 2.6; this.line(e0, e1); g.lineCap = 'round'; }

  box(el, x0, x1, hw) { this.path([{ x: x0, y: -hw }, { x: x1, y: -hw }, { x: x1, y: hw }, { x: x0, y: hw }].map((p) => el.toWorld(p)), true); }
  colour(el) { return el.white ? '#ffffff' : Spectrum.css(el.nm, 1); }
  laser(el) { const g = this.g, C = Renderer.C; g.setLineDash([]); this.box(el, -7, 0, 1.3); g.fillStyle = C.body; g.fill(); g.strokeStyle = C.bodyEdge; g.lineWidth = 1.2; g.stroke();
    this.box(el, -1.3, 0, 1.3); g.fillStyle = this.colour(el); g.fill(); }
  beam(el) { const g = this.g, C = Renderer.C, hw = el.width / 2 + 0.6; g.setLineDash([]); this.box(el, -1.6, 0, hw); g.fillStyle = C.body; g.fill(); g.strokeStyle = C.bodyEdge; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = this.colour(el); g.lineWidth = 2; this.line(this.P(el.toWorld({ x: 0, y: -el.width / 2 })), this.P(el.toWorld({ x: 0, y: el.width / 2 }))); }
  lamp(el) { const g = this.g, c = this.P(el.pos), r = Math.max(4.5, 1.5 * this.s), col = el.white ? [255, 244, 214] : Spectrum.rgb(el.nm).map((x) => Math.round(x * 255));
    const grd = g.createRadialGradient(c.x, c.y, r * 0.4, c.x, c.y, r * 2.6); grd.addColorStop(0, 'rgba(' + col + ',0.5)'); grd.addColorStop(1, 'rgba(' + col + ',0)');
    this.dot(c, r * 2.6, grd); g.setLineDash([]); g.lineWidth = 1.2; this.dot(c, r, 'rgb(' + col + ')', 'rgba(255,255,255,0.85)'); }

  // ---- objects and their images ----
  // An object's picture, standing on `foot`: `up` runs from its foot to its tip (its length is the height)
  // and `fwd` is the way it faces, as long as `up`. In bench coordinates; `o.alpha` and `o.dash` for images.
  picture(kind, foot, up, fwd, o) { const g = this.g, at = (u, v) => this.P({ x: foot.x + fwd.x * u + up.x * v, y: foot.y + fwd.y * u + up.y * v });
    const poly = (pts, fill, stroke, w) => { g.beginPath(); pts.forEach(([u, v], i) => { const c = at(u, v); if (i) g.lineTo(c.x, c.y); else g.moveTo(c.x, c.y); }); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = w || 1.2; g.stroke(); } };
    const blob = (cu, cv, ru, rv, fill, stroke) => { const pts = []; for (let i = 0; i < 18; i++) { const a = 2 * Math.PI * i / 18; pts.push([cu + ru * Math.cos(a), cv + rv * Math.sin(a)]); } poly(pts, fill, stroke, 1.1); };
    g.save(); g.globalAlpha = o.alpha == null ? 1 : o.alpha; g.setLineDash(o.dash ? [4, 3] : []); g.lineJoin = 'round';
    const px = Math.hypot(up.x, up.y) * this.s;           // the height on the canvas
    if (kind === 'arrow') { const a = at(0, 0), b = at(0, 1), hl = Math.min(10, Math.max(4, 0.3 * px)) / (px || 1), hw = 0.62 * hl;
      g.strokeStyle = o.color; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); const n = at(0, 1 - hl * 0.6); g.lineTo(n.x, n.y); g.stroke();
      g.setLineDash([]); poly([[0, 1], [-hw, 1 - hl], [hw, 1 - hl]], o.dash ? null : o.color, o.color, 1.6);
      if (o.foot) this.dot(a, 2.6, o.color); }
    else if (kind === 'tree') { poly([[-0.05, 0], [0.05, 0], [0.05, 0.16], [-0.05, 0.16]], '#8a5a2b', '#5e3c1c');
      for (const [y0, y1, w] of [[0.14, 0.5, 0.3], [0.36, 0.72, 0.24], [0.58, 0.92, 0.17]]) poly([[-w, y0], [w, y0], [0, y1]], '#3e9c57', '#1f5e32');
      const st = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.035 : 0.08, a = Math.PI / 2 + Math.PI * i / 5; st.push([r * Math.cos(a), 0.92 + r * Math.sin(a)]); } poly(st, '#f0c860', '#a8760f', 1); }
    else if (kind === 'dog') { const fur = '#c8955a', edge = '#6e4a24';
      for (const u of [-0.7, -0.56, -0.08, 0.06]) poly([[u - 0.045, 0], [u + 0.045, 0], [u + 0.045, 0.36], [u - 0.045, 0.36]], fur, edge);
      poly([[-0.76, 0.54], [-0.86, 0.8], [-0.82, 0.82], [-0.7, 0.58]], fur, edge);                                     // tail
      blob(-0.32, 0.45, 0.46, 0.15, fur, edge);                                                                          // body
      poly([[0.02, 0.5], [0.16, 0.5], [0.22, 0.68], [0.08, 0.7]], fur, edge);                                           // neck
      blob(0.16, 0.76, 0.14, 0.13, fur, edge); poly([[0.2, 0.68], [0.36, 0.7], [0.36, 0.78], [0.22, 0.82]], fur, edge); // head and snout
      poly([[0.06, 0.82], [0.0, 1.0], [0.13, 0.86]], '#8a5e33', edge);                                                 // ear
      const eye = at(0.2, 0.79), nose = at(0.36, 0.74); g.setLineDash([]); this.dot(eye, Math.max(1, 0.025 * px), '#2a1a0c'); this.dot(nose, Math.max(1.2, 0.03 * px), '#2a1a0c'); }
    g.restore(); }
  figure(el) { const up = V.mul(el.across, el.height), fwd = V.mul(el.dir, el.height); this.picture(el.picture, el.pos, up, fwd, { color: el.white ? '#eef3f8' : Spectrum.css(el.nm, 1), foot: true }); }
  // the image of a whole object: turned (lens, two mirrors) or mirrored (one mirror), stretched by m
  imagePicture(im) { const el = this.sc.get(im.src); if (!(el instanceof Figure)) return; const up = V.sub(im.p, im.foot), len = V.len(up); if (len < 1e-6) return;
    const u = V.mul(up, 1 / len), side = im.tilt < 0 ? V.left(u) : { x: u.y, y: -u.x }, fwd = V.mul(side, len), real = im.kind === 'real';
    this.picture(el.picture, im.foot, up, fwd, { color: Renderer.C.gold, alpha: real ? 0.8 : 0.45, dash: !real }); }

  // ---- what the View menu adds ----
  // the angle between a surface's normal and the ray on each side of it, for single rays (lasers)
  angles(sc, res) { const g = this.g, C = Renderer.C, lasers = new Set(sc.els.filter((e) => e instanceof Laser).map((e) => e.id)), notes = [];
    g.save();
    for (const p of res.paths) { if (!lasers.has(p.src)) continue;
      for (const h of p.hits.slice(0, 10)) { if (h.th1 == null || !['refract', 'reflect', 'tir'].includes(h.how) || (h.th1 < 0.5 && h.th2 < 0.5)) continue;
        const q = this.P(h.q), N = this.D(h.N), din = this.D(h.din), dout = h.dout ? this.D(h.dout) : null, L = 50;
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.setLineDash([4, 4]); this.line({ x: q.x - N.x * L, y: q.y - N.y * L }, { x: q.x + N.x * L, y: q.y + N.y * L });
        const wedge = (nrm, ray, r, col, val) => { const aN = Math.atan2(nrm.y, nrm.x), aR = Math.atan2(ray.y, ray.x); let dl = aR - aN; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI;
          g.setLineDash([]); g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.arc(q.x, q.y, r, aN, aN + dl, dl < 0); g.stroke();
          const al = Math.abs(dl) >= 0.34 ? aN + dl / 2 : aR + (dl < 0 ? -1 : 1) * 0.3; notes.push({ str: Fmt.deg(val), at: [21, 37, 53].map((k) => ({ x: q.x + Math.cos(al) * (r + k), y: q.y + Math.sin(al) * (r + k) })), col }); };
        wedge(N, { x: -din.x, y: -din.y }, 24, C.inc, h.th1);
        if (dout) { if (h.how === 'refract') wedge({ x: -N.x, y: -N.y }, dout, 24, C.out, h.th2); else wedge(N, dout, 30, C.inc, h.th2); } } }
    g.restore(); for (const n of notes) this.put(n.str, n.at, { font: '600 12px ' + Renderer.MONO, color: n.col }); }       // (farther out along its own arc's middle if the near place is taken)

  // a virtual image: the dashed lines back from the rays that seem to come from it
  imageLines(im) { if (im.kind !== 'virtual') return; const g = this.g, n = im.rays.length, step = Math.max(1, Math.ceil(n / 9)), c = this.P(im.p); g.save(); g.strokeStyle = 'rgba(240,200,96,0.42)'; g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath();
    for (let i = 0; i < n; i += step) { const a = this.P(im.rays[i].from); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); } g.stroke(); g.restore(); }
  // off the canvas, an image is marked by an arrow at the edge, pointing to it
  imageEdge(im) { const c = this.P(im.p); if (!(c.x < 4 || c.y < 4 || c.x > this.w - 4 || c.y > this.h - 4)) return null;
    const m = 16, e = { x: Math.max(m, Math.min(this.w - m, c.x)), y: Math.max(m + 14, Math.min(this.h - m - 14, c.y)) }, l = Math.hypot(c.x - e.x, c.y - e.y) || 1; return { e, u: { x: (c.x - e.x) / l, y: (c.y - e.y) / l } }; }
  imageMark(im) { const g = this.g, C = Renderer.C, c = this.P(im.p), edge = this.imageEdge(im); g.setLineDash([]);
    if (edge) { const { e, u } = edge; g.fillStyle = C.gold; g.beginPath(); g.moveTo(e.x + u.x * 8, e.y + u.y * 8); g.lineTo(e.x - u.x * 4 - u.y * 5.5, e.y - u.y * 4 + u.x * 5.5); g.lineTo(e.x - u.x * 4 + u.y * 5.5, e.y - u.y * 4 - u.x * 5.5); g.closePath(); g.fill(); this.keep(e, 9); return; }
    // an object's image is marked by its picture: keep labels off the whole of it
    if (im.foot) { const f = this.P(im.foot); for (let i = 0; i <= 4; i++) this.keep({ x: f.x + (c.x - f.x) * i / 4, y: f.y + (c.y - f.y) * i / 4 }, 6); return; }
    if (im.kind === 'real') { g.lineWidth = 1.2; this.dot(c, 7.5, null, 'rgba(240,200,96,0.55)'); this.dot(c, 4, C.gold); }
    else { g.lineWidth = 1.8; this.dot(c, 5.5, 'rgba(15,23,34,0.85)', C.gold); }
    this.keep(c, 9); }
  imageName(im) { const c = this.P(im.p), name = (im.focus ? 'Focus ' : 'Image ') + im.no, o = { font: Renderer.LABEL, color: Renderer.C.gold }, edge = this.imageEdge(im);
    if (edge) { const { e, u } = edge, right = e.x > this.w / 2, x = e.x + (right ? -12 : 12) - u.x * 4, align = right ? 'right' : 'left'; this.put(name + ' is off screen', [{ x, y: e.y - u.y * 16, align }, { x, y: e.y - 18, align }, { x, y: e.y + 18, align }], o); return; }
    // past the tip of an object's image, along the way it points
    if (im.foot) { const f = this.P(im.foot), l = Math.hypot(c.x - f.x, c.y - f.y) || 1, u = { x: (c.x - f.x) / l, y: (c.y - f.y) / l };
      this.put(name, [{ x: c.x + u.x * 16, y: c.y + u.y * 16 }, { x: c.x + u.x * 16 + 30, y: c.y + u.y * 16 }, { x: c.x + u.x * 16 - 30, y: c.y + u.y * 16 }, { x: f.x - u.x * 16, y: f.y - u.y * 16 }, { x: c.x + 14, y: (c.y + f.y) / 2, align: 'left' }], o); return; }
    this.put(name, [{ x: c.x, y: c.y - 18 }, { x: c.x, y: c.y + 19 }, { x: c.x + 13, y: c.y - 1, align: 'left' }, { x: c.x - 13, y: c.y - 1, align: 'right' }, { x: c.x, y: c.y - 34 }, { x: c.x, y: c.y + 35 }], o); }

  // ---- the selection ----
  handle(el, tool) { const g = this.g, C = Renderer.C, a = this.P(el.toWorld(el.grip)), h = this.P(tool.handle(el)); g.setLineDash([]); g.strokeStyle = 'rgba(240,200,96,0.7)'; g.lineWidth = 1.2; this.line(a, h);
    g.lineWidth = 1.6; this.dot(h, tool.overHandle || tool.turning ? 7 : 6, C.gold, '#0f1722');
    if (tool.turning === el) this.text(Fmt.deg(el.angle), h.x, h.y - 18, { font: Renderer.LABEL, color: C.gold }); }

  // "Lens 1  f = 20 cm", under the element
  label(el, name, selected) { const b = el.bounds(), c = this.P({ x: (b.x0 + b.x1) / 2, y: b.y0 }), str = name + (el.tag ? '  ' + el.tag : ''); if (c.x < -60 || c.x > this.w + 60 || c.y > this.h + 4 || c.y < -30) return;
    const top = this.P({ x: (b.x0 + b.x1) / 2, y: b.y1 }), under = { x: c.x, y: c.y + 15 }, over = { x: c.x, y: top.y - 13 }, cands = [under, over, { x: c.x, y: c.y + 32 }, { x: c.x, y: top.y - 30 }];
    // a light source is named behind it, out of its own light, when there is room
    if (el.emits) { const d = this.D(el.dir), l = this.P({ x: b.x0, y: b.y0 }).x, r = this.P({ x: b.x1, y: b.y0 }).x, my = (c.y + top.y) / 2;
      if (Math.abs(d.x) >= 0.5) cands.unshift(d.x > 0 ? { x: l - 8, y: my, align: 'right' } : { x: r + 8, y: my, align: 'left' }); else if (d.y > 0) cands.unshift(over); }
    this.put(str, cands, { color: selected ? '#f6e3ad' : Renderer.C.text }); }

  // ---- the measuring tools ----
  // a tape measure: a band with centimetre marks, its case at one end and its hook at the other
  tape(m) { const t = m.tape; if (!t) return; const g = this.g, a = this.P(t.a), b = this.P(t.b), len = Math.hypot(b.x - a.x, b.y - a.y), L = m.length;
    const u = len > 1e-9 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: 1, y: 0 }, n = { x: -u.y, y: u.x };
    g.save(); g.setLineDash([]); g.lineCap = 'butt'; g.strokeStyle = 'rgba(232,192,70,0.92)'; g.lineWidth = 9; this.line(a, b);
    // the marks: every centimetre if they are far enough apart, else every 5 or 10; longer every 5 and 10
    let step = 1; while (step * this.s < 5) step = step === 1 ? 5 : step * 2; g.strokeStyle = 'rgba(40,30,10,0.85)'; g.lineWidth = 1; g.beginPath();
    for (let d = 0; d <= L + 1e-9; d += step) { const k = Math.round(d), big = k % 10 === 0 ? 7 : k % 5 === 0 ? 5 : 3, c = { x: a.x + u.x * d * this.s, y: a.y + u.y * d * this.s }; g.moveTo(c.x + n.x * 4.5, c.y + n.y * 4.5); g.lineTo(c.x + n.x * (4.5 - big), c.y + n.y * (4.5 - big)); }
    g.stroke();
    // the case (at a) and the hook (at b): both can be dragged
    g.fillStyle = '#d9a520'; g.strokeStyle = '#3a2a08'; g.lineWidth = 1.4; g.beginPath(); if (g.roundRect) g.roundRect(a.x - 8, a.y - 8, 16, 16, 4); else g.rect(a.x - 8, a.y - 8, 16, 16); g.fill(); g.stroke(); this.dot(a, 2.5, '#3a2a08');
    g.lineWidth = 3; g.strokeStyle = '#3a2a08'; this.line({ x: b.x + n.x * 6, y: b.y + n.y * 6 }, { x: b.x - n.x * 6, y: b.y - n.y * 6 }); g.restore();
    for (let i = 0; i <= Math.ceil(len / 12); i++) { const f = Math.min(1, i * 12 / (len || 1)); this.keep({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, 7); } this.keep(a, 9);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, o = { font: '700 13px ' + Renderer.MONO, color: '#f6dc8c' };
    this.put(Fmt.fix(L, 1) + ' cm', [{ x: mid.x - n.x * 17, y: mid.y - n.y * 17 }, { x: mid.x + n.x * 17, y: mid.y + n.y * 17 }, { x: mid.x - n.x * 32, y: mid.y - n.y * 32 }, { x: mid.x + n.x * 32, y: mid.y + n.y * 32 }], o); }
  // the picked lines, carried on (dashed) to where they meet, and the angle between them there
  angle(m) { if (!m.angleOn) return; const g = this.g, lines = m.fresh(), A = m.angle, col = '#7fe0ff'; g.save(); g.setLineDash([]); g.lineCap = 'round';
    for (const l of lines) { g.strokeStyle = 'rgba(127,224,255,0.9)'; g.lineWidth = 3; this.line(this.P(l.a), this.P(l.b)); this.dot(this.P(l.at), 3.5, col); }
    if (A && A.at) { const c = this.P(A.at), r = 30;
      g.strokeStyle = 'rgba(127,224,255,0.55)'; g.lineWidth = 1.2; g.setLineDash([4, 4]); for (const l of lines) this.line(c, this.P(l.at)); g.setLineDash([]);
      const a0 = Math.atan2(-A.u.y, A.u.x), a1 = Math.atan2(-A.w.y, A.w.x); let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(c.x, c.y, r, a0, a0 + d, d < 0); g.stroke(); this.dot(c, 2.5, col); g.restore();
      const mid = a0 + d / 2; this.put(Fmt.deg(A.deg), [r + 20, r + 36, r + 52].map((k) => ({ x: c.x + Math.cos(mid) * k, y: c.y + Math.sin(mid) * k })), { font: '700 13px ' + Renderer.MONO, color: col }); return; }
    g.restore(); }

  // ---- the corners: where the pointer is, hints and notices ----
  hud(bench, tool) { const g = this.g, C = Renderer.C, mv = tool.moving, p = mv ? mv.pos : tool.pointer, small = { font: '500 12px ' + Renderer.MONO, color: C.dim, align: 'left', halo: 3.5 }; let live = false;
    if (p) this.text((mv ? 'at ' : '') + '(' + Fmt.fix(p.x, 1) + ', ' + Fmt.fix(p.y, 1) + ') cm', 10, 14, { ...small, color: mv ? C.gold : C.dim });
    if (bench.hidden) this.text('Rays hidden: predict, then press Show rays', this.w - 10, 14, { ...small, align: 'right', color: C.gold });
    if (bench.scene.isEmpty) { this.text('The bench is empty.', this.w / 2, this.h / 2 - 12, { font: '600 15px ' + Renderer.SANS, color: C.text }); this.text('Use + Add Element to put a light source on it, or pick a preset.', this.w / 2, this.h / 2 + 12, { font: '500 13px ' + Renderer.SANS, color: C.dim }); }
    else if (!bench.scene.sources.length) this.text('No light yet: add a light source.', this.w / 2, 34, { font: '600 13px ' + Renderer.SANS, color: C.gold });
    const m = bench.measure;
    if (m.angleOn) { const A = m.angle, k = m.fresh().length;
      this.text(A ? (A.at ? 'Angle between the lines: ' + Fmt.deg(A.deg) + ' (' + Fmt.deg(A.other) + ' on the other side)' : 'The lines are parallel') : 'Angle: click a ray or a flat surface (' + k + ' of 2)', 10, 34, { ...small, color: '#7fe0ff' }); }
    const n = bench.notice;
    if (n) { const age = Date.now() - n.at, life = 2600 + 35 * Math.max(0, n.text.length - 40); if (age >= life) bench.notice = null;
      else { const alpha = Math.min(1, (life - age) / 400); live = true; g.save(); g.globalAlpha = alpha; g.font = '600 13px ' + Renderer.SANS; const tw = Math.min(this.w - 40, g.measureText(n.text).width + 26), x = (this.w - tw) / 2, y = this.h - 62;
        g.fillStyle = 'rgba(15,23,34,0.94)'; g.strokeStyle = 'rgba(240,200,96,0.7)'; g.lineWidth = 1; g.setLineDash([]); g.beginPath(); if (g.roundRect) g.roundRect(x, y, tw, 30, 8); else g.rect(x, y, tw, 30); g.fill(); g.stroke();
        g.fillStyle = '#f3e3b3'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.text, this.w / 2, y + 15.5, tw - 16); g.restore(); } }
    return live; }
}
