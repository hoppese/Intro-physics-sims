// =====================================================================
// Gestures -- one object per press-drag-release on the canvas.
//
// A pointer position is passed around as { sx, sy, x, y }: canvas pixels and
// world pixels (plus `coarse: true` when it is a finger). Each gesture decides what dragging means (pan the view, lay
// a wire, move a part) and what a press that never moved means (`onClick`).
// =====================================================================
class Gesture {
  constructor(bench, at, onClick) { this.bench = bench; this.start = at; this.onClick = onClick; this.moved = false; this.slop = at.coarse ? 9 : 4; }
  // has the pointer travelled far enough to be a drag rather than a click? (a finger wobbles more than a mouse)
  track(at) { if (!this.moved && Math.hypot(at.sx - this.start.sx, at.sy - this.start.sy) > this.slop) this.moved = true; return this.moved; }
  move(at) { if (this.track(at)) this.drag(at); }
  end(at) { if (this.moved) this.drop(at); else if (this.onClick) this.onClick(); }
  drag(at) {} drop(at) {} cancel() {}
  decorate(scene) {}                    // add this gesture's preview to the frame
  get cursor() { return 'default'; }
}

class PanGesture extends Gesture {
  constructor(bench, at, onClick) { super(bench, at, onClick); const v = bench.view; this.from = { ox: v.ox, oy: v.oy, auto: v.auto }; }
  drag(at) { this.bench.view.panTo(this.from.ox + at.sx - this.start.sx, this.from.oy + at.sy - this.start.sy); }
  cancel() { const v = this.bench.view; v.panTo(this.from.ox, this.from.oy); v.auto = this.from.auto; }
  get cursor() { return 'grabbing'; }
}

// Two fingers on a touch screen. The spot on the board that was midway between them stays
// midway between them (so moving both pans), and the view zooms by how far apart they have moved.
class PinchGesture extends Gesture {
  constructor(bench, a, b) { super(bench, a, null); const v = bench.view, m = PinchGesture.mid(a, b); this.moved = true;
    this.from = { scale: v.scale, ox: v.ox, oy: v.oy, auto: v.auto }; this.span = m.d; this.anchor = v.toWorld(m.sx, m.sy); }
  static mid(a, b) { return { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2, d: Math.max(1, Math.hypot(a.sx - b.sx, a.sy - b.sy)) }; }
  update(a, b) { const m = PinchGesture.mid(a, b); this.bench.view.place(this.anchor, m.sx, m.sy, this.from.scale * m.d / this.span); }
  cancel() { const v = this.bench.view; v.scale = this.from.scale; v.panTo(this.from.ox, this.from.oy); v.auto = this.from.auto; }
  get cursor() { return 'grabbing'; }
}

// Lay a wire from a grid point: straight, or with one corner. The corner goes
// the way the pointer first set off, unless only the other way round is legal.
class WireGesture extends Gesture {
  constructor(bench, at, from, onClick) { super(bench, at, onClick); this.from = from; this.pts = [from]; this.ok = false; this.why = ''; this.axis = null; }
  drag(at) { const g = View.grid(at.x, at.y), to = { c: Math.round(g.c), r: Math.round(g.r) }, from = this.from;
    if (P.eq(to, from)) { this.pts = [from]; this.axis = null; this.aim = null; return; }
    const aim = P.key(to); if (aim === this.aim) return; this.aim = aim;
    if (!this.axis) this.axis = Math.abs(g.c - from.c) >= Math.abs(g.r - from.r) ? 'h' : 'v';
    const H = [from, { c: to.c, r: from.r }, to], V = [from, { c: from.c, r: to.r }, to];
    const tries = P.aligned(from, to) ? [[from, to]] : (this.axis === 'h' ? [H, V] : [V, H]); let pick = null;
    for (const pts of tries) { const r = this.bench.circuit.checkPath(pts); if (r.ok) { pick = { pts, ok: true, why: '' }; break; } if (!pick) pick = { pts, ok: false, why: r.why }; }
    if (!pick.ok) { const round = this.bench.circuit.detour(from, to); if (round) pick = { pts: round, ok: true, why: '' }; }   // neither elbow fits: go round
    this.pts = pick.pts; this.ok = pick.ok; this.why = pick.why; }
  drop() { if (this.pts.length > 1) this.bench.drawWire(this.pts); }
  decorate(scene) { if (this.pts.length > 1) scene.wire = { pts: this.pts, ok: this.ok }; }
  get cursor() { return 'crosshair'; }
}

