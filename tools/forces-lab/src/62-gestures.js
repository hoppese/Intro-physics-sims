// =====================================================================
// PointerTool -- what a press, a drag and a release on the canvas mean.
// A pointer position is { sx, sy, x, y, coarse, shift }: canvas pixels, bench metres.
//   press an element and drag        move it (a block settles onto a surface or block it is dropped on;
//                                    Shift places it freely). Moving anything puts the clock back to zero.
//   press a gold handle and drag     a surface: turn it and stretch it; an applied force: aim it
//   press the bench and drag         pan the view
//   press without dragging           select / deselect
//   while joining (Rope, Spring, Applied force): a click picks what to join; a click on nothing gives up
//   the tape measure and angle tool work as in Optics Lab (see Measure)
// =====================================================================
class PointerTool {
  static HANDLE = 22;
  constructor(bench) { this.b = bench; this.mode = null; this.start = null; this.moved = false; this.el = 0; this.off = null; this.last = null; this.pointer = null; this.overHandle = false; this.touches = new Map(); this.pinch = null; }

  // the selected element's gold handle (a surface's far end, an applied force's tail), or null.
  // A force's handle shows only at the set-up: once the clock runs the block has moved away from it
  handle(el) { if (el instanceof Surface) { const g = this.grip(el); return V.at(g.end, g.out, PointerTool.HANDLE / this.b.view.scale); }
    if (el instanceof Push) { if (this.b.time > 0) return null; const pts = el.path(); return pts.length ? V.at(pts[0], V.polar(el.angle), -PointerTool.HANDLE / this.b.view.scale) : null; } return null; }
  // A surface is held by its high end and turns about the other (level, by its far end b). While it is being
  // turned, by the end away from the one it turns about.
  grip(el) { const byA = this.mode === 'turn' && this.pivot && this.el === el.id ? V.dist(el.a, this.pivot) > V.dist(el.b, this.pivot) : el.dir.y < -1e-9;
    return byA ? { end: el.a, pivot: el.b, out: V.mul(el.dir, -1) } : { end: el.b, pivot: el.a, out: el.dir }; }
  onHandle(p) { const el = this.b.selected; if (!el) return false; const h = this.handle(el); if (!h) return false; const c = this.b.view.toCanvas(h); return Math.hypot(c.x - p.sx, c.y - p.sy) <= (p.coarse ? 18 : 10); }
  // where a block is drawn: in motion, where the world has it; otherwise where it was put
  shown(el) { const w = this.b.started ? this.b.world : null, body = w && el instanceof Block ? w.body(el.id) : null; return body ? { c: body.p, ang: body.ang } : null; }
  near(el, p) { if (el instanceof Push) { const w = this.b.started ? this.b.world : null, body = w && w.body(el.on); if (body) { if (body.gone) return Infinity; const [a, c] = el.arrowAt(body.p, body.ang, body.w, body.h, el.at(w.t)); return Math.max(0, V.toSeg(p, a, c) - el.pad); } }
    const s = this.shown(el); if (!s) return el.near(p); const pts = el.corners(s.c, s.ang); return V.inside(p, pts) ? 0 : Math.min(...pts.map((q, i) => V.toSeg(p, q, pts[(i + 1) % 4]))); }
  // The element under the pointer: blocks, fixings and links before the surfaces they sit on.
  pick(p) { const tol = (p.coarse ? 15 : 7) / this.b.view.scale; let best = null, bd = Infinity, br = 9;
    const rank = (el) => (el instanceof Block ? 0 : el instanceof Pulley || el instanceof Anchor ? 1 : el.isLink ? 2 : 3);
    for (const el of this.b.scene.els) { const d = this.near(el, p); if (d > tol) continue; const r = rank(el); if (r < br || (r === br && d <= bd)) { best = el; bd = d; br = r; } }
    return best; }

  down(p) { const b = this.b; this.start = p; this.last = p; this.moved = false; this.pointer = p; this.selBefore = b.selId;
    const part = b.measure.grab(p); if (part) { this.mode = 'tape'; this.part = part; this.was = { a: { ...b.measure.tape.a }, b: { ...b.measure.tape.b } }; return; }
    if (b.link) { const el = this.pick(p); this.mode = 'link'; this.el = el ? el.id : 0; return; }
    if (this.onHandle(p)) { this.mode = 'turn'; this.el = b.selId; const el = b.selected; if (el instanceof Surface) { this.pivot = null; this.pivot = this.grip(el).pivot; this.face = Math.sign(Math.round(el.normal.y * 1e9)); this.flipped = false; } b.begin(); return; }
    const el = this.pick(p);
    if (el && !el.isLink) { b.select(el); this.mode = 'move'; this.el = el.id; this.off = V.sub(el.pos, p); return; }
    if (el) { b.select(el); this.mode = 'pan'; this.was = { cx: b.view.cx, cy: b.view.cy, auto: b.view.auto }; this.keep = true; return; }
    this.mode = 'pan'; this.keep = false; this.el = 0; this.was = { cx: b.view.cx, cy: b.view.cy, auto: b.view.auto }; }

