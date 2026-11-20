// =====================================================================
// Elements -- everything that can stand on the bench.
//
//   Element                     a place, a direction, and a list of settings
//     Source                    sends rays out: one colour, or white
//       Laser                   a single ray
//       Beam                    parallel rays, side by side
//       Lamp                    a point source: rays fanning out from one point
//       Figure                  an object with a height: an arrow, or a picture
//     Lens                      f > 0 converging, f < 0 diverging; ideal, or a real piece of glass
//     Mirror                    flat, concave or convex; ideal, or truly spherical
//     Solid                     a piece of glass: refracts, disperses, reflects inside
//       Prism / Block / HalfDisc
//     Screen                    stops light and shows where it landed
//
// An element answers three kinds of question:
//   the tracer's   emit()  surfaces()  interact(ray, hit, opts)
//   the panel's    kind  tag  fields()  choices()  set(key, value)
//   the hand's     outline()  near(p)  bounds()  grip  aim(p)
//
// `angle` is the way the element points: the way a source shines, the axis of a
// lens, the way a mirror's reflecting side faces, the turn of a piece of glass.
// In the element's own frame that direction is +x, and toWorld() carries a point
// from that frame to the bench.
//
// Two switches belong to the whole bench, not to one element (Scene.OPTS): `real` makes
// every lens and curved mirror a true spherical surface, and `chroma` lets the glass of a
// lens disperse. An element finds them through `scene`, which the Scene sets when the
// element is put on it; an element on no bench is ideal.
// =====================================================================
const BOARD = { x0: -160, y0: -110, x1: 160, y1: 110 };      // the bench, in cm; nothing is placed outside it

class Element {
  static info = { type: '', name: 'Element', angle: 0 };
  static COMMON = [
    { key: 'x', label: 'x', unit: 'cm', min: BOARD.x0, max: BOARD.x1, step: 1 },
    { key: 'y', label: 'y', unit: 'cm', min: BOARD.y0, max: BOARD.y1, step: 1 },
    { key: 'angle', label: 'Angle', unit: '°', min: -3600, max: 3600, step: 5 },
  ];
  static OWN = [];                       // the settings a subclass adds
  constructor(o) { this.id = 0; this.scene = null; this.x = 0; this.y = 0; this.angle = this.constructor.info.angle || 0;
    for (const s of this.constructor.OWN) this[s.key] = s.init;
    if (o) for (const k of Object.keys(o)) { if (k === 'id') this.id = o.id | 0; else this.set(k, o[k]); } }
  get type() { return this.constructor.info.type; }
  get name() { return this.constructor.info.name; }      // what it is numbered as: "Lens 2"
  get kind() { return this.constructor.info.name; }      // what the card calls it: "Diverging lens"
  get tag() { return ''; }                               // the one number worth writing beside it
  get pos() { return { x: this.x, y: this.y }; }
  get dir() { return V.polar(this.angle); }
  get across() { return V.left(this.dir); }
  get real() { return !!(this.scene && this.scene.opts.real); }          // true spherical surfaces?
  get chroma() { return !!(this.scene && this.scene.opts.chroma); }      // does a lens's glass disperse?
  get glassy() { return false; }                                         // a body of glass that light travels inside
  toWorld(l) { const d = this.dir; return { x: this.x + l.x * d.x - l.y * d.y, y: this.y + l.x * d.y + l.y * d.x }; }

  // ---- settings ----
  specs() { return Element.COMMON.concat(this.constructor.OWN); }
  spec(key) { return this.specs().find((s) => s.key === key) || null; }
  // the numbers the card shows right now (a flat mirror has no focal length to show)
  fields() { return this.specs().filter((s) => !s.options && this.shows(s.key)); }
  shows(key) { return true; }
  choices() { return []; }               // [{ label, items: [{ label, on, title, pick() }] }]
  // Every change to an element comes through here, so a value is always inside its range.
  set(key, v) { const s = this.spec(key); if (!s) return false;
    if (s.options) { if (!s.options.includes(v)) return false; this[key] = v; }
    else { v = Number(v); if (!isFinite(v)) return false; v = Math.max(s.min, Math.min(s.max, v)); v = Math.round(v * 1e6) / 1e6;
      if (key === 'angle') v = Angle.wrap(v); if (s.int) v = Math.round(v); this[key] = v; }
    this.settle(key); return true; }
  settle(key) {}                         // a subclass's own rules (a focal length is never zero)
  toJSON() { const o = { t: this.type, id: this.id, x: this.x, y: this.y, angle: this.angle }; for (const s of this.constructor.OWN) o[s.key] = this[s.key]; return o; }
  static from(o) { const C = o && ELEMENTS[o.t]; if (!C) return null; const el = new C(); el.id = o.id | 0;
    for (const s of el.specs()) if (o[s.key] !== undefined) el.set(s.key, o[s.key]); return el; }
  clone() { return Element.from(this.toJSON()); }

