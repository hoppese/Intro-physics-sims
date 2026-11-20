// =====================================================================
// Elements -- everything that can be put on the bench, as it is SET UP
// (before the clock runs). The engine (40-engine.js) builds its moving
// world from these; dragging and typing change only these.
//
//   Element
//     Block      a box with a mass. It sits on a surface or another block, hangs from a rope,
//                or flies free. It does not tip or spin: it is a particle with a size.
//     Surface    a fixed straight face: floor, table, ramp, wall or ceiling. Light pushes off
//                its top side only (the side to the left of its direction).
//     Pulley     a fixed, ideal (massless, frictionless) pulley.
//     Anchor     a fixed point to tie a rope or a spring to.
//   Link        joins elements by id
//     Rope       from a block or anchor, over any pulleys, to a block or anchor. Massless and
//                inextensible; it can go slack but never stretch.
//     Spring     between two blocks or a block and an anchor (Hooke's law, both ways).
//     Push       a constant applied force on one block, at a fixed angle.
//
// Lengths m, masses kg, forces N, angles degrees counter-clockwise from +x.
// =====================================================================
const BOARD = { x0: -6, y0: -1, x1: 6, y1: 6 };          // the bench, in m

class Element {
  static info = { type: '', name: 'Element', angle: 0 };
  static COMMON = [{ key: 'x', label: 'x', unit: 'm', min: BOARD.x0, max: BOARD.x1, step: 0.05 }, { key: 'y', label: 'y', unit: 'm', min: BOARD.y0, max: BOARD.y1, step: 0.05 }];
  static OWN = [];
  constructor(o) { this.id = 0; this.scene = null; this.x = 0; this.y = 0; this.angle = this.constructor.info.angle || 0;
    for (const s of this.constructor.OWN) this[s.key] = Array.isArray(s.init) ? s.init.slice() : s.init;
    if (o) for (const k of Object.keys(o)) { if (k === 'id') this.id = o.id | 0; else this.set(k, o[k]); } }
  get type() { return this.constructor.info.type; }
  get name() { return this.constructor.info.name; }
  get kind() { return this.name; }
  get tag() { return ''; }
  get pos() { return { x: this.x, y: this.y }; }
  get isLink() { return false; }
  specs() { return (this.constructor.placed === false ? [] : this.constructor.COMMON).concat(this.constructor.OWN); }
  spec(key) { return this.specs().find((s) => s.key === key) || null; }
  // the number boxes on the card (options are chips, not boxes)
  fields() { return this.specs().filter((s) => !s.options && !s.list && this.shows(s.key)); }
  shows() { return true; }
  choices() { return []; }
  // Set one value, inside its limits. Returns false (and changes nothing) for nonsense.
  set(key, v) { const s = this.spec(key); if (!s) return false;
    if (s.list) { if (!Array.isArray(v)) return false; this[key] = v.map((x) => x | 0).filter((x) => x > 0); this.settle(key); return true; }
    if (s.options) { if (!s.options.includes(v)) return false; this[key] = v; this.settle(key); return true; }
    if (typeof v !== 'number' && typeof v !== 'string') return false; v = Number(v); if (!isFinite(v)) return false;
    if (key === 'angle' && s.wrap) v = Angle.wrap(v);
    v = Math.max(s.min, Math.min(s.max, v)); if (s.int) v = Math.round(v); else v = Math.round(v * 1e6) / 1e6;
    this[key] = v; this.settle(key); return true; }
  settle() {}
  toJSON() { const o = { t: this.type, id: this.id }; if (this.constructor.placed !== false) { o.x = this.x; o.y = this.y; }
    for (const s of this.constructor.OWN) o[s.key] = Array.isArray(this[s.key]) ? this[s.key].slice() : this[s.key]; return o; }
  static from(o) { const C = o && ELEMENTS[o.t]; if (!C) return null; const el = new C(); el.id = o.id | 0; for (const s of el.specs()) if (o[s.key] !== undefined) el.set(s.key, o[s.key]); return el; }
  clone() { return Element.from(this.toJSON()); }
  // the shape used for picking it up and for the view's bounds: { pts, closed }
  outline() { return { pts: [this.pos], closed: false }; }
  get pad() { return 0.08; }
  // distance from p to the element (0 inside a closed outline)
  near(p) { const o = this.outline(), pts = o.pts; if (o.closed && pts.length > 2 && V.inside(p, pts)) return 0;
    let d = pts.length === 1 ? V.dist(p, pts[0]) : Infinity; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, V.toSeg(p, pts[i], pts[i + 1]));
    if (o.closed) d = Math.min(d, V.toSeg(p, pts[pts.length - 1], pts[0])); return Math.max(0, d - this.pad); }
  bounds() { const pts = this.outline().pts; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { x0: x0 - this.pad, y0: y0 - this.pad, x1: x1 + this.pad, y1: y1 + this.pad }; }
}

