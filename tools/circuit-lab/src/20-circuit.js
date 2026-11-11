// =====================================================================
// Circuit -- the parts, the wire network, and every edit made to them.
//
// Wiring model. Wires live on the unit edges of the grid. Wire edges that
// meet at a grid point are connected, full stop: a T or a + is a junction
// (drawn with a dot) and there is no such thing as two wires crossing
// without touching. After every edit the edge set is regrouped into Wire
// objects -- maximal straight runs, broken at corners, junctions and part
// terminals -- so colinear wires merge and a wire that gains a junction
// splits, with no bookkeeping anywhere else.
//
// Rules the edits keep true:
//   * every wire is horizontal or vertical, on the grid;
//   * a wire never lies on a part's body and never touches the inside of one;
//   * two parts never overlap;
//   * moving or turning a part never changes what its wired terminals are
//     connected to -- the wires are re-routed to follow it. (The exceptions
//     are deliberate: Flip, and a half turn in place; see rotate.)
// Every edit is all-or-nothing: it returns {ok:false, why} and leaves the
// circuit exactly as it was when it cannot be done legally.
// =====================================================================
class Circuit {
  static REACH = 6;                  // how far (grid steps) "Clean up circuit" will slide a part
  static SLOTS = [[2, 5], [1, 8], [2, 14], [1, Infinity], [0, Infinity]];   // findSlot's search: [clear margin, reach] in turn
  static ROOMY = [[2, 5], [2, 24]];   // ... and the part of it that leaves room for every label
  static ROOM = 2;                   // grid steps of clear space "Clean up circuit" keeps between parts
  constructor(nc, nr) { this.NC = nc || 44; this.NR = nr || 30; this.elements = []; this.nextId = 1; this.autoEdges = new Set(); }

  // ---- access ----
  get parts() { return this.elements.filter((e) => !e.isWire); }
  get wires() { return this.elements.filter((e) => e.isWire); }
  byId(id) { return this.elements.find((e) => e.id === id) || null; }
  ofType(K) { return this.elements.filter((e) => e instanceof K); }
  get isEmpty() { return this.elements.length === 0; }
  get reactive() { return this.elements.some((e) => e.reactive); }
  // the point the solver knows that is electrically the grid point p: p itself where a terminal
  // or wire end sits, one end of the wire passing through it, null on bare grid
  anchor(p) { const k = P.key(p); for (const e of this.elements) for (const t of e.terminals()) if (P.key(t.p) === k) return t.p;
    for (const w of this.wires) if (P.line(w.a, w.b).some((q) => P.key(q) === k)) return w.a; return null; }
  inBounds(p) { return p.c >= 0 && p.c <= this.NC && p.r >= 0 && p.r <= this.NR; }
  // is every terminal of this part joined to something (a wire or another part)?
  wired(el) { return el.terminals().every((t) => this.elements.some((o) => o !== el && o.terminals().some((x) => P.eq(x.p, t.p)))); }
  snapshot() { return { els: this.elements.map((e) => e.clone()), nextId: this.nextId, auto: new Set(this.autoEdges) }; }
  // Puts a snapshot back. A part that is still here keeps its identity (the same
  // object, refilled), so anything holding a reference to it stays valid.
  restore(s) { const live = new Map(this.elements.map((e) => [e.id, e]));
    this.elements = s.els.map((e) => { const c = e.clone(), cur = live.get(e.id); if (!cur || cur.constructor !== c.constructor) return c;
      for (const k of Object.keys(cur)) delete cur[k]; return Object.assign(cur, c); });
    this.nextId = s.nextId; this.autoEdges = new Set(s.auto); return this; }
  // Puts a snapshot's layout back but leaves what the parts are doing (charge,
  // current, meter traces, switch positions) as it is now.
  restoreLayout(s) { const live = new Map(this.elements.map((e) => [e.id, e.liveState()])); this.restore(s);
    for (const e of this.elements) { const l = live.get(e.id); if (l) e.setLiveState(l); } return this; }
  resetState() { for (const e of this.elements) e.resetState(); }
  clear() { this.elements = []; this.autoEdges = new Set(); return this; }
  // id -> { n, text, tex }: parts of a kind are numbered in the order they were added
  labels() { const counts = {}, out = new Map(); for (const e of this.elements) { const pre = e.info.prefix; if (!pre) continue; const n = counts[pre] = (counts[pre] || 0) + 1; out.set(e.id, { n, text: e.labelText(n), tex: e.labelTex(n) }); } return out; }
  // grid points where three or more conductors meet (drawn as a dot)
  junctions() { const deg = new Map(); for (const e of this.wireEdges()) for (const p of P.edgeEnds(e)) { const k = P.key(p); deg.set(k, (deg.get(k) || 0) + 1); }
    for (const k of this.terminalMap(null).keys()) if (deg.has(k)) deg.set(k, deg.get(k) + this.terminalMap(null).get(k).length);
    return [...deg].filter(([k, n]) => n >= 3).map(([k]) => P.parse(k)); }
  // smallest grid box holding everything, or null when empty
  bounds() { let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity; for (const e of this.elements) for (const p of (e.isWire ? [e.a, e.b] : e.bodyPoints())) { c0 = Math.min(c0, p.c); c1 = Math.max(c1, p.c); r0 = Math.min(r0, p.r); r1 = Math.max(r1, p.r); }
    return isFinite(c0) ? { c0, c1, r0, r1 } : null; }