  // ---- for the tracer ----
  get emits() { return false; }
  emit() { return []; }
  surfaces() { return []; }
  interact(ray, hit, opts) { return []; }

  // ---- for the hand ----
  // the shape, as bench points: what is picked, measured and outlined
  outline() { return { pts: [this.pos, this.pos], closed: false }; }
  get pad() { return 0; }                // how far the body reaches beyond that line, cm
  near(p) { const o = this.outline(), pts = o.pts, n = pts.length; if (o.closed && V.inside(p, pts)) return 0; let d = Infinity;
    for (let i = 0; i + 1 < n; i++) d = Math.min(d, V.toSeg(p, pts[i], pts[i + 1])); if (o.closed) d = Math.min(d, V.toSeg(p, pts[n - 1], pts[0]));
    return Math.max(0, d - this.pad); }
  bounds() { const pts = this.outline().pts, pad = this.pad; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }; }
  // the point (own frame) the turning handle hangs off; dragging the handle keeps it under the pointer
  get grip() { return { x: 9, y: 0 }; }
  aim(p, step) { let a = Angle.of(V.sub(p, this.pos)) - Angle.of(this.grip); if (step) a = Angle.snap(a, step); return this.set('angle', a); }
}

// ---------------------------------------------------------------------
// Sources. `nm` is the wavelength; 0 means white light.
// ---------------------------------------------------------------------
class Source extends Element {
  static COLOURS = [{ label: 'White', nm: 0 }, { label: 'Red', nm: 650 }, { label: 'Green', nm: 532 }, { label: 'Blue', nm: 450 }];
  static NM = { key: 'nm', label: 'Wavelength', unit: 'nm', min: Spectrum.MIN, max: Spectrum.MAX, step: 10, init: 650 };
  get emits() { return true; }
  get white() { return this.nm === 0; }
  get refNm() { return this.white ? Spectrum.REF : this.nm; }
  get wavelengths() { return this.white ? Spectrum.WHITE : [this.nm]; }
  get tag() { return this.white ? 'white' : Fmt.num(this.nm, 0) + ' nm'; }
  set(key, v) { if (key === 'nm' && Number(v) === 0) { this.nm = 0; return true; } return super.set(key, v); }
  shows(key) { return key !== 'nm' || !this.white; }
  choices() { return [{ label: 'Colour', items: Source.COLOURS.map((c) => ({ label: c.label, on: this.nm === c.nm, title: c.nm ? c.nm + ' nm' : 'Every colour at once: glass will spread it into a spectrum', pick: () => this.set('nm', c.nm) })) }]; }
  get pad() { return 1.7; }
}

class Laser extends Source {
  static info = { type: 'laser', name: 'Laser', angle: 0 };
  static OWN = [Source.NM];
  emit() { return [{ p: this.pos, d: this.dir, idx: 0 }]; }
  outline() { return { pts: [this.toWorld({ x: -7, y: 0 }), this.pos], closed: false }; }
}

class Beam extends Source {
  static info = { type: 'beam', name: 'Beam', angle: 0 };
  static OWN = [{ ...Source.NM, init: 0 }, { key: 'width', label: 'Width', unit: 'cm', min: 1, max: 80, step: 1, init: 16 }, { key: 'count', label: 'Rays', unit: '', min: 2, max: 41, step: 1, int: true, init: 7 }];
  get kind() { return 'Parallel beam'; }
  emit() { const d = this.dir, n = this.count, out = []; for (let i = 0; i < n; i++) out.push({ p: this.toWorld({ x: 0, y: -this.width / 2 + this.width * i / (n - 1) }), d, idx: i }); return out; }
  outline() { return { pts: [this.toWorld({ x: 0, y: -this.width / 2 }), this.toWorld({ x: 0, y: this.width / 2 })], closed: false }; }
  get pad() { return 1.4; }
}