// Drag a part (or a run of wire) across the grid. Every new grid position is
// tried afresh from where the drag began, so the wiring is re-routed from the
// original layout rather than piling up detours. A position that is refused
// shows as a red ghost while the part waits at the last place that worked;
// letting go there sends the part back to where the drag began, so a drop
// never leaves it somewhere the user did not put it.
class MoveGesture extends Gesture {
  constructor(bench, at, el, onClick) { super(bench, at, onClick); this.id0 = el.id; this.before = bench.circuit.snapshot(); this.grab = View.grid(at.x, at.y);
    this.want = { dc: 0, dr: 0 }; this.good = { dc: 0, dr: 0 }; this.ghost = null; this.refused = null; }
  drag(at) { const g = View.grid(at.x, at.y), dc = Math.round(g.c - this.grab.c), dr = Math.round(g.r - this.grab.r);
    if (dc === this.want.dc && dr === this.want.dr) return; this.want = { dc, dr }; this.place(dc, dr); }
  // put the part at start + (dc, dr); returns the edit result
  apply(dc, dr) { const c = this.bench.circuit; c.restoreLayout(this.before); const el = c.byId(this.id0); if (!el) return { ok: false, why: 'it is gone' };
    if (!dc && !dr) return { ok: true, el }; const r = c.move(el, dc, dr); if (!r.ok) c.restoreLayout(this.before); return r; }
  place(dc, dr) { const b = this.bench, r = this.apply(dc, dr); this.ghost = null; this.refused = null;
    if (r.ok) { this.good = { dc, dr }; b.selId = r.el ? r.el.id : this.id0; b.hush(); }
    else { const el = b.circuit.byId(this.id0); if (el) this.ghost = el.clone().setGeometry(el.translated(dc, dr));
      const back = this.apply(this.good.dc, this.good.dr); b.selId = back.el ? back.el.id : this.id0; this.refused = r.why || 'it does not fit'; b.refuse('move it there', r.why); }
    b.sim.refresh(); }
  drop() { const b = this.bench; this.ghost = null;
    if (this.refused) { const why = this.refused; this.cancel(); b.say('Put back where it was — can’t go there: ' + why, true); return; }
    if (this.good.dc || this.good.dr) { b.history.record(this.before); b.settle(); b.keepInView(); } }
  cancel() { const b = this.bench; b.circuit.restoreLayout(this.before); b.selId = this.id0; this.ghost = null; b.settle(); }
  decorate(scene) { scene.ghost = this.ghost; }
  get cursor() { return 'grabbing'; }
}

// =====================================================================
// PointerTool -- works out what is under the pointer and starts the gesture
// that goes with it:
//   a part's terminal, a grid point on a wire, an empty grid dot  -> lay a wire
//   the body of a part, a wire between grid points                -> select / move
//   empty space, the middle button, or Space held                 -> pan
// On a touch screen one finger is the pointer, and a second finger turns the
// pair into a pinch (see the touch... methods).
// =====================================================================
class PointerTool {
  constructor(bench) { this.bench = bench; this.gesture = null; this.under = { kind: 'none' }; this.space = false; this.touches = new Map(); this.spent = false; }

  // what is at world point (x, y); `coarse`: it is a finger, so everything is a bigger target
  pick(x, y, coarse) { const b = this.bench, c = b.circuit, s = b.view.scale, G = View.G, k = coarse ? 1.6 : 1, dist = (p) => { const q = View.xy(p); return Math.hypot(q.x - x, q.y - y); };
    let best = null;
    for (const el of c.parts) for (const t of el.terminals()) { const d = dist(t.p); if (d <= Math.min(7 * k / s, (coarse ? 0.5 : 0.4) * G) && (!best || d < best.d)) best = { kind: 'terminal', el, p: t.p, d }; }
    if (best) return best;
    for (const el of c.parts) { const d = PAINTERS[el.type].distance(el, x, y); if (d <= 11 * k / s && (!best || d < best.d)) best = { kind: 'part', el, d, press: PAINTERS[el.type].press(el, x, y) }; }
    if (best) return best;
    for (const el of c.wires) { const d = Draw.segDist(x, y, View.xy(el.a), View.xy(el.b)); if (d <= 6 * k / s && (!best || d < best.d)) best = { kind: 'wire', el, d }; }
    const dot = View.dot(x, y, Infinity);
    if (best) { const onIt = P.line(best.el.a, best.el.b).some((p) => P.eq(p, dot)); best.near = onIt ? dot : best.el.a; best.p = onIt && dist(dot) <= Math.min(6 / s, 0.3 * G) ? dot : null; return best; }
    if (dist(dot) <= Math.min(6.5 / s, 0.45 * G) && c.inBounds(dot) && !c.occupancy(null).interior.has(P.key(dot))) return { kind: 'dot', p: dot };
    return { kind: 'none' }; }
  // does a press here start a wire?
  static startsWire(h) { return h.kind === 'terminal' || h.kind === 'dot' || (h.kind === 'wire' && !!h.p); }