// friction coefficients, shared by surfaces and blocks (a block's are for what sits on it or presses on it)
const MU_S = { key: 'muS', label: 'μs (static)', unit: '', min: 0, max: 2, step: 0.01, init: 0.4 };
const MU_K = { key: 'muK', label: 'μk (kinetic)', unit: '', min: 0, max: 2, step: 0.01, init: 0.3 };
function frictionChoices(el) {
  const sets = [['None', 0, 0, 'Frictionless'], ['Rough', 0.4, 0.3, 'μs = 0.4, μk = 0.3'], ['Very rough', 0.8, 0.6, 'μs = 0.8, μk = 0.6']];
  return { label: 'Friction', items: sets.map(([label, s, k, title]) => ({ label, title, on: Math.abs(el.muS - s) < 1e-9 && Math.abs(el.muK - k) < 1e-9, pick: () => { el.set('muS', s); return el.set('muK', k); } })) };
}

class Block extends Element {
  static info = { type: 'block', name: 'Block', angle: 0 };
  static COLOURS = ['#4f86c6', '#c0574f', '#4f9d6b', '#b7863a', '#8a63b8', '#3f9fa8'];
  static OWN = [{ key: 'mass', label: 'Mass', unit: 'kg', min: 0.05, max: 100, step: 0.1, init: 2 },
    { key: 'w', label: 'Width', unit: 'm', min: 0.1, max: 2, step: 0.05, init: 0.4 }, { key: 'h', label: 'Height', unit: 'm', min: 0.1, max: 2, step: 0.05, init: 0.3 },
    { key: 'angle', label: 'Tilt', unit: '°', min: -89, max: 89, step: 1, init: 0 },
    { key: 'vx', label: 'Starting vx', unit: 'm/s', min: -20, max: 20, step: 0.1, init: 0 }, { key: 'vy', label: 'Starting vy', unit: 'm/s', min: -20, max: 20, step: 0.1, init: 0 },
    { ...MU_S, init: 0.5 }, { ...MU_K, init: 0.4 }];
  get tag() { return Fmt.kg(this.mass); }
  get colour() { return Block.COLOURS[(this.id - 1 + Block.COLOURS.length * 10) % Block.COLOURS.length]; }
  // its two axes: along its bottom face, and up out of its top
  get u() { return V.polar(this.angle); }
  get v() { return V.left(this.u); }
  corners(c, ang) { c = c || this.pos; const u = V.polar(ang == null ? this.angle : ang), v = V.left(u), hw = this.w / 2, hh = this.h / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: c.x + u.x * a * hw + v.x * b * hh, y: c.y + u.y * a * hw + v.y * b * hh })); }
  outline() { return { pts: this.corners(), closed: true }; }
  get pad() { return 0.02; }
  choices() { return [{ ...frictionChoices(this), label: 'Friction on its faces' }]; }
}

class Surface extends Element {
  static info = { type: 'surface', name: 'Surface', angle: 0 };
  static OWN = [{ key: 'angle', label: 'Angle', unit: '°', min: 0, max: 359.9, step: 1, init: 0, wrap: true }, { key: 'length', label: 'Length', unit: 'm', min: 0.2, max: 12, step: 0.1, init: 3 },
    MU_S, MU_K];
  // named by what it is now ("Ramp 1", "Floor 2"), so the names on the bench and in the panel agree
  get name() { return this.kind; }
  get kind() { const a = this.angle; return a < 1e-9 ? 'Floor' : a > 0 && a < 89.999 ? 'Ramp' : Math.abs(a - 90) < 1e-9 || Math.abs(a - 270) < 1e-9 ? 'Wall' : Math.abs(a - 180) < 1e-9 ? 'Ceiling' : a > 270 ? 'Ramp' : 'Surface'; }
  get tag() { const k = this.kind; return k === 'Ramp' ? Fmt.deg(this.slope, 0) : ''; }
  // the slope as a student reads it: the angle between the face and the horizontal, 0 to 90
  get slope() { const a = Angle.wrap(this.angle); return a <= 90 ? a : a >= 270 ? 360 - a : a <= 180 ? 180 - a : a - 180; }
  get dir() { return V.polar(this.angle); }
  get normal() { return V.left(this.dir); }
  get a() { return this.pos; }
  get b() { return V.at(this.pos, this.dir, this.length); }
  outline() { return { pts: [this.a, this.b], closed: false }; }
  get pad() { return 0.06; }
  choices() { return [frictionChoices(this)]; }
}