class Lamp extends Source {
  static info = { type: 'lamp', name: 'Lamp', angle: 0 };
  static OWN = [{ ...Source.NM, init: 0 }, { key: 'spread', label: 'Spread', unit: '°', min: 2, max: 360, step: 5, init: 40 }, { key: 'count', label: 'Rays', unit: '', min: 2, max: 61, step: 1, int: true, init: 9 }];
  get kind() { return 'Point source'; }
  // a full circle is shared out evenly; anything less has a ray along each edge of the fan
  emit() { const n = this.count, s = this.spread, full = s >= 360, out = [];
    for (let i = 0; i < n; i++) out.push({ p: this.pos, d: V.polar(this.angle - s / 2 + (full ? s * i / n : s * i / (n - 1))), idx: i }); return out; }
  get pad() { return 2.4; }
}

// ---------------------------------------------------------------------
// An object: something with a height, standing at right angles to the way it faces
// (its foot is the element's position). The light that is followed leaves its tip, as in
// a textbook's ray diagram: either the three principal rays of the first lens or curved
// mirror it faces, or a fan. A few unseen rays from its foot let the tracer find the image
// of the foot too, so that the image of the whole object can be drawn.
// ---------------------------------------------------------------------
class Figure extends Source {
  static info = { type: 'object', name: 'Object', angle: 0 };
  // the pictures it can be: how far each reaches behind and in front of the foot-to-tip line, as a fraction of the height
  static PICTURES = [{ key: 'arrow', label: 'Arrow', u0: 0, u1: 0 }, { key: 'tree', label: 'Tree', u0: -0.3, u1: 0.3 }, { key: 'dog', label: 'Dog', u0: -0.86, u1: 0.36 }];
  static OWN = [{ ...Source.NM, init: 0 }, { key: 'height', label: 'Height', unit: 'cm', min: 1, max: 100, step: 1, init: 10 },
    { key: 'spread', label: 'Spread', unit: '°', min: 2, max: 120, step: 2, init: 20 }, { key: 'count', label: 'Rays', unit: '', min: 2, max: 41, step: 1, int: true, init: 5 },
    { key: 'rays', options: ['principal', 'fan'], init: 'principal' }, { key: 'picture', options: Figure.PICTURES.map((p) => p.key), init: 'arrow' }];
  get tag() { return 'h = ' + Fmt.cm(this.height); }
  get tip() { return this.toWorld({ x: 0, y: this.height }); }
  get shape() { return Figure.PICTURES.find((p) => p.key === this.picture); }
  // The first lens or curved mirror it faces: the one its principal rays are drawn for.
  get target() { const sc = this.scene; if (!sc) return null; let best = null, bt = Infinity;
    for (const el of sc.els) { if (!(el instanceof Lens) && !(el instanceof Mirror && el.curved)) continue;
      const w = V.sub(el.pos, this.pos), t = V.dot(w, this.dir); if (t < 1e-6 || t >= bt) continue;
      if (Math.abs(V.cross(this.dir, w)) > el.height / 2 + this.height) continue;      // (well off to one side: not what it faces)
      if (el instanceof Mirror && V.dot(el.dir, w) >= 0) continue;                       // (a mirror seen from behind)
      bt = t; best = el; }
    return best; }
  // The three principal rays from the tip, for that lens or mirror: parallel to its axis, at its centre,
  // and along the line through its focal point. null if they cannot be told apart (the tip is on the axis).
  principals() { const el = this.rays === 'principal' ? this.target : null; if (!el) return null;
    const T = this.tip, w = V.sub(el.pos, T), u = el instanceof Mirror ? V.mul(el.dir, -1) : V.mul(el.dir, V.dot(w, el.dir) < 0 ? -1 : 1);
    if (Math.abs(V.cross(u, w)) < 0.2 || V.dot(w, u) < 0.5) return null;
    const out = [u, V.unit(w)], F = V.at(el.pos, u, -el.f); let d = V.sub(F, T);
    if (V.len(d) > 1e-6) { d = V.unit(d); if (V.dot(d, u) < 0) d = V.mul(d, -1); if (V.dot(d, u) > 0.05) out.push(d); }
    return out; }
  get principal() { return !!this.principals(); }
  shows(key) { return key === 'spread' || key === 'count' ? !this.principal : super.shows(key); }
  choices() { const pick = (key, label, v, title) => ({ label, on: this[key] === v, title, pick: () => this.set(key, v) });
    return super.choices().concat([
      { label: 'Picture', items: Figure.PICTURES.map((p) => pick('picture', p.label, p.key, p.key === 'arrow' ? 'The arrow of a ray diagram' : 'A picture, so that an inverted or mirrored image is easy to see')) },
      { label: 'Rays from its tip', items: [pick('rays', 'Principal rays', 'principal', 'The three rays of a ray diagram, for the first lens or curved mirror the object faces'), pick('rays', 'Fan', 'fan', 'Evenly spread rays, through Spread, centred on Angle')] }]); }
  emit() { const T = this.tip, pr = this.principals(), out = [], n = this.count, s = this.spread;
    if (pr) pr.forEach((d, i) => out.push({ p: T, d, idx: i }));
    else for (let i = 0; i < n; i++) out.push({ p: T, d: V.polar(this.angle - s / 2 + s * i / (n - 1)), idx: i });
    // the unseen rays from the foot: a narrow fan at whatever the object faces
    const t = this.target, aim = t ? Angle.of(V.sub(t.pos, this.pos)) : this.angle;
    for (let i = 0; i < 3; i++) out.push({ p: this.pos, d: V.polar(aim + 2.5 * (i - 1)), idx: i, ghost: true });
    return out; }
  // an arrow is picked along its length; a picture anywhere in the box it fills
  outline() { const sh = this.shape, h = this.height; if (sh.u0 === sh.u1) return { pts: [this.pos, this.tip], closed: false };
    return { pts: [{ x: sh.u0 * h, y: 0 }, { x: sh.u1 * h, y: 0 }, { x: sh.u1 * h, y: h }, { x: sh.u0 * h, y: h }].map((p) => this.toWorld(p)), closed: true }; }
  get pad() { return this.picture === 'arrow' ? 1.6 : 0.5; }
}