  move(p) { const b = this.b; this.pointer = p;
    if (!this.mode) { const tape = b.measure.grab(p), el = tape ? null : this.pick(p), id = el ? el.id : 0, over = !tape && !b.link && this.onHandle(p);
      if (id !== b.hoverId || over !== this.overHandle) { b.hoverId = id; this.overHandle = over; } this.overTape = !!tape; this.overLine = b.measure.angleOn && !tape && !!b.measure.lineAt(p); b.dirty = true; return; }
    if (!this.moved && Math.hypot(p.sx - this.start.sx, p.sy - this.start.sy) <= (p.coarse ? 9 : 3)) return;
    if (!this.moved && this.mode === 'move') b.begin();          // (the first real movement starts the undo step and stops the clock)
    this.moved = true; const el = b.scene.get(this.el);
    if (this.mode === 'tape') { const m = b.measure; if (this.part === 'body') m.shift(V.sub(p, this.last)); else m.place(this.part, p, p.shift); b.dirty = true; }
    else if (this.mode === 'turn' && el) this.aim(el, p);
    else if (this.mode === 'move' && el) { const step = p.shift ? 0.01 : 0.05, t = V.add(p, this.off); b.moveTo(el, Math.round(t.x / step) * step, Math.round(t.y / step) * step);
      // (a block dragged near a surface or another block settles onto it, unless Shift is held)
      if (el instanceof Block && !p.shift) { b.snap(el, 0.18); b.touch(); } }
    else if (this.mode === 'pan') { b.view.panBy(p.sx - this.last.sx, p.sy - this.last.sy); b.dirty = true; }
    this.last = p; }
  // a surface's handle sets where its far end is (angle in 5 degree steps, length in 0.1 m); a force's handle aims it
  aim(el, p) { const fine = p.shift;
    // A surface turns about the end it was held from, and keeps facing the way it faced (a ramp swung over the top
    // still faces up, a ceiling still faces down): past the vertical its two ends trade places.
    if (el instanceof Surface) { const P = this.pivot || el.a, d = V.sub(p, P), ang = Angle.snap(Angle.of(d), fine ? 1 : 5), len = Math.max(0.2, Math.round(Math.max(0, V.len(d) - PointerTool.HANDLE / this.b.view.scale) * (fine ? 100 : 10)) / (fine ? 100 : 10));
      const ny = V.left(V.polar(ang)).y; this.flipped = !!this.face && ny * this.face < -1e-9;
      if (this.flipped) { const far = V.at(P, V.polar(ang), len); el.set('x', far.x); el.set('y', far.y); el.set('angle', Angle.wrap(ang + 180)); }
      else { el.set('x', P.x); el.set('y', P.y); el.set('angle', ang); }
      el.set('length', len); this.b.touch(); return; }
    if (el instanceof Push) { const body = this.b.scene.get(el.on); if (!body) return; el.set('angle', Angle.snap(Angle.of(V.sub(body.pos, p)), fine ? 1 : 5)); this.b.touch(); } }

  up(p) { const b = this.b, mode = this.mode; this.mode = null; if (!mode) return;
    if (mode === 'tape') { if (!this.moved && b.measure.angleOn) b.measure.click(p); b.rev++; b.dirty = true; return; }
    if (mode === 'link') { const el = this.el ? b.scene.get(this.el) : null; if (this.moved) return; if (!el) { b.cancelLink(); b.say('Joining cancelled.'); return; } b.pickLink(el); return; }
    const picking = b.measure.angleOn && !this.moved; if (picking) { b.measure.click(p); b.selId = this.selBefore; b.rev++; b.dirty = true; }
    if (mode === 'pan') { if (!this.moved && !picking && !this.keep) b.select(null); return; }
    if (this.moved) b.commit(); }

  cancel() { const b = this.b, mode = this.mode; this.mode = null; if (!mode) return b.cancelLink();
    if (mode === 'tape') { b.measure.tape = this.was; b.dirty = true; return true; }
    if (mode === 'pan') { b.view.cx = this.was.cx; b.view.cy = this.was.cy; b.view.auto = this.was.auto; b.dirty = true; } else if (this.moved) b.abandon();
    return true; }
  leave() { this.pointer = null; this.b.hoverId = 0; this.overHandle = false; this.overTape = false; this.overLine = false; this.b.dirty = true; }

  // ---- fingers: one does what the mouse does, two pan and zoom ----
  span() { const [a, c] = [...this.touches.values()]; return { d: Math.hypot(a.sx - c.sx, a.sy - c.sy) || 1, mx: (a.sx + c.sx) / 2, my: (a.sy + c.sy) / 2 }; }
  touchDown(id, p) { this.touches.set(id, p); if (this.touches.size === 1) this.down(p); else if (this.touches.size === 2) { this.cancel(); this.pinch = this.span(); } }
  touchMove(id, p) { if (!this.touches.has(id)) return false; this.touches.set(id, p);
    if (this.pinch && this.touches.size >= 2) { const n = this.span(), v = this.b.view; v.panBy(n.mx - this.pinch.mx, n.my - this.pinch.my); v.zoomAbout(n.mx, n.my, n.d / this.pinch.d); this.pinch = n; this.b.dirty = true; return true; }
    if (this.mode) { this.move(p); return true; } return false; }
  touchUp(id, p, cancelled) { if (!this.touches.delete(id)) return false;
    if (this.pinch) { if (this.touches.size < 2) this.pinch = null; } else if (cancelled) this.cancel(); else this.up(p);
    if (!this.touches.size) { this.pointer = null; this.b.hoverId = 0; this.overHandle = false; } this.b.dirty = true; return true; }
  reset() { this.touches.clear(); this.pinch = null; }

  get busy() { return !!this.mode; }
  get turning() { return this.mode === 'turn' && this.moved ? this.b.scene.get(this.el) : null; }
  get moving() { return this.mode === 'move' && this.moved ? this.b.scene.get(this.el) : null; }
  get cursor() { if (this.mode === 'tape' || this.mode === 'turn') return 'grabbing'; if (this.mode === 'move') return 'move'; if (this.mode === 'pan') return this.moved ? 'grabbing' : 'default';
    if (this.overTape || this.overHandle) return 'grab'; if (this.overLine) return 'crosshair'; if (this.b.link) return this.b.hoverId ? 'pointer' : 'default'; return this.b.hoverId ? 'move' : 'default'; }
}