class Pulley extends Element {
  static info = { type: 'pulley', name: 'Pulley', angle: 0 };
  static OWN = [{ key: 'r', label: 'Radius', unit: 'm', min: 0.02, max: 0.5, step: 0.01, init: 0.08 }];
  outline() { const pts = []; for (let i = 0; i < 12; i++) pts.push(V.add(this.pos, V.polar(i * 30, this.r))); return { pts, closed: true }; }
  get pad() { return 0.03; }
}

class Anchor extends Element {
  static info = { type: 'anchor', name: 'Anchor', angle: 0 };
  get pad() { return 0.08; }
}

// ---- links: they have no position of their own ----
class Link extends Element {
  static placed = false;
  get isLink() { return true; }
  // the ids of the elements it joins, in order
  get ends() { return []; }
  joins(id) { return this.ends.includes(id); }
  // where its ends are (the block's centre, the anchor's point)
  static point(el) { return el ? el.pos : null; }
  get pos() { const pts = this.path(); return pts.length ? pts[Math.floor(pts.length / 2)] : { x: 0, y: 0 }; }
  path() { return []; }
  outline() { return { pts: this.path(), closed: false }; }
  get pad() { return 0.05; }
}

class Rope extends Link {
  static info = { type: 'rope', name: 'Rope', angle: 0 };
  static OWN = [{ key: 'from', label: 'From', min: 0, max: 1e6, step: 1, int: true, init: 0, options: null, ref: true }, { key: 'to', label: 'To', min: 0, max: 1e6, step: 1, int: true, init: 0, ref: true },
    { key: 'via', list: true, init: [] }, { key: 'slack', label: 'Slack', unit: 'm', min: 0, max: 5, step: 0.05, init: 0 }];
  fields() { return [this.spec('slack')]; }
  get ends() { return [this.from, this.to]; }
  joins(id) { return this.from === id || this.to === id || this.via.includes(id); }
  get tag() { return ''; }
  path() { const sc = this.scene; if (!sc) return []; const g = Rope.geometry(this, (id) => sc.get(id)); return g ? g.pts : []; }
  // The rope's path at the given positions: straight runs tangent to each pulley, wrapped round it.
  // `get(id)` returns { x, y } (and r for a pulley) for each element. Returns { pts, length, ends } or null.
  static geometry(rope, get, posOf) {
    const A = get(rope.from), B = get(rope.to); if (!A || !B) return null;
    const pa = posOf ? posOf(rope.from) : A.pos, pb = posOf ? posOf(rope.to) : B.pos, pulleys = rope.via.map(get);
    if (pulleys.some((p) => !p || !(p instanceof Pulley))) return null;
    return Rope.route(pa, pulleys.map((p) => ({ c: p.pos, r: p.r })), pb, rope.wraps);
  }
  // `wraps` (one per pulley, +1 counter-clockwise, -1 clockwise) is worked out from the straight path through
  // the centres the first time and then kept, so that a rope never jumps to the other side of a pulley.
  static senses(pa, cs, pb) { const pts = [pa, ...cs, pb], out = [];
    for (let i = 1; i < pts.length - 1; i++) { const c = V.cross(V.sub(pts[i], pts[i - 1]), V.sub(pts[i + 1], pts[i])); out.push(c >= 0 ? 1 : -1); } return out; }
  // the line tangent to two circles (signed radii rho: +r keeps the centre on the right of travel... see below)
  static tangent(c1, rho1, c2, rho2) { const D = V.sub(c2, c1), d = V.len(D); if (d < 1e-9) return null; const s = (rho2 - rho1) / d; if (Math.abs(s) >= 1) return null;
    const th = Math.atan2(D.y, D.x) + Math.asin(s), dir = { x: Math.cos(th), y: Math.sin(th) }, L = V.left(dir);
    return { t1: V.add(c1, V.mul(L, rho1)), t2: V.add(c2, V.mul(L, rho2)), dir }; }
  // A pulley wrapped counter-clockwise (w = +1) has its centre to the LEFT of the rope's travel, so the tangent
  // point is c - r*left(d): signed radius rho = -w*r. Points are circles of radius 0.
  static route(pa, circles, pb, wraps) { const w = wraps && wraps.length === circles.length ? wraps : Rope.senses(pa, circles.map((c) => c.c), pb);
    const nodes = [{ c: pa, rho: 0 }, ...circles.map((c, i) => ({ c: c.c, rho: -w[i] * c.r, r: c.r, w: w[i] })), { c: pb, rho: 0 }];
    const legs = []; for (let i = 0; i + 1 < nodes.length; i++) { const t = Rope.tangent(nodes[i].c, nodes[i].rho, nodes[i + 1].c, nodes[i + 1].rho); if (!t) return null; legs.push(t); }
    let length = 0; const pts = [pa];
    for (let i = 0; i < legs.length; i++) { const lg = legs[i]; length += V.dist(lg.t1, lg.t2);
      if (i > 0) { const n = nodes[i], a0 = Math.atan2(legs[i - 1].t2.y - n.c.y, legs[i - 1].t2.x - n.c.x), a1 = Math.atan2(lg.t1.y - n.c.y, lg.t1.x - n.c.x);
        let sweep = (a1 - a0) * n.w; while (sweep < 0) sweep += 2 * Math.PI; while (sweep >= 2 * Math.PI) sweep -= 2 * Math.PI;
        length += n.r * sweep; const k = Math.max(1, Math.ceil(sweep / 0.2)); for (let j = 0; j <= k; j++) pts.push(V.add(n.c, V.polar(Angle.deg(a0 + n.w * sweep * j / k), n.r))); }
      pts.push(lg.t2); }
    // which way each end is pulled: along the first leg from A, back along the last leg from B
    return { pts, length, pullA: legs[0].dir, pullB: V.mul(legs[legs.length - 1].dir, -1), legA: V.dist(legs[0].t1, legs[0].t2), legB: V.dist(legs[legs.length - 1].t1, legs[legs.length - 1].t2), wraps: w, direct: circles.length === 0 }; }
}