// ---------------------------------------------------------------------
// Solids: glass and the like. The boundary is a closed, counter-clockwise run of
// straight edges and arcs, each knowing which way is out. A ray is entering when it
// meets an edge against its outward normal and leaving when it meets it along it.
// ---------------------------------------------------------------------
class Solid extends Element {
  static N = { key: 'n', label: 'Index n', unit: '', min: 1, max: 3, step: 0.01, init: 1.52 };
  static SPREAD = { key: 'spread', label: 'Dispersion', unit: '', min: 0, max: 0.2, step: 0.002, init: 0.018 };
  get tag() { return 'n = ' + Fmt.num(this.n, 3); }
  indexAt(nm) { return Glass.index(this.n, this.spread, nm); }
  get material() { return Glass.named(this.n, this.spread); }
  get glassy() { return true; }
  // the chips that set both numbers of a named glass at once (a lens offers the same ones)
  static materials(el) { return { label: 'Material', items: Glass.MATERIALS.map((m) => ({ label: m.label, on: el.material === m, title: 'n = ' + m.n + ' for yellow light; violet minus red = ' + m.spread, pick: () => { el.set('n', m.n); return el.set('spread', m.spread); } })) }; }
  choices() { return [Solid.materials(this)]; }
  // corners in the element's own frame, counter-clockwise
  corners() { return []; }
  outline() { return { pts: this.corners().map((c) => this.toWorld(c)), closed: true }; }
  surfaces() { const pts = this.outline().pts, out = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = V.dist(a, b) || 1; out.push({ kind: 'seg', a, b, n: { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }, part: i }); }
    return out; }
  interact(ray, hit, opts) { return Solid.snell(this.indexAt(ray.nm || Spectrum.REF), ray, hit, opts); }
  // Snell's law in vector form, at a surface of glass of index nG in air. N is turned to face the
  // incoming ray; `inside` records whether the ray that carries on is in the glass.
  static snell(nG, ray, hit, opts) { const d = ray.d; let N = hit.N, c1 = -V.dot(d, N), n1 = 1, n2 = nG; const entering = c1 > 0;
    if (!entering) { N = V.mul(N, -1); c1 = -c1; n1 = nG; n2 = 1; }
    const r = n1 / n2, s2 = r * r * Math.max(0, 1 - c1 * c1), refl = { x: d.x + 2 * c1 * N.x, y: d.y + 2 * c1 * N.y };
    hit.Nin = N; hit.n1 = n1; hit.n2 = n2; hit.th1 = Angle.deg(Math.acos(Math.min(1, c1)));
    if (s2 > 1) { hit.how = 'tir'; hit.th2 = hit.th1; hit.inside = true; return [{ d: V.unit(refl), I: ray.I }]; }
    const c2 = Math.sqrt(1 - s2), k = r * c1 - c2, out = V.unit({ x: r * d.x + k * N.x, y: r * d.y + k * N.y });
    hit.how = 'refract'; hit.th2 = Angle.deg(Math.asin(Math.min(1, Math.sqrt(s2)))); hit.inside = entering;
    let R = 0; if (opts && opts.partial) { const rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2), rp = (n1 * c2 - n2 * c1) / (n1 * c2 + n2 * c1); R = (rs * rs + rp * rp) / 2; }
    hit.R = R; const outs = [{ d: out, I: ray.I * (1 - R) }]; if (R > 0) outs.push({ d: V.unit(refl), I: ray.I * R, inside: !entering });
    return outs; }
}