  // ---- the wire network as a set of unit edges ----
  wireEdges() { const S = new Set(); for (const w of this.elements) if (w.isWire) for (const e of P.edgesOf(w.a, w.b)) S.add(e); return S; }
  static adjacency(E) { const adj = new Map(); const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
    for (const e of E) { const [p, q] = P.edgeEnds(e); const a = P.key(p), b = P.key(q); link(a, b); link(b, a); } return adj; }
  // point key -> component number, for every point that has a wire edge
  static components(E) { const adj = Circuit.adjacency(E), comp = new Map(); let n = 0;
    for (const k of adj.keys()) { if (comp.has(k)) continue; n++; const st = [k]; comp.set(k, n); while (st.length) { const x = st.pop(); for (const y of adj.get(x)) if (!comp.has(y)) { comp.set(y, n); st.push(y); } } }
    return { adj, comp }; }
  // point key -> [{el, name}] for the terminals of every part except `skip`
  terminalMap(skip) { const m = new Map(); for (const e of this.elements) { if (e.isWire || e === skip) continue; for (const t of e.terminals()) { const k = P.key(t.p); if (!m.has(k)) m.set(k, []); m.get(k).push({ el: e, name: t.name }); } } return m; }
  // what the bodies of every part except `skip` occupy
  occupancy(skip) { const edges = new Set(), interior = new Set(); for (const e of this.elements) { if (e.isWire || e === skip) continue; for (const k of e.bodyEdges()) edges.add(k); for (const p of e.interiorPoints()) interior.add(P.key(p)); } return { edges, interior }; }

  // Rebuild the Wire objects from an edge set. A run keeps its old id when
  // its ends are unchanged, or else when it still covers the old wire's
  // first edge, so a selected wire usually stays selected through an edit.
  setWireEdges(E) {
    const terms = this.terminalMap(null); const deg = new Map();
    const bump = (k, ax) => { let d = deg.get(k); if (!d) { d = { h: 0, v: 0 }; deg.set(k, d); } d[ax]++; };
    for (const e of E) { const [p, q] = P.edgeEnds(e); const ax = e.endsWith('h') ? 'h' : 'v'; bump(P.key(p), ax); bump(P.key(q), ax); }
    const through = (k) => { const d = deg.get(k); return !terms.has(k) && d && ((d.h === 2 && d.v === 0) || (d.v === 2 && d.h === 0)); };
    const runs = [];
    const scan = (ax) => { const lanes = new Map();
      for (const e of E) { if (!e.endsWith(ax)) continue; const [p] = P.edgeEnds(e); const lane = ax === 'h' ? p.r : p.c, at = ax === 'h' ? p.c : p.r; if (!lanes.has(lane)) lanes.set(lane, []); lanes.get(lane).push(at); }
      for (const [lane, list] of lanes) { list.sort((x, y) => x - y); let s = list[0], prev = list[0];
        const pt = (i) => ax === 'h' ? { c: i, r: lane } : { c: lane, r: i };
        for (let i = 1; i <= list.length; i++) { const cur = list[i];
          if (i < list.length && cur === prev + 1 && through(P.key(pt(cur)))) { prev = cur; continue; }
          runs.push({ a: pt(s), b: pt(prev + 1) }); s = cur; prev = cur; } } };
    scan('h'); scan('v');
    const old = this.wires, used = new Set(), sig = (a, b) => P.key(a) + '|' + P.key(b);
    const bySig = new Map(old.map((w) => [sig(w.a, w.b), w])); for (const w of old) bySig.set(sig(w.b, w.a), w);
    for (const r of runs) { const w = bySig.get(sig(r.a, r.b)); if (w && !used.has(w.id)) { r.id = w.id; used.add(w.id); } }
    for (const w of old) { if (used.has(w.id)) continue; const first = P.edgesOf(w.a, w.b)[0]; if (!first) continue;
      const r = runs.find((x) => !x.id && P.edgesOf(x.a, x.b).includes(first)); if (r) { r.id = w.id; used.add(w.id); } }
    this.elements = this.parts.concat(runs.map((r) => { const w = new Wire(r.a, r.b); w.id = r.id || this.nextId++; return w; }));
    for (const e of this.autoEdges) if (!E.has(e)) this.autoEdges.delete(e);
    return this;
  }
  normalise() { return this.setWireEdges(this.wireEdges()); }

  // ---- routing ----
  // Shortest grid path from any source point to any target point, fewest
  // bends among the shortest. `open(k)` says whether a point may be used;
  // `banned` is a set of edges that may not. Returns edge keys, or null.
  route(sources, targets, open, banned) {
    for (const s of sources) if (targets.has(s)) return [];
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let layer = new Map(); const seen = new Set();
    for (const s of sources) for (let d = 0; d < 4; d++) { layer.set(s + '|' + d, { k: s, d, bends: 0, prev: null }); }
    // a source state carries no incoming direction, so the first step is never a bend
    for (const st of layer.values()) st.start = true;
    for (let guard = 0; guard < 4000 && layer.size; guard++) {
      const next = new Map();
      for (const [sk, st] of layer) { seen.add(sk); }
      for (const st of layer.values()) { const p = P.parse(st.k);
        for (let d = 0; d < 4; d++) { if (st.start && d !== st.d) continue;
          const q = { c: p.c + DIRS[d][0], r: p.r + DIRS[d][1] }; if (!this.inBounds(q)) continue;
          const qk = P.key(q); if (!targets.has(qk) && !open(qk)) continue;
          if (banned && banned.has(P.edge(p, q))) continue;
          const nk = qk + '|' + d; if (seen.has(nk)) continue;
          const bends = st.bends + ((st.start || d === st.d) ? 0 : 1);
          const cur = next.get(nk); if (!cur || bends < cur.bends) next.set(nk, { k: qk, d, bends, prev: st }); } }
      let best = null; for (const st of next.values()) if (targets.has(st.k) && (!best || st.bends < best.bends)) best = st;
      if (best) { const out = []; let s = best; while (s.prev) { out.push(P.edge(P.parse(s.prev.k), P.parse(s.k))); s = s.prev; } return out; }
      // never route THROUGH a target or a source: stop expanding from them
      for (const [nk, st] of [...next]) if (sources.has(st.k)) next.delete(nk);
      layer = next;
    }
    return null;
  }
  // cost of a set of wire edges forming one chain: length first, then bends
  static pathCost(edges) { let bends = 0; const deg = new Map();
    for (const e of edges) { const ax = e.endsWith('h') ? 1 : 16; for (const p of P.edgeEnds(e)) { const k = P.key(p); deg.set(k, (deg.get(k) || 0) + ax); } }
    for (const v of deg.values()) if (v === 17) bends++;
    return edges.length * 100 + bends; }

