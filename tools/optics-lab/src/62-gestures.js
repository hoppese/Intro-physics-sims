// =====================================================================
// PointerTool -- what a press, a drag and a release on the canvas mean.
//
// A pointer position is { sx, sy, x, y, coarse, shift }: canvas pixels, bench
// centimetres, whether it is a finger, and whether Shift is down.
//   press the gold handle of the selected element and drag    turn it
//   press a white square on the selected element and drag     stretch it (a lens's or mirror's
//                                                             ends, an object's tip): its height
//   press a focal point F (or a mirror's C) and drag          change the focal length; drag F
//                                                             through the lens (or mirror) and it
//                                                             turns diverging (convex), and back
//   press an element and drag                                 move it
//   press the bench and drag                                  pan the view
//   press without dragging                                    select / deselect
//   press an end of the tape measure and drag                 pull it out (the tape itself: move it)
//   with the angle tool on, press a line without dragging     pick it (see Measure)
// =====================================================================
class PointerTool {
  static HANDLE = 28;                  // px from the element's end to its turning handle (clear of the stretch square there)
  constructor(bench) { this.b = bench; this.mode = null; this.start = null; this.moved = false; this.el = 0; this.off = null; this.last = null; this.pointer = null; this.overHandle = false; this.touches = new Map(); this.pinch = null; }

  // where the turning handle of an element is, on the bench
  handle(el) { const g = el.toWorld(el.grip), d = V.sub(g, el.pos), l = V.len(d) || 1; return V.at(el.pos, V.mul(d, 1 / l), l + PointerTool.HANDLE / this.b.view.scale); }
  // The stretch squares of an element: a lens's or mirror's two ends (it grows from both, about its middle) and an
  // object's tip (its foot stays put). Other elements have none.
  stretchPts(el) { if (!el) return []; if (el instanceof Lens || el instanceof Mirror) return el.ends; if (el instanceof Figure) return [el.tip]; return []; }
  onStretch(p) { const v = this.b.view, r = p.coarse ? 16 : 8; return this.stretchPts(this.b.selected).some((q) => { const c = v.toCanvas(q); return Math.hypot(c.x - p.sx, c.y - p.sy) <= r; }); }
  // the height the pointer asks for: measured across the element (along an object), from its middle (from its foot)
  stretchTo(el, p, step) { const d = V.dot(V.sub(p, el.pos), el.across), h = el instanceof Figure ? d : 2 * Math.abs(d); return el.set('height', Math.round(h / step) * step); }
  // The focal points that can be dragged: each lens's two F, a curved mirror's F and C. k is how far along the
  // axis the point sits, in focal lengths (F at +f is 1, the far F of a lens -1, C is 2): dragging it sets f
  // to the distance along the axis over k, so the point stays under the pointer, and past the lens f changes sign.
  foci() { const out = []; for (const el of this.b.scene.els) { if (el instanceof Lens) out.push({ el, k: 1 }, { el, k: -1 }); else if (el instanceof Mirror && el.curved) out.push({ el, k: 1 }, { el, k: 2 }); } return out; }
  static focusAt(fo) { return V.at(fo.el.pos, fo.el.dir, fo.k * fo.el.f); }
  focusUnder(p) { const v = this.b.view, sel = this.b.selId; let best = null, bd = (p.coarse ? 16 : 8);
    for (const fo of this.foci()) { const c = v.toCanvas(PointerTool.focusAt(fo)), d = Math.hypot(c.x - p.sx, c.y - p.sy) - (fo.el.id === sel ? 0.5 : 0); if (d <= bd) { bd = d; best = fo; } }
    return best; }
  onHandle(p) { const el = this.b.selected; if (!el) return false; const h = this.b.view.toCanvas(this.handle(el)); return Math.hypot(h.x - p.sx, h.y - p.sy) <= (p.coarse ? 18 : 10); }
  // The element under the pointer. Thin things (lenses, mirrors, sources) win over a piece of glass
  // they are in front of; otherwise the nearest, and of equals the one added last.
  pick(p) { const tol = (p.coarse ? 15 : 7) / this.b.view.scale; let best = null, bd = Infinity, bs = true;
    for (const el of this.b.scene.els) { const d = el.near(p); if (d > tol) continue; const solid = el instanceof Solid;
      if (!best || (bs && !solid) || (solid === bs && d <= bd)) { best = el; bd = d; bs = solid; } }
    return best; }