// ---------------------------------------------------------------------
// Lenses.
//   ideal   a thin lens: a ray that meets it a height h from its centre leaves with its
//           slope (measured against the lens's axis) changed by -h/f, whatever its angle.
//           That is the thin-lens equation, exactly, for every ray.
//   real    (the bench's `real` switch) a piece of glass with two spherical faces of the same
//           radius, obeying Snell's law at each: rays far from the axis are bent too much
//           (spherical aberration).
// With the bench's `chroma` switch the glass disperses, so each colour has its own focal
// length (chromatic aberration); f is then the focal length for yellow light.
// ---------------------------------------------------------------------
class Lens extends Element {
  static info = { type: 'lens', name: 'Lens', angle: 0 };
  static OWN = [{ key: 'f', label: 'Focal length', unit: 'cm', min: -200, max: 200, step: 1, init: 20 }, { key: 'height', label: 'Height', unit: 'cm', min: 4, max: 160, step: 1, init: 36 },
    { ...Solid.N, min: 1.3, max: 2.5 }, Solid.SPREAD];
  static FMIN = 2;
  // A real lens keeps the height it is given unless its faces would meet: its half-height is at most this
  // fraction of their radius. (A strong, tall lens is very thick, and light near its rim is totally
  // internally reflected at the second face, as it would be in real glass.)
  static CAP = 0.9;
  get converging() { return this.f > 0; }
  get kind() { return this.converging ? 'Converging lens' : 'Diverging lens'; }
  get tag() { return 'f = ' + Fmt.cm(this.f); }
  get glassy() { return this.real; }
  get material() { return Glass.named(this.n, this.spread); }
  settle(key) { if (key === 'f' && Math.abs(this.f) < Lens.FMIN) this.f = (this.f < 0 ? -1 : 1) * Lens.FMIN; }
  // the glass only matters once the lens is real or disperses
  shows(key) { return key === 'n' ? this.real || this.chroma : key === 'spread' ? this.chroma : true; }
  choices() { const out = [{ label: 'Type', items: [
    { label: 'Converging', on: this.converging, title: 'A positive focal length: parallel rays are brought to a focus', pick: () => this.set('f', Math.abs(this.f)) },
    { label: 'Diverging', on: !this.converging, title: 'A negative focal length: parallel rays spread as if from a point behind the lens', pick: () => this.set('f', -Math.abs(this.f)) }] }];
    if (this.real || this.chroma) out.push(Solid.materials(this)); return out; }
  // what a colour feels: the index of the glass, and the focal length that goes with it
  indexAt(nm) { return this.chroma ? Math.max(1.05, Glass.index(this.n, this.spread, nm)) : this.n; }
  focalAt(nm) { return this.chroma ? this.f * (this.n - 1) / (this.indexAt(nm) - 1) : this.f; }