  // ---- the core edit: give a part a new shape, wiring follows ----
  // `el` may be a part already in the circuit (move / rotate / flip) or a
  // brand-new one (drop from the Add menu), which simply has no old wiring.
  //
  // Wire the sim laid itself while following a part ("auto" edges) is fair
  // game to rip up and lay again; wire the user drew is only ever extended,
  // or pulled back from the end that was attached to the part being moved.
  plan(el, geom) {
    const isNew = !this.elements.includes(el);
    const ghost = el.clone().setGeometry(geom);
    for (const p of ghost.bodyPoints()) if (!this.inBounds(p)) return { ok: false, why: 'off the grid' };
    const occ = this.occupancy(el), oTerm = this.terminalMap(el);
    const gEdges = ghost.bodyEdges(), gInt = new Set(ghost.interiorPoints().map(P.key)), gTerm = ghost.terminals().map((t) => ({ name: t.name, k: P.key(t.p) }));
    if (gEdges.some((e) => occ.edges.has(e))) return { ok: false, why: 'overlaps another part' };
    for (const k of gInt) if (occ.interior.has(k) || oTerm.has(k)) return { ok: false, why: 'overlaps another part' };
    for (const t of gTerm) if (occ.interior.has(t.k)) return { ok: false, why: 'overlaps another part' };

    const E0 = this.wireEdges(), before = Circuit.components(E0), at = (adj, k) => adj.get(k) || [];
    const oldTerms = isNew ? [] : el.terminals().map((t) => ({ name: t.name, k: P.key(t.p) }));
    const term0 = new Set([...oTerm.keys(), ...oldTerms.map((t) => t.k)]);
    const looseBefore = new Set(); for (const [k, nb] of before.adj) if (nb.length === 1 && !term0.has(k)) looseBefore.add(k);
    // which old net (if any) each terminal belongs to
    const groups = new Map();           // net token -> { seeds: [new point keys] }
    for (const t of oldTerms) { const wired = at(before.adj, t.k).length > 0; if (!wired && !oTerm.has(t.k)) continue;
      const token = wired ? 'n' + before.comp.get(t.k) : 'p' + t.k; if (!groups.has(token)) groups.set(token, { seeds: [] });
      groups.get(token).seeds.push(P.key(geom[t.name])); }
    const tokenAt = (k) => before.comp.has(k) ? (groups.has('n' + before.comp.get(k)) ? 'n' + before.comp.get(k) : null) : (groups.has('p' + k) ? 'p' + k : null);

    const E = new Set(E0); let spliced = false;
    const around = (k) => { const p = P.parse(k), out = []; for (const q of [P.add(p, 1, 0), P.add(p, -1, 0), P.add(p, 0, 1), P.add(p, 0, -1)]) { const e = P.edge(p, q); if (E.has(e)) out.push({ e, k: P.key(q) }); } return out; };
    // 1. rip up the auto-laid lead hanging off each old terminal
    for (const t of oldTerms) { if (oTerm.has(t.k)) continue; let k = t.k;
      for (let guard = 0; guard < 600; guard++) { const nb = around(k); if (nb.length !== 1 || !this.autoEdges.has(nb[0].e)) break; E.delete(nb[0].e); k = nb[0].k; if (oTerm.has(k)) break; } }
    // 2. wire under the new body is cut out; the part's own wiring that would
    //    poke into the body is pulled back; anyone else's is a refusal
    for (const e of gEdges) if (E.has(e)) { E.delete(e); if (!tokenAt(P.key(P.edgeEnds(e)[0]))) spliced = true; }
    for (const k of gInt) for (const nb of around(k)) { if (tokenAt(k)) E.delete(nb.e); else return { ok: false, why: 'a wire runs into it' }; }

    // 3. what is left of each net: its wire points and the other parts' terminals on it
    const label = new Map(), cur = Circuit.adjacency(E);
    for (const k of cur.keys()) label.set(k, tokenAt(k) || 'x');
    for (const k of oTerm.keys()) label.set(k, tokenAt(k) || 'x');
    const seedToken = new Map(); for (const [token, g] of groups) for (const s of g.seeds) seedToken.set(s, token);
    for (const t of gTerm) { const mine = seedToken.get(t.k) || null, there = label.get(t.k);
      if (mine && there && there !== mine) return { ok: false, why: 'that would connect two different nodes together' };
      if (!mine && there && there !== 'x') return { ok: false, why: 'would short the part out' }; }
    // 4. route each terminal back to what is left of its net
    const banned = new Set([...occ.edges, ...gEdges]), blocked = new Set([...occ.interior, ...gInt]), added = new Set();
    for (const [token, g] of groups) {
      const others = new Set(gTerm.map((t) => t.k).filter((k) => seedToken.get(k) !== token));
      const open = (k) => !blocked.has(k) && !others.has(k) && (!label.has(k) || label.get(k) === token);
      // (one terminal at a time: a part whose ends were wired to each other -- shorted out --
      //  has two terminals on this net, and each of them has to be led back to it)
      for (const seed of g.seeds) for (let guard = 0; guard < 40; guard++) {
        const adj = Circuit.adjacency(E), joined = new Set([seed]), st = [seed];
        while (st.length) { const x = st.pop(); for (const y of at(adj, x)) if (!joined.has(y)) { joined.add(y); st.push(y); } }
        const rest = new Set(); for (const [k, tk] of label) if (tk === token && !joined.has(k)) rest.add(k);
        for (const s of g.seeds) if (!joined.has(s)) rest.add(s);
        if (!rest.size) break;
        const path = this.route(joined, rest, open, banned);
        if (!path) return { ok: false, why: 'no room to route its wires' };
        for (const e of path) { E.add(e); added.add(e); for (const p of P.edgeEnds(e)) { const k = P.key(p); if (!label.has(k)) label.set(k, token); } }
      }
    }
    // 5. pull back any wire end the edit left hanging
    const termNow = new Set([...oTerm.keys(), ...gTerm.map((t) => t.k)]);
    for (let guard = 0; guard < 20; guard++) { let any = false;
      for (const [k, nb] of Circuit.adjacency(E)) if (nb.length === 1 && !termNow.has(k) && !looseBefore.has(k) && label.get(k) !== 'x') { Circuit.retract(E, k, termNow); any = true; }
      if (!any) break; }
    const auto = new Set(); for (const e of E) if (added.has(e) || this.autoEdges.has(e)) auto.add(e);
    return { ok: true, edges: E, auto, spliced, geom };
  }
  // remove a dangling run starting at point k, stopping at a terminal or junction
  static retract(E, k, terms) { for (let guard = 0; guard < 500; guard++) { if (terms.has(k)) return; const p = P.parse(k); let found = null, n = 0;
    for (const q of [P.add(p, 1, 0), P.add(p, -1, 0), P.add(p, 0, 1), P.add(p, 0, -1)]) { const e = P.edge(p, q); if (E.has(e)) { n++; found = { e, q }; } }
    if (n !== 1) return; E.delete(found.e); k = P.key(found.q); } }