  down(p) { const b = this.b; this.start = p; this.last = p; this.moved = false; this.pointer = p; this.selBefore = b.selId;
    const part = b.measure.grab(p); if (part) { this.mode = 'tape'; this.part = part; this.was = { a: { ...b.measure.tape.a }, b: { ...b.measure.tape.b } }; return; }
    if (this.onHandle(p)) { this.mode = 'turn'; this.el = b.selId; b.begin(); return; }
    if (this.onStretch(p)) { this.mode = 'stretch'; this.el = b.selId; b.begin(); return; }
    const fo = this.focusUnder(p); if (fo) { b.select(fo.el); this.mode = 'focus'; this.el = fo.el.id; this.k = fo.k; b.hotFocus = { id: fo.el.id, k: fo.k }; b.begin(); return; }
    const el = this.pick(p);
    if (el) { b.select(el); this.mode = 'move'; this.el = el.id; this.off = V.sub(el.pos, p); b.begin(); return; }
    this.mode = 'pan'; this.el = 0; this.was = { cx: b.view.cx, cy: b.view.cy, auto: b.view.auto }; }

  move(p) { const b = this.b; this.pointer = p;
    if (!this.mode) { const tape = b.measure.grab(p), el = tape ? null : this.pick(p), id = el ? el.id : 0, over = !tape && this.onHandle(p), st = !tape && !over && this.onStretch(p), fo = tape || over || st ? null : this.focusUnder(p); this.overStretch = st; if (id !== b.hoverId || over !== this.overHandle) { b.hoverId = id; this.overHandle = over; }
      this.overFocus = !!fo; b.hotFocus = fo ? { id: fo.el.id, k: fo.k } : null;
      this.overTape = !!tape; this.overLine = b.measure.angleOn && !tape && !!b.measure.lineAt(p); b.dirty = true; return; }
    if (!this.moved && Math.hypot(p.sx - this.start.sx, p.sy - this.start.sy) <= (p.coarse ? 9 : 3)) return; this.moved = true;
    const el = b.scene.get(this.el);
    if (this.mode === 'tape') { const m = b.measure; if (this.part === 'body') m.shift(V.sub(p, this.last)); else m.place(this.part, p, p.shift); b.dirty = true; }
    else if (this.mode === 'turn' && el) { el.aim(p, p.shift ? 1 : 5); b.touch(); }
    else if (this.mode === 'stretch' && el) { this.stretchTo(el, p, p.shift ? 0.1 : 1); b.touch(); }
    else if (this.mode === 'focus' && el) { const step = p.shift ? 0.1 : 1, f = V.dot(V.sub(p, el.pos), el.dir) / this.k; el.set('f', Math.round(f / step) * step); b.touch(); }
    else if (this.mode === 'move' && el) { const step = p.shift ? 0.1 : 1, t = V.add(p, this.off); b.moveTo(el, Math.round(t.x / step) * step, Math.round(t.y / step) * step); }
    else if (this.mode === 'pan') { b.view.panBy(p.sx - this.last.sx, p.sy - this.last.sy); b.dirty = true; }
    this.last = p; }