  // The real lens. Both faces have radius R; the lens is d thick on its axis and `edge` thick at its rim,
  // which is h from the axis. R is found so that rays near the axis focus exactly f from the middle
  // of the lens, where the ideal lens focuses them, so F on the bench means the same for both.
  // (Thick-lens formulas: 1/f' = (n-1)[2/R - (n-1)d/(nR^2)] for two convex faces, and the focus is
  // f'(1 - (n-1)d/(nR)) beyond the back face; concave faces change the sign of R.) A strong lens cannot
  // be tall: its faces would meet, so h is at most CAP x R.
  get form() { const key = this.f + '|' + this.height + '|' + this.n; if (this._form && this._form.key === key) return this._form;
    const n = this.n, f = this.f, sg = f > 0 ? 1 : -1;
    const at = (R) => { const h = Math.min(this.height / 2, Lens.CAP * R), sag = R - Math.sqrt(R * R - h * h), d = sg > 0 ? Math.min(0.6, 0.05 * R) + 2 * sag : Math.min(0.8, 0.08 * R),
      P = (n - 1) * (2 * sg / R - (n - 1) * d / (n * R * R)), back = (1 - (n - 1) * d * sg / (n * R)) / P; return { R, h, d, edge: d - 2 * sg * sag, focus: d / 2 + back }; };
    let lo = 1e-3, hi = 1e6; for (let i = 0; i < 90; i++) { const mid = Math.sqrt(lo * hi); if ((at(mid).focus - f) * sg < 0) lo = mid; else hi = mid; }
    const s = at(Math.sqrt(lo * hi)); s.key = key; s.capped = s.h < this.height / 2 - 1e-9; return (this._form = s); }
  get half() { return this.real ? this.form.h : this.height / 2; }       // from the axis to the rim
  get ends() { const h = this.half; return [this.toWorld({ x: 0, y: -h }), this.toWorld({ x: 0, y: h })]; }
  outline() { if (!this.real) return { pts: this.ends, closed: false };
    const s = this.form, sg = this.f > 0 ? 1 : -1, N = 14, x = (y) => s.d / 2 - sg * (s.R - Math.sqrt(Math.max(0, s.R * s.R - y * y))), pts = [];
    for (let i = 0; i <= N; i++) { const y = -s.h + 2 * s.h * i / N; pts.push({ x: x(y), y }); }             // up the back face
    for (let i = 0; i <= N; i++) { const y = s.h - 2 * s.h * i / N; pts.push({ x: -x(y), y }); }             // and down the front one
    return { pts: pts.map((p) => this.toWorld(p)), closed: true }; }
  get grip() { return { x: 0, y: this.half }; }
  surfaces() { const e = this.ends; if (!this.real) return [{ kind: 'seg', a: e[0], b: e[1], n: this.dir }];
    const s = this.form, sg = this.f > 0 ? 1 : -1, phi = Angle.deg(Math.asin(Math.min(1, s.h / s.R))), t = this.across, x = s.edge / 2;
    // each face is an arc about its own centre of curvature; `sign` says which way is out of the glass
    const face = (side) => ({ kind: 'arc', c: this.toWorld({ x: side * (s.d / 2 - sg * s.R), y: 0 }), r: s.R, a0: Angle.wrap(this.angle + (side * sg < 0 ? 180 : 0) - phi), sweep: 2 * phi, sign: sg, part: side < 0 ? 0 : 1 });
    return [face(-1), face(1), { kind: 'seg', a: this.toWorld({ x, y: s.h }), b: this.toWorld({ x: -x, y: s.h }), n: t, part: 2 }, { kind: 'seg', a: this.toWorld({ x: -x, y: -s.h }), b: this.toWorld({ x, y: -s.h }), n: V.mul(t, -1), part: 3 }]; }
  interact(ray, hit, opts) { const nm = ray.nm || Spectrum.REF; if (this.real) return Solid.snell(this.indexAt(nm), ray, hit, opts);
    const n = this.dir, t = this.across, dn = V.dot(ray.d, n); hit.how = 'lens';
    if (Math.abs(dn) < 1e-9) return [{ d: ray.d, I: ray.I }];
    const h = V.dot(V.sub(hit.q, this.pos), t), u = V.dot(ray.d, t) / Math.abs(dn) - h / this.focalAt(nm), s = dn < 0 ? -1 : 1;
    return [{ d: V.unit({ x: s * n.x + u * t.x, y: s * n.y + u * t.y }), I: ray.I }]; }
}