  reshape(el, geom) {
    const sigBefore = this.netSignature(el);
    const pl = this.plan(el, geom); if (!pl.ok) return pl;
    const snap = this.snapshot(), isNew = !this.elements.includes(el);
    el.setGeometry(geom); if (isNew) { el.id = this.nextId++; this.elements.push(el); }
    this.autoEdges = pl.auto; this.setWireEdges(pl.edges);
    // belt and braces: the edit must not have joined nets (a splice may split one)
    if (!isNew && !Circuit.compatible(sigBefore, this.netSignature(el), pl.spliced)) { this.restore(snap); return { ok: false, why: 'would change the wiring' }; }
    return { ok: true, spliced: pl.spliced, el };
  }
  // For each wired terminal: which other terminals it is connected to by wire
  // alone. `focus` terminals that are unwired are left out (they may connect).
  netSignature(focus) { const E = this.wireEdges(), { adj, comp } = Circuit.components(E); const nets = new Map();
    for (const e of this.elements) { if (e.isWire) continue; for (const t of e.terminals()) { const k = P.key(t.p);
      const others = this.elements.some((o) => o !== e && !o.isWire && o.terminals().some((x) => P.eq(x.p, t.p)));
      if (e === focus && !(adj.get(k) || []).length && !others) continue;
      const net = comp.has(k) ? 'n' + comp.get(k) : 'p' + k; if (!nets.has(net)) nets.set(net, []); nets.get(net).push(e.id + ':' + t.name); } }
    return [...nets.values()].map((l) => l.sort()); }
  static compatible(before, after, splitOk) { const home = new Map(); before.forEach((l, i) => l.forEach((t) => home.set(t, i)));
    const seenHome = new Map();
    for (let j = 0; j < after.length; j++) { const hs = new Set(after[j].filter((t) => home.has(t)).map((t) => home.get(t))); if (hs.size > 1) return false;
      for (const h of hs) { if (seenHome.has(h) && seenHome.get(h) !== j && !splitOk) return false; seenHome.set(h, j); } }
    return true; }

