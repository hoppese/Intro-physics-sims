// =====================================================================
// Scene -- what is on the bench as set up: the elements in the order they
// were added, and the switches for the whole bench. It names its elements
// ("Block 2"), keeps links honest (a rope whose block is deleted goes with
// it), and turns itself into text and back (undo, presets, share links).
// =====================================================================
class Scene {
  static MAX = 40;
  static VERSION = 1;
  static OPTS = { g: 9.8, fbd: true, grid: true, components: false, trails: false };
  static G_CHOICES = [9.8, 1.62, 3.71, 24.8];

  constructor() { this.els = []; this.nextId = 1; this.opts = { ...Scene.OPTS }; }
  get isEmpty() { return this.els.length === 0; }
  get full() { return this.els.length >= Scene.MAX; }
  get(id) { return this.els.find((e) => e.id === id) || null; }
  ofType(C) { return this.els.filter((e) => e instanceof C); }
  get blocks() { return this.ofType(Block); }
  get links() { return this.els.filter((e) => e.isLink); }

  // `spec` is what toJSON() gives (or a preset's shorthand); returns the element, or null
  add(spec) { if (this.full) return null; const el = spec instanceof Element ? spec : Element.from(spec); if (!el) return null;
    if (!el.id || this.get(el.id)) el.id = this.nextId; this.nextId = Math.max(this.nextId, el.id + 1);
    if (el.isLink && !this.linkOk(el)) return null;
    el.scene = this; this.els.push(el); return el; }
  // a link must join things that are there, of the right kinds
  linkOk(el) { const isEnd = (id) => { const e = this.get(id); return e instanceof Block || e instanceof Anchor; };
    if (el instanceof Rope) return isEnd(el.from) && isEnd(el.to) && el.from !== el.to && el.via.every((id) => this.get(id) instanceof Pulley) && new Set(el.via).size === el.via.length;
    if (el instanceof Spring) return isEnd(el.from) && isEnd(el.to) && el.from !== el.to && (this.get(el.from) instanceof Block || this.get(el.to) instanceof Block);
    if (el instanceof Push) return this.get(el.on) instanceof Block;
    return false; }
  // removes the element and every link that needed it; returns what went
  remove(id) { const el = this.get(id); if (!el) return [];
    const gone = [el, ...this.links.filter((l) => l !== el && l.joins(id))];
    this.els = this.els.filter((e) => !gone.includes(e)); for (const g of gone) g.scene = null; return gone; }

  // "Block 1", "Rope 2": numbered among elements of the same name, in the order they were added
  labels() { const count = {}, out = new Map();
    for (const el of this.els) { const n = (count[el.name] = (count[el.name] || 0) + 1); out.set(el.id, el.name + ' ' + n); }
    return out; }
  label(el) { return this.labels().get(el.id) || el.name; }

  toJSON() { const o = { v: Scene.VERSION, els: this.els.map((e) => e.toJSON()) }, opts = {};
    for (const k of Object.keys(Scene.OPTS)) if (this.opts[k] !== Scene.OPTS[k]) opts[k] = typeof Scene.OPTS[k] === 'boolean' ? (this.opts[k] ? 1 : 0) : this.opts[k];
    if (Object.keys(opts).length) o.opts = opts; return o; }
  // Builds a scene from such an object. Anything it does not understand is left out, every number goes
  // through the element's own limits, and links to things that are not there are dropped.
  static from(o) { const s = new Scene(); if (!o || typeof o !== 'object') return s;
    const els = Array.isArray(o.els) ? o.els.filter((e) => e && typeof e === 'object') : [];
    // (links last, so that what they join is already there)
    const C = (e) => ELEMENTS[e.t], isLink = (e) => C(e) && C(e).placed === false;
    for (const e of [...els.filter((e) => !isLink(e)), ...els.filter(isLink)]) { if (s.full) break; s.add({ ...e, id: e.id | 0 }); }
    if (o.opts && typeof o.opts === 'object') for (const k of Object.keys(Scene.OPTS)) { const v = o.opts[k]; if (v === undefined) continue;
      if (typeof Scene.OPTS[k] === 'boolean') s.opts[k] = !!v; else if (isFinite(Number(v))) s.opts[k] = Math.max(0, Math.min(50, Number(v))); }
    return s; }
  snapshot() { return JSON.stringify(this.toJSON()); }
  static restore(text) { try { return Scene.from(JSON.parse(text)); } catch (e) { return new Scene(); } }
  clone() { return Scene.restore(this.snapshot()); }

  // ---- share links: the same JSON, packed for a URL ----
  encode() { const o = this.toJSON(), txt = JSON.stringify({ v: Scene.VERSION, e: o.els.map((e) => Scene.pack(e)), o: o.opts });
    return Scene.b64(unescape(encodeURIComponent(txt))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  static decode(code) { try { if (typeof code !== 'string' || code.length > 20000) return null; const txt = decodeURIComponent(escape(Scene.unb64(code.replace(/-/g, '+').replace(/_/g, '/')))), o = JSON.parse(txt);
      if (!o || !Array.isArray(o.e)) return null; return Scene.from({ els: o.e.map((e) => Scene.unpack(e)).filter(Boolean), opts: o.o }); } catch (err) { return null; } }
  // an element as a short array: [type, id, (x, y,) ...its own settings in order]
  static pack(e) { const C = ELEMENTS[e.t], head = C.placed === false ? [e.t, e.id] : [e.t, e.id, e.x, e.y]; return head.concat(C.OWN.map((s) => e[s.key])); }
  static unpack(a) { if (!Array.isArray(a)) return null; const C = ELEMENTS[a[0]]; if (!C) return null; const o = { t: a[0], id: a[1] }; let i = 2;
    if (C.placed !== false) { o.x = a[2]; o.y = a[3]; i = 4; }
    C.OWN.forEach((s, k) => { const v = a[i + k]; if (v !== undefined && v !== null) o[s.key] = v; }); return o; }
  static b64(s) { return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); }
  static unb64(s) { return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); }

  bounds() { const els = this.els.filter((e) => !e.isLink); if (!els.length) return null; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of els) { const b = el.bounds(); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    return { x0, y0, x1, y1 }; }
}