// ---------------------------------------------------------------------
// Mirrors. `angle` is the way the reflecting side faces; light that arrives from behind
// is stopped. f > 0 is concave (converging), f < 0 convex (diverging).
//   ideal    a thin mirror: reflects off a flat plane and then bends the ray just as a
//            lens of the same focal length would, so the mirror equation holds for every ray
//   real     (the bench's `real` switch) an arc of radius 2|f| obeying the law of reflection,
//            with the spherical aberration that comes with it
// ---------------------------------------------------------------------
class Mirror extends Element {
  static info = { type: 'mirror', name: 'Mirror', angle: 180 };
  static OWN = [{ key: 'flat', options: [0, 1], init: 1 },
    { key: 'f', label: 'Focal length', unit: 'cm', min: -200, max: 200, step: 1, init: 20 }, { key: 'height', label: 'Height', unit: 'cm', min: 4, max: 160, step: 1, init: 36 }];
  static FMIN = 2;
  get concave() { return !this.flat && this.f > 0; }
  get curved() { return !this.flat; }
  get sphere() { return this.curved && this.real; }
  get kind() { return this.flat ? 'Flat mirror' : this.f > 0 ? 'Concave mirror' : 'Convex mirror'; }
  get tag() { return this.flat ? '' : 'f = ' + Fmt.cm(this.f); }
  settle(key) { if (key === 'f' && Math.abs(this.f) < Mirror.FMIN) this.f = (this.f < 0 ? -1 : 1) * Mirror.FMIN; }
  shows(key) { return key !== 'f' || this.curved; }
  choices() { const curve = (label, flat, sign, title) => ({ label, on: flat ? !!this.flat : !this.flat && Math.sign(this.f) === sign, title, pick: () => { this.set('flat', flat ? 1 : 0); if (!flat) this.set('f', sign * Math.abs(this.f)); return true; } });
    return [{ label: 'Type', items: [curve('Flat', true, 0, 'A plane mirror'), curve('Concave', false, 1, 'Converging: a positive focal length'), curve('Convex', false, -1, 'Diverging: a negative focal length')] }]; }
  // a spherical mirror cannot be taller than the sphere it is cut from
  get radius() { return 2 * Math.abs(this.f); }
  get span() { return this.sphere ? Math.min(this.height, 1.9 * this.radius) : this.height; }
  get halfAngle() { return Angle.deg(Math.asin(Math.min(1, this.span / 2 / this.radius))); }
  get centre() { return this.toWorld({ x: 2 * this.f, y: 0 }); }        // the centre of curvature: in front if concave, behind if convex
  get ends() { const h = this.span / 2, sag = this.sphere ? (this.f > 0 ? 1 : -1) * (this.radius - Math.sqrt(Math.max(0, this.radius * this.radius - h * h))) : 0;
    return [this.toWorld({ x: sag, y: -h }), this.toWorld({ x: sag, y: h })]; }
  // the arc, as {c, r, a0, sweep} with the sweep counter-clockwise
  get arc() { const phi = this.halfAngle; return { c: this.centre, r: this.radius, a0: Angle.wrap(this.angle + (this.f > 0 ? 180 : 0) - phi), sweep: 2 * phi, sign: this.f > 0 ? -1 : 1 }; }
  outline() { if (!this.sphere) return { pts: this.ends, closed: false }; const a = this.arc, pts = [], N = 20;
    for (let i = 0; i <= N; i++) pts.push(V.add(a.c, V.polar(a.a0 + a.sweep * i / N, a.r))); return { pts, closed: false }; }
  get grip() { return { x: 0, y: -this.span / 2 }; }
  surfaces() { if (this.sphere) return [{ kind: 'arc', ...this.arc }]; const e = this.ends; return [{ kind: 'seg', a: e[0], b: e[1], n: this.dir }]; }
  interact(ray, hit) { const N = hit.N, dn = V.dot(ray.d, N); if (dn >= -1e-12) { hit.how = 'back'; return []; }
    let out = { x: ray.d.x - 2 * dn * N.x, y: ray.d.y - 2 * dn * N.y }; hit.how = 'reflect'; hit.Nin = N;
    if (this.curved && !this.sphere) { const t = this.across, h = V.dot(V.sub(hit.q, this.pos), t), u = V.dot(out, t) / V.dot(out, N) - h / this.f; out = V.unit({ x: N.x + u * t.x, y: N.y + u * t.y }); }
    else hit.th1 = hit.th2 = Angle.deg(Math.acos(Math.min(1, -dn)));      // (a real surface: the two angles are the law of reflection)
    return [{ d: out, I: ray.I }]; }
}

class Prism extends Solid {
  static info = { type: 'prism', name: 'Prism', angle: 0 };
  static OWN = [{ ...Solid.N, init: 1.62 }, { ...Solid.SPREAD, init: 0.04 }, { key: 'apex', label: 'Apex angle', unit: '°', min: 10, max: 150, step: 5, init: 60 }, { key: 'side', label: 'Side', unit: 'cm', min: 4, max: 120, step: 1, init: 30 }];
  // two equal sides of length `side` meeting at the apex angle; the centroid sits on the element's position,
  // with the apex up when the angle is 0
  corners() { const half = Angle.rad(this.apex / 2), b = this.side * Math.sin(half), H = this.side * Math.cos(half); return [{ x: -b, y: -H / 3 }, { x: b, y: -H / 3 }, { x: 0, y: 2 * H / 3 }]; }
  get grip() { return this.corners()[2]; }
}

class Block extends Solid {
  static info = { type: 'block', name: 'Block', angle: 0 };
  static OWN = [Solid.N, Solid.SPREAD, { key: 'width', label: 'Width', unit: 'cm', min: 2, max: 200, step: 1, init: 24 }, { key: 'height', label: 'Height', unit: 'cm', min: 2, max: 200, step: 1, init: 40 }];
  get kind() { return 'Glass block'; }
  corners() { const w = this.width / 2, h = this.height / 2; return [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }]; }
  get grip() { return { x: 0, y: this.height / 2 }; }
}