  // ---- part edits ----
  insert(el) { return this.reshape(el, el.geometry()); }
  move(el, dc, dr) { if (el.isWire) return this.moveWire(el, dc, dr); return this.reshape(el, el.translated(dc, dr)); }
  // A quarter turn about the part's own middle, in the direction asked. What is
  // drawn afterwards is always that turn, or the part does not move at all:
  // the same key never turns a part one way now and the other way later.
  // The wires follow the terminals, so the circuit is unchanged -- when they
  // can. Half way round, a part wired in line sits on its old footprint with
  // its ends exchanged: the wires cannot follow that, or can only by each
  // running the length of the part to reach the far end (`crossed`). The part
  // is then turned end for end under its wires instead, as it would be on a
  // bench. That reverses a battery or a meter (`reversed`: the caller says
  // so) and changes nothing at all for a part with no direction, whose state
  // is carried over (turnEndForEnd). A turn there is no room for is refused,
  // with the reason.
  rotate(el, dir) { if (!el.info.rotatable) return { ok: false, why: 'cannot be rotated' };
    const want = el.rotated(dir), pl = this.plan(el, want);
    if (pl.ok && !this.crossed(el, want, pl)) return this.reshape(el, want);
    const back = { a: want.b, b: want.a }, foot = (g) => el.clone().setGeometry(g).bodyPoints().map(P.key).sort().join(' ');
    if (el.fields().length !== 2 || foot(back) !== foot(want) || !this.reshape(el, back).ok) return pl.ok ? this.reshape(el, want) : pl;
    el.setGeometry(want); el.turnEndForEnd();
    return { ok: true, el, swapped: true, reversed: el.flipChoices().length > 0 }; }
  // Would this placement leave a two-ended part wired back to front: each wired
  // end's wiring starting on the far side of the part's middle? ("Starts":
  // where the lead the sim lays to follow the part meets the rest of the wire.)
  crossed(el, geom, pl) { if (el.fields().length !== 2) return false;
    const E = pl.edges, others = this.terminalMap(el), mid = { c: (geom.a.c + geom.b.c) / 2, r: (geom.a.r + geom.b.r) / 2 }, u = { c: Math.sign(geom.b.c - geom.a.c), r: Math.sign(geom.b.r - geom.a.r) };
    const root = (p) => { let k = P.key(p), from = null; if (others.has(k)) return p;
      for (let guard = 0; guard < 600; guard++) { const o = P.parse(k), nb = [];
        for (const q of [P.add(o, 1, 0), P.add(o, -1, 0), P.add(o, 0, 1), P.add(o, 0, -1)]) { const e = P.edge(o, q); if (E.has(e) && e !== from) nb.push({ e, k: P.key(q) }); }
        if (!nb.length && from === null) return null; if (nb.length !== 1 || !pl.auto.has(nb[0].e)) break; from = nb[0].e; k = nb[0].k; if (others.has(k)) break; }
      return P.parse(k); };
    const side = (p) => (p.c - mid.c) * u.c + (p.r - mid.r) * u.r, ra = root(geom.a), rb = root(geom.b);
    return (!!ra || !!rb) && (!ra || side(ra) > 0) && (!rb || side(rb) < 0); }
  flip(el) { const choices = el.flipChoices(); if (!choices.length) return { ok: false, why: 'has no flip' };
    const pts = (o) => o.terminals().map((t) => P.key(t.p)).sort().join(' '); let first = null;
    for (const g of choices) { const ghost = el.clone().setGeometry(g);
      if (pts(ghost) === pts(el)) { el.setGeometry(g); return { ok: true, el }; }   // same footprint: just swaps which end is which
      const r = this.reshape(el, g); if (r.ok) return r; first = first || r; }
    return first; }
  // Taking out an ammeter leaves the circuit as it was: an ammeter is a piece of
  // wire that reads, and it was spliced into a wire, so the wire closes up again
  // (unless one of its leads was hanging loose anyway). Any other part leaves a gap.
  remove(el) { const E0 = this.wireEdges(), adj = Circuit.adjacency(E0), terms = this.terminalMap(el), held = (p) => adj.has(P.key(p)) || terms.has(P.key(p));
    const heal = el instanceof Ammeter && held(el.a) && held(el.b);
    this.elements = this.elements.filter((e) => e !== el); const E = this.wireEdges(); if (heal) for (const e of P.edgesOf(el.a, el.b)) E.add(e);
    this.setWireEdges(E); return { ok: true, healed: heal }; }