  down(at, pan) { const b = this.bench; if (this.gesture) this.cancel();
    if (pan) { this.gesture = new PanGesture(b, at); return; }
    const h = this.pick(at.x, at.y, at.coarse), clear = () => { b.select(null); b.probe = null; };
    if (h.kind === 'terminal') this.gesture = new WireGesture(b, at, h.p, () => { b.select(null); b.probeAt(h.p); });
    else if (h.kind === 'dot') this.gesture = new WireGesture(b, at, h.p, clear);
    else if (h.kind === 'wire' && h.p) this.gesture = new WireGesture(b, at, h.p, () => { b.select(h.el); b.probeAt(h.p); });
    else if (h.kind === 'wire') { b.select(h.el); this.gesture = new MoveGesture(b, at, h.el, () => b.probeAt(h.near)); }
    else if (h.kind === 'part') { b.select(h.el); b.probe = null; this.gesture = new MoveGesture(b, at, h.el, () => { if (h.press) b.toggle(h.el, h.press.position); }); }
    else this.gesture = new PanGesture(b, at, clear); }
  move(at) { if (this.gesture) this.gesture.move(at); else this.under = this.pick(at.x, at.y); }
  up(at) { const g = this.gesture; if (!g) return; this.gesture = null; g.end(at); this.under = this.pick(at.x, at.y); }
  cancel() { const g = this.gesture; if (!g) return false; this.gesture = null; g.cancel(); return true; }
  leave() { if (!this.gesture) this.under = { kind: 'none' }; }

  // ---- touch ----
  // The first finger down is the pointer. A second one cancels whatever the first had begun and
  // the two pinch; when either lifts the pinch is over, and the finger left behind does nothing
  // more (`spent`) -- it must not start dragging whatever it happens to be resting on.
  // `first`: no other finger is on the screen (which also clears out a finger whose lift was missed)
  touchDown(id, at, first) { const T = this.touches; if (first) T.clear(); if (T.size >= 2 && !T.has(id)) return; T.set(id, at);
    if (T.size === 1) { this.spent = false; this.down(at, false); return; }
    this.cancel(); const [a, b] = [...T.values()]; this.gesture = new PinchGesture(this.bench, a, b); }
  touchMove(id, at) { const T = this.touches; if (!T.has(id)) return false; T.set(id, at); const g = this.gesture;
    if (g instanceof PinchGesture) { const [a, b] = [...T.values()]; g.update(a, b); } else if (g && !this.spent) g.move(at); return !!g; }
  touchUp(id, at, cancelled) { const T = this.touches; if (!T.has(id)) return false; T.delete(id); const g = this.gesture;
    if (g instanceof PinchGesture) { this.gesture = null; this.spent = T.size > 0; }
    else if (g && !this.spent) { if (cancelled) this.cancel(); else this.up(at); }
    if (!T.size) this.spent = false; this.under = { kind: 'none' }; return true; }

  decorate(scene) { if (this.gesture) this.gesture.decorate(scene); else if (PointerTool.startsWire(this.under)) scene.hover = this.under.p; }
  get cursor() { if (this.gesture) return this.gesture.cursor; const h = this.under;
    if (this.space) return 'grab'; if (PointerTool.startsWire(h)) return 'crosshair'; if (h.kind === 'part') return h.press ? 'pointer' : 'grab'; if (h.kind === 'wire') return 'grab'; return 'default'; }
}