// A half-disc: the flat face is centred on the element's position and the curved side
// bulges the way the element points. A ray aimed at the centre of the flat face through
// the curved side crosses the curve along a radius, unbent -- the classic way to study
// refraction at one surface, and total internal reflection.
class HalfDisc extends Solid {
  static info = { type: 'half', name: 'Half-disc', angle: 0 };
  static OWN = [{ ...Solid.N, init: 1.49 }, { ...Solid.SPREAD, init: 0.016 }, { key: 'radius', label: 'Radius', unit: 'cm', min: 3, max: 80, step: 1, init: 22 }];
  get kind() { return 'Semicircular block'; }
  outline() { const pts = [], N = 28; for (let i = 0; i <= N; i++) pts.push(V.add(this.pos, V.polar(this.angle - 90 + 180 * i / N, this.radius))); return { pts, closed: true }; }
  surfaces() { const a = this.toWorld({ x: 0, y: this.radius }), b = this.toWorld({ x: 0, y: -this.radius }), d = this.dir;
    return [{ kind: 'arc', c: this.pos, r: this.radius, a0: Angle.wrap(this.angle - 90), sweep: 180, sign: 1, part: 0 }, { kind: 'seg', a, b, n: { x: -d.x, y: -d.y }, part: 1 }]; }
  get grip() { return { x: 0, y: this.radius }; }
}

class Screen extends Element {
  static info = { type: 'screen', name: 'Screen', angle: 180 };
  static OWN = [{ key: 'height', label: 'Height', unit: 'cm', min: 4, max: 220, step: 1, init: 50 }];
  get ends() { return [this.toWorld({ x: 0, y: -this.height / 2 }), this.toWorld({ x: 0, y: this.height / 2 })]; }
  outline() { return { pts: this.ends, closed: false }; }
  get grip() { return { x: 0, y: -this.height / 2 }; }
  get pad() { return 0.4; }
  surfaces() { const e = this.ends; return [{ kind: 'seg', a: e[0], b: e[1], n: this.dir }]; }
  interact(ray, hit) { hit.how = 'screen'; return []; }
}

const ELEMENTS = { laser: Laser, beam: Beam, lamp: Lamp, object: Figure, lens: Lens, mirror: Mirror, prism: Prism, block: Block, half: HalfDisc, screen: Screen };

// What "+ Add Element" offers: a label, the element to make, and the icon beside it.
const ADD_MENU = [
  { group: 'Light sources', key: 'laser', label: 'Laser (one ray)', hint: 'A single ray of one colour', make: { t: 'laser' } },
  { group: 'Light sources', key: 'white', label: 'White-light ray', hint: 'A single ray of every colour: send it through a prism', make: { t: 'laser', nm: 0 } },
  { group: 'Light sources', key: 'beam', label: 'Parallel beam', hint: 'Parallel rays, as from a very distant object', make: { t: 'beam' } },
  { group: 'Light sources', key: 'lamp', label: 'Point source', hint: 'Rays spreading from one point, as from a point on an object', make: { t: 'lamp' } },
  { group: 'Light sources', key: 'object', label: 'Object (arrow)', hint: 'Something with a height, so its image shows magnification and inversion. It can be a tree or a dog instead', make: { t: 'object' } },
  { group: 'Lenses', key: 'lens+', label: 'Converging lens', hint: 'A positive focal length: brings parallel rays to a focus', make: { t: 'lens', f: 20 } },
  { group: 'Lenses', key: 'lens-', label: 'Diverging lens', hint: 'A negative focal length: spreads parallel rays', make: { t: 'lens', f: -20 } },
  { group: 'Mirrors', key: 'flat', label: 'Flat mirror', hint: 'A plane mirror', make: { t: 'mirror', flat: 1 } },
  { group: 'Mirrors', key: 'concave', label: 'Concave mirror', hint: 'A converging mirror', make: { t: 'mirror', flat: 0, f: 20 } },
  { group: 'Mirrors', key: 'convex', label: 'Convex mirror', hint: 'A diverging mirror', make: { t: 'mirror', flat: 0, f: -20 } },
  { group: 'Glass', key: 'prism', label: 'Prism', hint: 'A triangular prism: choose its index and how strongly it disperses', make: { t: 'prism' } },
  { group: 'Glass', key: 'block', label: 'Glass block', hint: 'A rectangular slab', make: { t: 'block' } },
  { group: 'Glass', key: 'half', label: 'Semicircular block', hint: 'A half-disc, for refraction at a single flat face and total internal reflection', make: { t: 'half' } },
  { group: 'Detectors', key: 'screen', label: 'Screen', hint: 'Stops the light and shows where each ray lands', make: { t: 'screen' } },
];