  // ---- wire edits ----
  // lay wire along a path of grid points (consecutive points share a row or column)
  checkPath(pts) { const occ = this.occupancy(null); const edges = [];
    for (let i = 1; i < pts.length; i++) { if (!P.aligned(pts[i - 1], pts[i])) return { ok: false, why: 'wires run along the grid' }; edges.push(...P.edgesOf(pts[i - 1], pts[i])); }
    if (!edges.length) return { ok: false, why: 'too short' };
    for (const e of edges) { if (occ.edges.has(e)) return { ok: false, why: 'runs along a part' };
      for (const p of P.edgeEnds(e)) { if (!this.inBounds(p)) return { ok: false, why: 'off the grid' }; if (occ.interior.has(P.key(p))) return { ok: false, why: 'runs through a part' }; } }
    return { ok: true, edges }; }
  // A way round when neither elbow fits: the shortest free path from one grid
  // point to another that touches no other wire or terminal on the way (so it
  // cannot join anything the user did not aim at). The wire already leading to
  // the aimed-at point counts as that point -- meeting it is the same connection
  // -- so the detour may end on it. Returns grid points or null.
  detour(from, to) { const occ = this.occupancy(null), fk = P.key(from), tk = P.key(to); if (occ.interior.has(fk) || occ.interior.has(tk)) return null;
    const E = this.wireEdges(), { adj, comp } = Circuit.components(E), targets = new Set([tk]);
    if (comp.has(tk)) for (const [k, n] of comp) if (n === comp.get(tk)) targets.add(k);
    if (targets.has(fk)) return null;                            // already joined by wire
    const busy = new Set([...adj.keys(), ...this.terminalMap(null).keys()]);
    const path = this.route(new Set([fk]), targets, (k) => !occ.interior.has(k) && !busy.has(k), occ.edges);
    if (!path || !path.length || path.length > Math.abs(to.c - from.c) + Math.abs(to.r - from.r) + 8) return null;
    const pts = [from]; let at = from;                           // edges come back target-first
    for (const e of path.slice().reverse()) { const [a, b] = P.edgeEnds(e); if (P.eq(a, at)) at = b; else if (P.eq(b, at)) at = a; else return null; pts.push(at); }
    return targets.has(P.key(at)) ? pts : null; }
  addWire(pts) { const c = this.checkPath(pts); if (!c.ok) return c; const E = this.wireEdges(); let fresh = 0; for (const e of c.edges) if (!E.has(e)) { E.add(e); fresh++; }
    if (!fresh) return { ok: false, why: 'there is already a wire there' };
    for (const e of c.edges) this.autoEdges.delete(e);          // drawn by hand: no longer the sim's to re-route
    this.setWireEdges(E); return { ok: true }; }
  // slide a straight run sideways; whatever it was joined to stays joined
  moveWire(w, dc, dr) {
    const own = P.edgesOf(w.a, w.b), E = this.wireEdges(); for (const e of own) E.delete(e);
    const occ = this.occupancy(null), terms = this.terminalMap(null), cur = Circuit.components(E);
    const oldPts = P.line(w.a, w.b), newPts = oldPts.map((p) => P.add(p, dc, dr));
    for (const p of newPts) { if (!this.inBounds(p)) return { ok: false, why: 'off the grid' }; if (occ.interior.has(P.key(p))) return { ok: false, why: 'runs through a part' }; }
    const fresh = P.edgesOf(newPts[0], newPts[newPts.length - 1]); if (fresh.some((e) => occ.edges.has(e))) return { ok: false, why: 'runs along a part' };
    // points the run was holding together
    const anchors = oldPts.map(P.key).filter((k) => (cur.adj.get(k) || []).length || terms.has(k));
    const ownComp = new Set(anchors.map((k) => cur.comp.get(k)).filter((n) => n != null)), anchorSet = new Set(anchors);
    const mine = (k) => anchorSet.has(k) || (cur.comp.has(k) && ownComp.has(cur.comp.get(k)));
    const foreign = (k) => !mine(k) && (cur.adj.has(k) || terms.has(k));
    for (const p of newPts) if (foreign(P.key(p))) return { ok: false, why: 'that would connect two different nodes together' };
    const sigBefore = this.netSignature(null), snap = this.snapshot();
    for (const e of fresh) E.add(e);
    const banned = occ.edges, open = (k) => !occ.interior.has(k) && !foreign(k);
    for (let guard = 0; guard < 40; guard++) { const adj = Circuit.adjacency(E), joined = new Set(newPts.map(P.key)), st = [...joined];
      while (st.length) { const x = st.pop(); for (const y of (adj.get(x) || [])) if (!joined.has(y)) { joined.add(y); st.push(y); } }
      const rest = new Set(anchors.filter((k) => !joined.has(k))); if (!rest.size) break;
      const path = this.route(joined, rest, open, banned); if (!path) return { ok: false, why: 'no room to route its wires' };
      for (const e of path) if (!E.has(e)) { E.add(e); this.autoEdges.add(e); } }
    // stubs left sticking out past the run's new position are pulled back
    const termSet = new Set(terms.keys()), keep = new Set(newPts.map(P.key));
    for (const k of [P.key(w.a), P.key(w.b)]) if (!keep.has(k)) Circuit.retract(E, k, new Set([...termSet, ...keep]));
    const id = w.id; this.setWireEdges(E);
    if (!Circuit.compatible(sigBefore, this.netSignature(null), false)) { this.restore(snap); return { ok: false, why: 'would change the wiring' }; }
    // hand the id to the run now lying where the wire was dropped
    const a = newPts[0], b = newPts[newPts.length - 1]; const first = fresh[0];
    const hit = this.wires.find((x) => P.edgesOf(x.a, x.b).includes(first));
    if (hit && hit.id !== id) { const clash = this.byId(id); if (clash) clash.id = this.nextId++; hit.id = id; }
    return { ok: true, el: this.byId(id) }; }

