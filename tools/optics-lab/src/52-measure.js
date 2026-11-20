// =====================================================================
// Measure -- the two measuring tools, which sit on top of the bench but are
// not part of it (they are not saved, undone or shared).
//   tape    a tape measure: drag either end to pull it out, drag the tape to
//           move it; it reads its length
//   angle   while on, a click on a line (a ray, or a flat surface: a mirror,
//           a lens, a face of a prism, the tape) picks it; two picked lines
//           give the angle between them, drawn where they meet
// The picked lines are copies of where the light and the surfaces were: as
// soon as anything on the bench changes they are let go.
// =====================================================================
class Measure {
  static TOL = 7;                // px: how near a click must be to a line or a tape end
  static END = 10;               // px: the grab radius of a tape end
  constructor(bench) { this.b = bench; this.tape = null; this.angleOn = false; this.lines = []; this.res = null; }

  // ---- the tape ----
  // it comes out across the middle of what is on screen, a round number of centimetres long
  toggleTape() { if (this.tape) { this.tape = null; return false; } const v = this.b.view.visible, cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, half = Math.max(1, Math.round((v.x1 - v.x0) * 0.15));
    this.tape = { a: { x: Math.round(cx - half), y: Math.round(cy - (v.y1 - v.y0) * 0.3) }, b: { x: Math.round(cx + half), y: Math.round(cy - (v.y1 - v.y0) * 0.3) } }; return true; }
  get length() { return this.tape ? V.dist(this.tape.a, this.tape.b) : null; }
  // which part of the tape is under a canvas point: 'a', 'b', 'body' or null
  grab(p) { const t = this.tape; if (!t) return null; const v = this.b.view, r = (p.coarse ? 1.6 : 1) * Measure.END;
    for (const k of ['b', 'a']) { const c = v.toCanvas(t[k]); if (Math.hypot(c.x - p.sx, c.y - p.sy) <= r) return k; }
    const a = v.toCanvas(t.a), b = v.toCanvas(t.b); return Measure.dist({ x: p.sx, y: p.sy }, a, b) <= (p.coarse ? 12 : 8) ? 'body' : null; }
  // an end goes where it is dragged (to 0.5 cm; with Shift, 0.1 cm)
  place(end, q, fine) { const s = fine ? 0.1 : 0.5, r = (x) => Math.round(x / s) * s; this.tape[end] = { x: r(q.x), y: r(q.y) }; }
  shift(d) { const t = this.tape; t.a = V.add(t.a, d); t.b = V.add(t.b, d); }

  // ---- the angle between two lines ----
  toggleAngle() { this.angleOn = !this.angleOn; this.lines = []; return this.angleOn; }
  // every line on the bench a click could mean, in bench coordinates
  candidates() { const b = this.b, out = [];
    // (only the light that is on show: with the rays hidden, their first stretch)
    for (const s of b.result.segs) if (s.ref && s.main && (!b.hidden || s.k === 0)) out.push({ a: s.a, b: s.b, what: 'ray' });
    for (const el of b.scene.els) for (const s of el.surfaces()) if (s.kind === 'seg' && V.dist(s.a, s.b) > 1e-6) out.push({ a: s.a, b: s.b, what: 'surface' });
    if (this.tape && this.length > 1e-6) out.push({ a: this.tape.a, b: this.tape.b, what: 'tape' });
    return out; }
  // the line under a canvas point, or null
  lineAt(p) { const v = this.b.view, tol = (p.coarse ? 1.8 : 1) * Measure.TOL, at = { x: p.sx, y: p.sy }; let best = null, bd = Infinity;
    for (const c of this.candidates()) { const d = Measure.dist(at, v.toCanvas(c.a), v.toCanvas(c.b)); if (d <= tol && d < bd) { bd = d; best = c; } }
    return best ? { a: { ...best.a }, b: { ...best.b }, what: best.what, at: { x: p.x, y: p.y } } : null; }
  // a click while measuring an angle: the first line, the second, then a fresh start
  click(p) { this.fresh(); const l = this.lineAt(p); if (!l) { this.lines = []; return false; }
    if (this.lines.length >= 2) this.lines = []; this.lines.push(l); this.res = this.b.result; return true; }
  // let the lines go once the bench has changed under them
  fresh() { if (this.lines.length && this.res !== this.b.result) this.lines = []; return this.lines; }
  // { deg, other, at, u, w }: `at` is where the two lines cross (null if they are parallel), u and w run from
  // there along each line toward the place it was clicked, and deg is the angle between u and w: the angle on
  // the side the clicks were. `other` is the angle on the other side (180 - deg).
  get angle() { const L = this.fresh(); if (L.length < 2) return null; const [p, q] = L; let u = V.unit(V.sub(p.b, p.a)), w = V.unit(V.sub(q.b, q.a)); const den = V.cross(u, w);
    if (Math.abs(den) < 1e-9) return { deg: 0, other: 180, at: null, u, w };
    const at = V.at(p.a, u, V.cross(V.sub(q.a, p.a), w) / den);
    if (V.dot(V.sub(p.at, at), u) < 0) u = V.mul(u, -1); if (V.dot(V.sub(q.at, at), w) < 0) w = V.mul(w, -1);
    const deg = Angle.deg(Math.acos(Math.max(-1, Math.min(1, V.dot(u, w))))); return { deg, other: 180 - deg, at, u, w }; }

  // distance from c to the segment a-b
  static dist(c, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; let t = l2 ? ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(c.x - a.x - t * dx, c.y - a.y - t * dy); }
}