class Spring extends Link {
  static info = { type: 'spring', name: 'Spring', angle: 0 };
  static OWN = [{ key: 'from', min: 0, max: 1e6, step: 1, int: true, init: 0, ref: true }, { key: 'to', min: 0, max: 1e6, step: 1, int: true, init: 0, ref: true },
    { key: 'k', label: 'Spring constant k', unit: 'N/m', min: 0.1, max: 5000, step: 1, init: 40 }, { key: 'rest', label: 'Natural length', unit: 'm', min: 0.05, max: 10, step: 0.05, init: 0.8 }];
  fields() { return [this.spec('k'), this.spec('rest')]; }
  get ends() { return [this.from, this.to]; }
  get tag() { return 'k = ' + Fmt.num(this.k, 1) + ' N/m'; }
  path() { const sc = this.scene; if (!sc) return []; const a = sc.get(this.from), b = sc.get(this.to); return a && b ? [a.pos, b.pos] : []; }
}

class Push extends Link {
  static info = { type: 'push', name: 'Applied force', angle: 0 };
  static OWN = [{ key: 'on', min: 0, max: 1e6, step: 1, int: true, init: 0, ref: true }, { key: 'F', label: 'Magnitude F', unit: 'N', min: 0, max: 2000, step: 0.5, init: 10 },
    { key: 'angle', label: 'Direction', unit: '°', min: 0, max: 359.9, step: 1, init: 0, wrap: true }, { key: 'rate', label: 'Grows by', unit: 'N/s', min: 0, max: 200, step: 0.5, init: 0 }];
  fields() { return [this.spec('F'), this.spec('angle'), this.spec('rate')]; }
  // its size at time t (it grows at `rate` from F)
  at(t) { return Math.max(0, this.F + (this.rate || 0) * (t || 0)); }
  get ends() { return [this.on]; }
  get tag() { return Fmt.N(this.F); }
  get force() { return V.polar(this.angle, this.F); }
  // The arrow as drawn, [tail, tip], for its block at centre c with tilt ang: the tip on the block's edge, the
  // length growing with F. Drawing it, clicking it and its handle all use this one shape.
  arrowAt(c, ang, w, h, F) { const d = V.polar(this.angle), u = V.polar(ang), v = V.left(u), edge = Math.min(Math.abs(w / 2 / (V.dot(d, u) || 1e-9)), Math.abs(h / 2 / (V.dot(d, v) || 1e-9)));
    const tip = V.at(c, d, -edge); return [V.at(tip, d, -(0.3 + Math.min(1, (F == null ? this.F : F) / 40))), tip]; }
  path() { const sc = this.scene; if (!sc) return []; const b = sc.get(this.on); return b ? this.arrowAt(b.pos, b.angle, b.w, b.h) : []; }
}

const ELEMENTS = { block: Block, surface: Surface, pulley: Pulley, anchor: Anchor, rope: Rope, spring: Spring, push: Push };