  // ---- tidying ----
  // The chain of wire leaving point k along edge e, up to the next terminal,
  // junction or loose end. Returns {edges, end}.
  chainFrom(E, adj, terms, k, e) { const edges = [e]; let prev = k; const ends = P.edgeEnds(e).map(P.key); let cur = ends[0] === k ? ends[1] : ends[0];
    for (let guard = 0; guard < 600; guard++) { const nb = adj.get(cur) || []; if (terms.has(cur) || nb.length !== 2) break; const nxt = nb[0] === prev ? nb[1] : nb[0]; edges.push(P.edge(P.parse(cur), P.parse(nxt))); prev = cur; cur = nxt; }
    return { edges, end: cur }; }
  // Re-lay wire chains along the shortest, straightest free path between the
  // same two ends. With `el`, the chains that start at its terminals, whenever
  // that is shorter (the wiring follows a part that has just moved). With no
  // `el`, every chain in the circuit, but only where that takes a turn out of
  // the drawing -- see turns(). Topology cannot change.
  straighten(el) { const terms = this.terminalMap(null), occ = this.occupancy(null); let E = this.wireEdges(), changed = false;
    const starts = el ? el.terminals().map((t) => P.key(t.p)) : [...new Set([...terms.keys(), ...[...Circuit.adjacency(E)].filter(([k, n]) => n.length > 2).map(([k]) => k)])];
    for (const k of starts) { for (let pass = 0; pass < 4; pass++) { const adj = Circuit.adjacency(E); const nb = adj.get(k) || []; if (pass >= nb.length) break;
      const ch = this.chainFrom(E, adj, terms, k, P.edge(P.parse(k), P.parse(nb[pass]))); if (ch.end === k) continue;
      const endNb = adj.get(ch.end) || []; if (!terms.has(ch.end) && endNb.length < 2) continue;      // a loose end: leave the user's stub alone
      const cost = Circuit.pathCost(ch.edges); const E2 = new Set(E); for (const e of ch.edges) E2.delete(e);
      const busy = new Set([...Circuit.adjacency(E2).keys(), ...terms.keys()]);
      const path = this.route(new Set([k]), new Set([ch.end]), (x) => !occ.interior.has(x) && !busy.has(x), occ.edges);
      if (!path || !path.length) continue; const was = el ? 0 : this.turns(E); for (const e of path) E2.add(e);
      if (el ? Circuit.pathCost(path) < cost : this.turns(E2) < was) { E = E2; changed = true; } } }
    if (changed) this.setWireEdges(E); return changed; }
  // remove every wire end that leads nowhere
  pruneLooseEnds() { const E = this.wireEdges(), terms = new Set(this.terminalMap(null).keys()); const n0 = E.size;
    for (let guard = 0; guard < 50; guard++) { const adj = Circuit.adjacency(E); let any = false; for (const [k, nb] of adj) if (nb.length === 1 && !terms.has(k)) { Circuit.retract(E, k, terms); any = true; } if (!any) break; }
    if (E.size !== n0) this.setWireEdges(E); return n0 - E.size; }
  tidyWires() { const a = this.pruneLooseEnds(); const b = this.straighten(null); return a > 0 || b; }
  // How plain the drawing is: the number of points where it changes direction --
  // a bend in a wire, a wire leaving a part sideways, a branch at a junction.
  // (A junction counts like a bend, or tidying would slide parts onto corners
  // just to turn them into junctions.) Tidying goes by this and not by wire
  // length: shortening wire just makes parts huddle together and knocks them
  // out of line, and how roomy a loop is drawn is the user's own choice.
  turns(E) { return this.bends(E).size; }
  bends(E) { const at = new Map(), add = (p, ax) => { const k = P.key(p), v = at.get(k) || [0, 0]; v[ax]++; at.set(k, v); };
    for (const e of E) { const ax = e.endsWith('h') ? 0 : 1; for (const p of P.edgeEnds(e)) add(p, ax); }
    for (const el of this.parts) { const segs = el.segments(); for (const t of el.terminals()) for (const [p, q] of segs) { const far = P.eq(p, t.p) ? q : P.eq(q, t.p) ? p : null; if (!far) continue;
      if (far.r === t.p.r) add(t.p, 0); else if (far.c === t.p.c) add(t.p, 1); } }
    const S = new Set(); for (const [k, [h, v]] of at) if (h && v) S.add(k); return S; }
  // The grid points of the wiring that hangs off one part: its terminals and every
  // chain that starts there, up to (not including) the junction a chain ends on --
  // a junction stays where it is whatever this part does.
  reachOf(el, E) { const terms = this.terminalMap(null), adj = Circuit.adjacency(E), S = new Set(); S.ends = [];
    for (const t of el.terminals()) { const k = P.key(t.p); S.add(k); for (const n of adj.get(k) || []) { const ch = this.chainFrom(E, adj, terms, k, P.edge(P.parse(k), P.parse(n))); for (const e of ch.edges) for (const p of P.edgeEnds(e)) S.add(P.key(p)); S.ends.push(ch.end); if (!terms.has(ch.end)) S.delete(ch.end); } }
    for (const t of el.terminals()) S.add(P.key(t.p)); return S; }
  // Slide parts along the grid wherever that takes turns out of the drawing
  // without using more wire. A part is never pushed up against another one:
  // tidying may not bring two parts closer than Circuit.ROOM grid steps unless
  // they were already that close. Moving a part only re-lays the wiring that
  // hangs off it, so a part whose own wiring is already straight is skipped, and
  // the only slides worth trying are the ones that bring a terminal into line
  // with a corner or an end of that wiring.
  tidyLayout() { let improved = this.tidyWires();
    const gaps = (el) => new Map(this.parts.filter((o) => o !== el).map((o) => [o.id, el.clearanceTo(o)]));
    const crowds = (el, was) => this.parts.some((o) => { if (o === el) return false; const d = el.clearanceTo(o); return d < Circuit.ROOM && d < (was.has(o.id) ? was.get(o.id) : Infinity); });
    const steps = []; for (let d = 1; d <= Circuit.REACH; d++) steps.push([d, 0], [-d, 0], [0, d], [0, -d]);      // nearest first: a tie goes to the smaller move
    for (let round = 0; round < 6; round++) { let any = false;
      for (const part of this.parts) { const E0 = this.wireEdges(), B = this.bends(E0), R = this.reachOf(part, E0); const hot = [...R].filter((k) => B.has(k)); if (!hot.length) continue;
        const mine = part.terminals().map((t) => t.p), marks = [...new Set([...hot, ...R.ends])].map(P.parse).filter((u) => !mine.some((p) => P.eq(p, u)));
        const lines = (dc, dr) => mine.some((p) => marks.some((u) => dr ? u.r === p.r + dr : u.c === p.c + dc));
        let best = B.size, bestSnap = null; const was = gaps(part);
        for (const [dc, dr] of steps) { if (!lines(dc, dr)) continue; const snap = this.snapshot(); const el = this.byId(part.id); if (!el) break;
          const r = this.reshape(el, el.translated(dc, dr)); if (r.ok && !r.spliced && !crowds(el, was)) { const E1 = this.wireEdges(), c = this.turns(E1); if (c < best && E1.size <= E0.size) { best = c; bestSnap = this.snapshot(); } }
          this.restore(snap); }
        if (bestSnap) { this.restore(bestSnap); this.straighten(null); any = true; improved = true; } }
      if (!any) break; }
    return improved; }

