// =====================================================================
// Scene -- what is on the bench: the elements, in the order they were
// added, and the handful of switches that decide what is drawn. It knows
// how to name its elements ("Lens 2"), and how to turn itself into text
// and back (for undo, for presets and for share links).
// =====================================================================
class Scene {
  static MAX = 24;                          // elements on the bench at once
  static VERSION = 1;
  // what the View menu switches, and the two switches for the whole bench: `real` (true spherical
  // lenses and mirrors, with their aberration) and `chroma` (a lens's glass disperses)
  static OPTS = { images: true, extend: false, angles: false, partial: false, grid: true, real: false, chroma: false };

  constructor() { this.els = []; this.nextId = 1; this.opts = { ...Scene.OPTS }; }
  get isEmpty() { return this.els.length === 0; }
  get full() { return this.els.length >= Scene.MAX; }
  get(id) { return this.els.find((e) => e.id === id) || null; }
  get sources() { return this.els.filter((e) => e.emits); }
  ofType(C) { return this.els.filter((e) => e instanceof C); }

  // `spec` is what toJSON() gives (or a preset's shorthand); returns the new element, or null
  add(spec) { if (this.full) return null; const el = spec instanceof Element ? spec : Element.from(spec); if (!el) return null;
    if (!el.id || this.get(el.id)) el.id = this.nextId; this.nextId = Math.max(this.nextId, el.id + 1); el.scene = this; this.els.push(el); return el; }
  remove(id) { const i = this.els.findIndex((e) => e.id === id); if (i < 0) return null; const el = this.els.splice(i, 1)[0]; el.scene = null; return el; }

  // "Lens 1", "Lens 2", ...: numbered among elements of the same name, in the order they were added
  labels() { const count = {}, out = new Map();
    for (const el of this.els) { const n = (count[el.name] = (count[el.name] || 0) + 1); out.set(el.id, el.name + ' ' + n); }
    return out; }
  label(el) { return this.labels().get(el.id) || el.name; }

  // everything, as a plain object
  toJSON() { const o = { v: Scene.VERSION, els: this.els.map((e) => e.toJSON()) }, opts = {};
    for (const k of Object.keys(Scene.OPTS)) if (this.opts[k] !== Scene.OPTS[k]) opts[k] = this.opts[k] ? 1 : 0;
    if (Object.keys(opts).length) o.opts = opts; return o; }
  // Builds a scene from such an object. Anything it does not understand is left out,
  // and every number goes through the element's own limits, so no input can make a bad scene.
  static from(o) { const s = new Scene(); if (!o || typeof o !== 'object') return s;
    if (Array.isArray(o.els)) for (const e of o.els) { if (s.full) break; if (e && typeof e === 'object') s.add({ ...e, id: e.id | 0 }); }
    if (o.opts && typeof o.opts === 'object') for (const k of Object.keys(Scene.OPTS)) if (o.opts[k] !== undefined) s.opts[k] = !!o.opts[k];
    return s; }
  snapshot() { return JSON.stringify(this.toJSON()); }
  static restore(text) { try { return Scene.from(JSON.parse(text)); } catch (e) { return new Scene(); } }
  clone() { return Scene.restore(this.snapshot()); }

  // ---- share links: the same JSON, packed for a URL ----
  encode() { const o = this.toJSON(), txt = JSON.stringify({ v: Scene.VERSION, e: o.els.map((e) => Scene.pack(e)), o: o.opts });
    return Scene.b64(txt).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  static decode(code) { try { if (typeof code !== 'string' || code.length > 20000) return null; const txt = Scene.unb64(code.replace(/-/g, '+').replace(/_/g, '/')), o = JSON.parse(txt);
      if (!o || !Array.isArray(o.e)) return null; return Scene.from({ els: o.e.map((e) => Scene.unpack(e)).filter(Boolean), opts: o.o }); } catch (err) { return null; } }
  // an element as a short array: [type, x, y, angle, ...its own settings in order]
  static pack(e) { const C = ELEMENTS[e.t]; return [e.t, e.x, e.y, e.angle].concat(C.OWN.map((s) => e[s.key])); }
  static unpack(a) { if (!Array.isArray(a)) return null; const C = ELEMENTS[a[0]]; if (!C) return null; const o = { t: a[0], x: a[1], y: a[2], angle: a[3] };
    C.OWN.forEach((s, i) => { if (a[4 + i] !== undefined && a[4 + i] !== null) o[s.key] = a[4 + i]; }); return o; }
  static b64(s) { return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); }
  static unb64(s) { return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); }

  // the box around everything on the bench (null when it is empty)
  bounds() { if (this.isEmpty) return null; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of this.els) { const b = el.bounds(); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    return { x0, y0, x1, y1 }; }
}