  up(p) { const b = this.b, mode = this.mode; this.mode = null; if (!mode) return; if (mode === 'focus') b.hotFocus = null;
    if (mode === 'tape') { if (!this.moved && b.measure.angleOn) b.measure.click(p); b.rev++; b.dirty = true; return; }      // (a click on the tape, not a drag: it is a line to measure from)
    // with the angle tool on, a click (not a drag) picks a line, whatever is under it
    const picking = b.measure.angleOn && !this.moved; if (picking) { b.measure.click(p); b.selId = this.selBefore; b.rev++; b.dirty = true; }      // (and the selection stays as it was)
    if (mode === 'pan') { if (!this.moved && !picking) b.select(null); return; }
    b.commit(); }

  // Escape in the middle of a drag: put everything back
  cancel() { const b = this.b, mode = this.mode; this.mode = null; if (!mode) return false; b.hotFocus = null;
    if (mode === 'tape') { b.measure.tape = this.was; b.dirty = true; return true; }
    if (mode === 'pan') { b.view.cx = this.was.cx; b.view.cy = this.was.cy; b.view.auto = this.was.auto; b.dirty = true; } else b.abandon();
    return true; }
  leave() { this.pointer = null; if (this.b.hoverId) { this.b.hoverId = 0; } this.overHandle = false; this.overStretch = false; this.overFocus = false; this.b.hotFocus = null; this.overTape = false; this.overLine = false; this.b.dirty = true; }

  // ---- fingers: one finger does what the mouse does, two pan and zoom the bench ----
  span() { const [a, b] = [...this.touches.values()]; return { d: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 }; }
  touchDown(id, p) { this.touches.set(id, p); if (this.touches.size === 1) this.down(p); else if (this.touches.size === 2) { this.cancel(); this.pinch = this.span(); } }
  touchMove(id, p) { if (!this.touches.has(id)) return false; this.touches.set(id, p);
    if (this.pinch && this.touches.size >= 2) { const n = this.span(), v = this.b.view; v.panBy(n.mx - this.pinch.mx, n.my - this.pinch.my); v.zoomAbout(n.mx, n.my, n.d / this.pinch.d); this.pinch = n; this.b.dirty = true; return true; }
    if (this.mode) { this.move(p); return true; } return false; }
  touchUp(id, p, cancelled) { if (!this.touches.delete(id)) return false;
    if (this.pinch) { if (this.touches.size < 2) this.pinch = null; } else if (cancelled) this.cancel(); else this.up(p);
    if (!this.touches.size) { this.pointer = null; this.b.hoverId = 0; this.overHandle = false; } this.b.dirty = true; return true; }
  reset() { this.touches.clear(); this.pinch = null; }

  // the resize arrow nearest the way the element stretches on screen
  resizeCursor() { const el = this.b.scene.get(this.el) || this.b.selected; if (!el) return 'ns-resize'; const a = ((Angle.of(el.across) % 180) + 180) % 180;
    return a < 22.5 || a >= 157.5 ? 'ew-resize' : a < 67.5 ? 'nesw-resize' : a < 112.5 ? 'ns-resize' : 'nwse-resize'; }
  get busy() { return !!this.mode; }
  get stretching() { return this.mode === 'stretch' && this.moved ? this.b.scene.get(this.el) : null; }
  get focusing() { return this.mode === 'focus' && this.moved ? this.b.scene.get(this.el) : null; }
  get turning() { return this.mode === 'turn' && this.moved ? this.b.scene.get(this.el) : null; }
  get moving() { return this.mode === 'move' && this.moved ? this.b.scene.get(this.el) : null; }
  get cursor() { if (this.mode === 'tape') return 'grabbing'; if (!this.mode && this.overTape) return 'grab'; if (!this.mode && this.overLine) return 'crosshair';
    if (this.mode === 'pan') return this.moved ? 'grabbing' : 'default'; if (this.mode === 'turn' || this.mode === 'focus') return 'grabbing'; if (this.mode === 'stretch') return this.resizeCursor(); if (this.mode === 'move') return 'move';
    if (this.overStretch) return this.resizeCursor();
    return this.overHandle || this.overFocus ? 'grab' : this.b.hoverId ? 'move' : 'default'; }
}