  // ---- placing new parts ----
  // Nearest spot to (c0, r0) where `make(c, r)` fits with a clear margin around it.
  findSlot(make, c0, r0, box, phases) { const used = new Set(); for (const e of this.elements) for (const p of (e.isWire ? P.line(e.a, e.b) : e.bodyPoints())) used.add(P.key(p));
    const fits = (el, margin) => { const pts = el.bodyPoints(); let c1 = Infinity, c2 = -Infinity, r1 = Infinity, r2 = -Infinity;
      for (const p of pts) { if (!this.inBounds(p)) return false; c1 = Math.min(c1, p.c); c2 = Math.max(c2, p.c); r1 = Math.min(r1, p.r); r2 = Math.max(r2, p.r); }
      if (box && (c1 < box.c0 || c2 > box.c1 || r1 < box.r0 || r2 > box.r1)) return false;
      // (a roomy slot keeps a label's height clear above and below, and is not hard against the top of the board)
      const tall = margin > 1 ? 1 : 0; if (tall && r1 < 3) return false;
      for (let c = c1 - margin; c <= c2 + margin; c++) for (let r = r1 - margin - (margin ? 1 : 0); r <= r2 + margin + tall; r++) if (used.has(c + ',' + r)) return false;
      return this.plan(el, el.geometry()).ok; };
    const cells = []; for (let c = 0; c <= this.NC; c++) for (let r = 0; r <= this.NR; r++) cells.push([c, r, Math.hypot(c - c0, (r - r0) * 1.4)]);
    cells.sort((x, y) => x[2] - y[2]);
    // roomy and close first, then tighter, then anywhere at all
    for (const [margin, reach] of phases || Circuit.SLOTS) for (const [c, r, d] of cells) { if (d > reach) break; const el = make(c, r); if (fits(el, margin)) return el; }
    if (box && !phases) return this.findSlot(make, c0, r0, null);
    return null; }

  // ---- share links ----
  encode() { return this.parts.concat(this.wires).map((e) => e.encode()).join('_'); }
  // Build a circuit from a share string. Anything that breaks the rules
  // (overlapping parts, wire lying on a part) is dropped rather than kept.
  static decode(str, nc, nr) { const c = new Circuit(nc, nr); const E = new Set(); const parts = [];
    for (const tok of String(str || '').split('_')) { if (!tok) continue; const el = Element.decode(tok); if (!el) continue; if (el.isWire) { for (const e of P.edgesOf(el.a, el.b)) E.add(e); } else parts.push(el); }
    const all = parts.flatMap((p) => p.bodyPoints()).concat([...E].flatMap((e) => P.edgeEnds(e)));
    for (const p of all) { if (p.c < 0 || p.r < 0) return c; c.NC = Math.max(c.NC, p.c + 2); c.NR = Math.max(c.NR, p.r + 2); }
    for (const el of parts) { const occ = c.occupancy(null), terms = c.terminalMap(null);
      const bad = el.bodyEdges().some((e) => occ.edges.has(e)) || el.interiorPoints().some((p) => occ.interior.has(P.key(p)) || terms.has(P.key(p))) || el.terminals().some((t) => occ.interior.has(P.key(t.p)));
      if (!bad) { el.id = c.nextId++; c.elements.push(el); } }
    const occ = c.occupancy(null);
    for (const e of [...E]) if (occ.edges.has(e) || P.edgeEnds(e).some((p) => occ.interior.has(P.key(p)))) E.delete(e);
    return c.setWireEdges(E); }

  // ---- self-check (used by the tests) ----
  problems() { const out = [], occ = this.occupancy(null); const seenE = new Set();
    for (const w of this.wires) { if (!P.aligned(w.a, w.b)) out.push('wire ' + w.id + ' is not on the grid lines'); if (!this.inBounds(w.a) || !this.inBounds(w.b)) out.push('wire ' + w.id + ' off grid');
      for (const e of P.edgesOf(w.a, w.b)) { if (seenE.has(e)) out.push('wire edge ' + e + ' twice'); seenE.add(e); if (occ.edges.has(e)) out.push('wire ' + w.id + ' on a body');
        for (const p of P.edgeEnds(e)) if (occ.interior.has(P.key(p))) out.push('wire ' + w.id + ' touches a body interior at ' + P.key(p)); } }
    const parts = this.parts; for (let i = 0; i < parts.length; i++) { const a = parts[i]; for (const p of a.bodyPoints()) if (!this.inBounds(p)) out.push(a.type + a.id + ' off grid');
      for (const f of a.fields()) if (!Number.isInteger(a[f].c) || !Number.isInteger(a[f].r)) out.push(a.type + a.id + ' off the grid points');
      for (let j = i + 1; j < parts.length; j++) { const b = parts[j]; const be = new Set(b.bodyEdges()), bi = new Set(b.interiorPoints().map(P.key)), bp = new Set(b.bodyPoints().map(P.key));
        if (a.bodyEdges().some((e) => be.has(e)) || a.interiorPoints().some((p) => bp.has(P.key(p))) || a.bodyPoints().some((p) => bi.has(P.key(p)))) out.push(a.type + a.id + ' overlaps ' + b.type + b.id); } }
    const ids = new Set(); for (const e of this.elements) { if (ids.has(e.id)) out.push('duplicate id ' + e.id); ids.add(e.id); }
    const E = this.wireEdges(), norm = this.snapshot(); const before = this.wires.map((w) => P.key(w.a) + '|' + P.key(w.b)).sort().join(' ');
    this.setWireEdges(E); const after = this.wires.map((w) => P.key(w.a) + '|' + P.key(w.b)).sort().join(' '); this.restore(norm);
    if (before !== after) out.push('wires are not in normal form');
    return out; }
}
