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
  // Is there anything here for a clock to time? A capacitor, inductor or AC source that is part of a loop: one
  // that current could go round, were every switch closed. (One lying loose on the bench, hanging by one end, in a
  // string of parts that does not yet come round, or with nothing but a voltmeter across it, changes nothing.)
  get clocked() { return this.elements.some((e) => e.reactive && this.looped(e)); }
  // do the two ends of this part meet again through the rest of the circuit?
  looped(el) { const parent = new Map(), key = (t) => P.key(t.p);
    const find = (x) => { let p = parent.get(x); if (p === undefined) { parent.set(x, x); return x; } if (p === x) return x; p = find(p); parent.set(x, p); return p; };
    for (const o of this.elements) { if (o === el || o instanceof Voltmeter) continue; const t = o.terminals(); for (let i = 1; i < t.length; i++) parent.set(find(key(t[0])), find(key(t[i]))); }
    const t = el.terminals(); return t.length === 2 && parent.has(key(t[0])) && parent.has(key(t[1])) && find(key(t[0])) === find(key(t[1])); }
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
  labels() { const counts = {}, total = {}, out = new Map(); for (const e of this.elements) { const pre = e.info.prefix; if (pre) total[pre] = (total[pre] || 0) + 1; }
    for (const e of this.elements) { const pre = e.info.prefix; if (!pre) continue; const n = counts[pre] = (counts[pre] || 0) + 1; out.set(e.id, { n, text: e.labelText(n, total[pre]), tex: e.labelTex(n, total[pre]) }); } return out; }
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
  // why a part cannot lie where `ghost` is: the reason names the part it would lie on ("R₁ is in the way"),
  // so the reader knows what to move
  inTheWay(ghost, skip) { const gE = new Set(ghost.bodyEdges()), gI = new Set(ghost.interiorPoints().map(P.key)), gT = new Set(ghost.terminals().map((t) => P.key(t.p)));
    const hit = this.parts.find((e) => e !== skip && (e.bodyEdges().some((k) => gE.has(k)) || e.interiorPoints().some((p) => gI.has(P.key(p)) || gT.has(P.key(p))) || e.terminals().some((t) => gI.has(P.key(t.p)))));
    return hit ? this.nameOf(hit) + ' is in the way' : 'another part is in the way'; }
  // what a notice calls a part: its label ("R₁"), or "the ground" where it has none
  nameOf(el) { const label = this.labels().get(el.id); return label ? label.text : 'the ' + el.info.name.toLowerCase(); }
  // ... and in the middle of a sentence, where a lone battery's label ("ε") would read as a quantity
  nameIn(el) { return el instanceof Battery ? (this.ofType(Battery).length > 1 ? 'battery ' + this.nameOf(el) : 'the battery') : this.nameOf(el); }
  // 1 if a wire going from grid point `p` to `next` leaves the end of a part straight out, in line with the part
  // (0 if it turns off sideways there, or `p` is not the end of exactly one part)
  inLine(p, next) { const k = P.key(p), mine = this.parts.filter((x) => x.terminals().some((t) => P.key(t.p) === k)); if (mine.length !== 1) return 0;
    for (const e of mine[0].bodyEdges()) { const [a, b] = P.edgeEnds(e), q = P.eq(a, p) ? b : (P.eq(b, p) ? a : null); if (q) return Math.sign(next.c - p.c) === p.c - q.c && Math.sign(next.r - p.r) === p.r - q.r ? 1 : 0; }
    return 0; }
  // the part whose body lies on grid point `k`, or along edge `e`
  partOn(k, e) { return this.parts.find((x) => (k && x.interiorPoints().some((p) => P.key(p) === k)) || (e && x.bodyEdges().includes(e))); }
  through(k) { const x = this.partOn(k, null); return 'it would run through ' + (x ? this.nameIn(x) : 'a part'); }
  along(e) { const x = this.partOn(null, e); return 'it would run along ' + (x ? this.nameIn(x) : 'a part'); }
  plan(el, geom) {
    const isNew = !this.elements.includes(el);
    const ghost = el.clone().setGeometry(geom);
    for (const p of ghost.bodyPoints()) if (!this.inBounds(p)) return { ok: false, why: 'off the grid' };
    const occ = this.occupancy(el), oTerm = this.terminalMap(el);
    const gEdges = ghost.bodyEdges(), gInt = new Set(ghost.interiorPoints().map(P.key)), gTerm = ghost.terminals().map((t) => ({ name: t.name, k: P.key(t.p) }));
    if (gEdges.some((e) => occ.edges.has(e)) || [...gInt].some((k) => occ.interior.has(k) || oTerm.has(k)) || gTerm.some((t) => occ.interior.has(t.k))) return { ok: false, why: this.inTheWay(ghost, el) };

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
    //    (the reason says what the reader is looking at: a part laid along a wire that branches or bends under
    //    it needs a straight run; one laid where a wire only crosses, or ends, has that wire in its way)
    const along = gEdges.some((e) => E0.has(e));
    for (const e of gEdges) if (E.has(e)) { E.delete(e); if (!tokenAt(P.key(P.edgeEnds(e)[0]))) spliced = true; }
    for (const k of gInt) for (const nb of around(k)) { if (tokenAt(k)) E.delete(nb.e); else return { ok: false, why: !along ? 'a wire is in the way' : 'a wire turns off part-way along it' + (ghost.terminals().length === 2 ? ' (it needs ' + gEdges.length + ' squares of straight wire)' : '') }; }

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
    const snap = this.snapshot(), isNew = !this.elements.includes(el), was = isNew ? null : this.directLeads(el);
    el.setGeometry(geom); if (isNew) { el.id = this.nextId++; this.elements.push(el); }
    this.autoEdges = pl.auto; this.setWireEdges(pl.edges);
    // belt and braces: the edit must not have joined nets (a splice may split one)
    if (!isNew && !Circuit.compatible(sigBefore, this.netSignature(el), pl.spliced)) { this.restore(snap); return { ok: false, why: 'would change the wiring' }; }
    if (!isNew) { const kept = this.snapshot(); if (this.unjog(el, was) && !Circuit.compatible(sigBefore, this.netSignature(el), pl.spliced)) this.restore(kept); }
    return { ok: true, spliced: pl.spliced, el };
  }
  // Take the staircases out of the wiring that hangs off a part that has just been moved or turned. A lead
  // the sim lays goes the shortest way to the nearest piece of the old wire, and where it meets that wire
  // side-on the two together step sideways on their way. Such a chain is laid again as the plainest path of
  // the SAME length -- or a shorter one where the lead ran straight to the part before the move (`was`: see
  // directLeads). A wire the user took the long way round stays the long way round.
  unjog(el, was) { const terms = this.terminalMap(null), occ = this.occupancy(null), auto = new Set(this.autoEdges); let E = this.wireEdges(), changed = false;
    el.terminals().forEach((t, i) => { const k = P.key(t.p); for (let pass = 0; pass < 4; pass++) { const adj = Circuit.adjacency(E), nb = adj.get(k) || []; if (pass >= nb.length) break;
      const ch = this.chainFrom(E, adj, terms, k, P.edge(P.parse(k), P.parse(nb[pass]))); if (ch.end === k) continue;
      if (!terms.has(ch.end) && (adj.get(ch.end) || []).length < 2) continue;                          // a loose end: leave the stub alone
      const E0 = new Set(E); for (const e of ch.edges) E0.delete(e);
      const busy = new Set([...Circuit.adjacency(E0).keys(), ...terms.keys()]), direct = !!(was && was[i] && was[i].has(ch.end));
      let best = null, len = ch.edges.length, turns = this.turns(E);
      for (const path of this.routes(k, ch.end, (x) => !occ.interior.has(x) && !busy.has(x), occ.edges)) { if (path.length > len || (path.length < len && !direct)) continue;
        const E2 = new Set(E0); for (const e of path) E2.add(e); const n = this.turns(E2);
        if (path.length < len || n < turns) { best = { path, E2 }; len = path.length; turns = n; } }
      if (!best) continue;
      for (const e of ch.edges) if (!best.E2.has(e)) auto.delete(e); for (const e of best.path) if (!E.has(e)) auto.add(e); E = best.E2; changed = true; } });
    if (changed) { this.autoEdges = auto; this.setWireEdges(E); } return changed; }
  // The shortest path from k to `end` setting off in each of the four directions: where two elbows are the same
  // length route() returns only one of them, and the other may be the one that leaves the part in line.
  routes(k, end, open, banned) { const p = P.parse(k), out = [], seen = new Set(), step = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => P.edge(p, P.add(p, dc, dr)));
    for (const first of step) { const path = this.route(new Set([k]), new Set([end]), open, new Set([...(banned || []), ...step.filter((e) => e !== first)])); if (!path || !path.length) continue;
      const sig = [...path].sort().join(' '); if (!seen.has(sig)) { seen.add(sig); out.push(path); } }
    return out; }
  // For each terminal of a part, the far ends of the wire chains that run from it as directly as a wire can (no
  // longer than the distance on the grid). Such a lead goes directly to the part wherever the part is put next;
  // only a wire somebody took the long way round is kept the long way round.
  directLeads(el) { const E = this.wireEdges(), adj = Circuit.adjacency(E), terms = this.terminalMap(null);
    return el.terminals().map((t) => { const k = P.key(t.p), S = new Set();
      for (const n of adj.get(k) || []) { const ch = this.chainFrom(E, adj, terms, k, P.edge(t.p, P.parse(n))), z = P.parse(ch.end); if (ch.edges.length === Math.abs(z.c - t.p.c) + Math.abs(z.r - t.p.r)) S.add(ch.end); }
      return S; }); }
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
  move(el, dc, dr) { if (el.isWire) return this.moveWire(el, dc, dr); const g = el.translated(dc, dr), x = this.crowdedBy(el, g);
    return x ? { ok: false, why: this.nameOf(x) + ' would be right beside it (leave a clear row between them)' } : this.reshape(el, g); }
  // The part that `el`, put at `geom`, would lie SIDE BY SIDE with: the same way round, on the very next row
  // (or column), and overlapping along their length -- where the two drawings run into each other (a
  // voltmeter's dial under a capacitor's plates). Parts that meet round a corner, or end to end, are not side
  // by side. A part el already lies beside does not count unless `all`: it can always be slid along or taken
  // away. Moves made by hand are refused on this; turning a part, and circuits loaded from a link, are not.
  crowdedBy(el, geom, all) { const near = (x) => { const out = new Set(); for (const e of x.bodyEdges()) { const [a, b] = P.edgeEnds(e), flat = a.r === b.r;
        for (const d of [-1, 1]) out.add(P.edge(P.add(a, flat ? 0 : d, flat ? d : 0), P.add(b, flat ? 0 : d, flat ? d : 0))); } return out; };
    const beside = (zone) => this.parts.filter((o) => o !== el && o.bodyEdges().some((e) => zone.has(e)));
    const was = all || !this.elements.includes(el) ? [] : beside(near(el));
    return beside(near(el.clone().setGeometry(geom))).find((o) => !was.includes(o)) || null; }
  // is nothing connected to the part: no wire on either end, and no other part's terminal there
  isLoose(el) { const adj = Circuit.adjacency(this.wireEdges()), others = this.terminalMap(el);
    return el.terminals().every((t) => { const k = P.key(t.p); return !(adj.get(k) || []).length && !others.has(k); }); }
  // The same move, made by hand. A loose two-ended part dropped ACROSS a straight wire cannot go
  // there as it lies -- but what was meant is plain, so it is turned a quarter turn to lie along
  // the wire and goes into it (`turned`). The wire may cross it a square off its middle. A part
  // that is already wired up is never turned this way: its wires would have to follow.
  moveOnto(el, dc, dr) { const lifted = this.liftOnto(el, dc, dr); if (lifted) return lifted;
    const r = this.move(el, dc, dr); if (r.ok || el.isWire || !el.info.rotatable || el.fields().length !== 2 || !this.isLoose(el)) return r;
    const target = el.translated(dc, dr), t = this.turnOnto(el, target) || this.squeezeOnto(el, target); if (t) return t;
    // (dropped across a wire too short to take it: that wire is in the way, and the reason says what it would have
    // needed -- except to a voltmeter, which has no business in line with a wire)
    const need = el instanceof Ammeter ? 2 : Math.abs(target.a.c - target.b.c) + Math.abs(target.a.r - target.b.r);
    if (r.why === 'a wire is in the way') return el instanceof Voltmeter ? r : { ...r, why: r.why + ' (to go into a wire, it needs ' + need + ' squares of straight wire)' };
    return el instanceof Ammeter && r.why ? { ...r, why: r.why.replace(/needs \d+ squares/, 'needs 2 squares') } : r; }
  // An ammeter dropped on a stretch of wire too short to take it whole: it goes in at two squares long, in
  // line with the wire it was dropped along or turned into the one it was dropped across (one step either way
  // along the wire is tried too). Only an ammeter -- it is the one part that is nothing but a piece of wire
  // that reads, so nothing about it depends on its length -- and only when it can go INTO a wire (`squeezed`).
  // The leads the menu's parts are given are three squares long, so without this a circuit built by hand had
  // no wire anywhere that would take an ammeter. Returns the edit result, or null.
  squeezeOnto(el, target) { if (!(el instanceof Ammeter)) return null; const there = el.clone().setGeometry(target);
    if (Math.abs(there.a.c - there.b.c) + Math.abs(there.a.r - there.b.r) <= 2) return null;
    const flat = there.a.r === there.b.r, short = (g, horiz) => { const m = { c: Math.round((g.a.c + g.b.c) / 2), r: Math.round((g.a.r + g.b.r) / 2) }, s = Math.sign(horiz ? g.b.c - g.a.c : g.b.r - g.a.r) || 1;
      return horiz ? { a: P.add(m, -s, 0), b: P.add(m, s, 0) } : { a: P.add(m, 0, -s), b: P.add(m, 0, s) }; };
    for (const [g0, horiz] of [[short(target, flat), flat], [short(there.rotated(flat ? 1 : -1), !flat), !flat]]) for (const off of [0, -1, 1]) {
      const g = { a: P.add(g0.a, horiz ? off : 0, horiz ? 0 : off), b: P.add(g0.b, horiz ? off : 0, horiz ? 0 : off) }, pl = this.plan(el, g);
      if (pl.ok && pl.spliced && !this.crowdedBy(el, g)) { const t = this.reshape(el, g); if (t.ok) return { ...t, squeezed: true, turned: horiz !== flat }; } }
    return null; }
  // a part that cannot sit at `target` because it lies ACROSS a straight wire there: it is turned to lie
  // along the wire and spliced in (one step either way along it is tried too). The turn pairs the left
  // end with the top end whichever way it goes, so a meter or a battery turned twice is the same way
  // round as it started. Returns the edit result, or null if no splice is to be had.
  turnOnto(el, target) { const there = el.clone().setGeometry(target), flat = there.a.r === there.b.r, turned = el.clone().setGeometry(there.rotated(flat ? 1 : -1));
    for (const off of [0, -1, 1]) { const g = turned.translated(flat ? off : 0, flat ? 0 : off), pl = this.plan(el, g);
      if (pl.ok && pl.spliced && !this.crowdedBy(el, g)) { const t = this.reshape(el, g); if (t.ok) return { ...t, turned: true }; } }
    return null; }
  // An ammeter that is spliced into one wire, dropped on another. Dragging its own wires along would
  // either join two nodes or push the wire it was dropped on out of the way, and what was meant is
  // plain: the meter is being moved to read another branch. So it comes out of the wire it was in,
  // which closes up behind it exactly as it does when an ammeter is deleted, and then goes where a
  // loose part would go: into the wire it was dropped along, or turned into the one it was dropped
  // across (`lifted`). It stays the same meter: same id, same number, same place in the list. Dropped
  // on empty space there is nothing to splice into and this returns null: the ordinary move then
  // takes its wires along. Only an ammeter: any other part would leave a gap where it had been.
  liftOnto(el, dc, dr) { if (!(el instanceof Ammeter) || (!dc && !dr) || this.crowdedBy(el, el.translated(dc, dr))) return null; const snap = this.snapshot(), id = el.id, at = this.elements.indexOf(el), target = el.translated(dc, dr);
    const back = () => { if (!this.elements.includes(el)) this.elements.push(el); this.restore(snap); return null; };
    const was = [el.a, el.b]; if (!this.remove(el).healed) return back();
    // still in the same straight run of wire (it was only slid along it): then nothing has "closed up"
    const E = this.wireEdges(), ends = [...was, target.a, target.b], line = ends.every((p) => p.r === was[0].r) ? 'c' : ends.every((p) => p.c === was[0].c) ? 'r' : null;
    const slid = !!line && (() => { const lo = ends.reduce((m, p) => (p[line] < m[line] ? p : m)), hi = ends.reduce((m, p) => (p[line] > m[line] ? p : m)); return P.edgesOf(lo, hi).every((e) => E.has(e)); })();
    const pl = this.plan(el, target); let t = null;
    if (pl.ok) { if (pl.spliced) { t = this.reshape(el, target); if (!t.ok) t = null; } } else t = this.turnOnto(el, target) || this.squeezeOnto(el, target);
    if (!t) return back();
    el.id = id; this.nextId = snap.nextId; this.elements.splice(this.elements.indexOf(el), 1); this.elements.splice(at, 0, el); return { ...t, lifted: !slid }; }
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
  // (A turn is always the quarter turn asked for, about the part's middle -- even where that leaves it a square
  // from a neighbour, which a step aside would cure: a part that sometimes slides as it turns is the inconsistency
  // this was written to end. It can be dragged clear.)
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
      if (pts(ghost) === pts(el)) { el.setGeometry(g); el.turnEndForEnd(); return { ok: true, el }; }   // same footprint: just swaps which end is which
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
    for (const e of edges) { if (occ.edges.has(e)) return { ok: false, why: this.along(e) };
      for (const p of P.edgeEnds(e)) { if (!this.inBounds(p)) return { ok: false, why: 'off the grid' }; if (occ.interior.has(P.key(p))) return { ok: false, why: this.through(P.key(p)) }; } }
    return { ok: true, edges }; }
  // A way round when neither elbow fits: the shortest free path from one grid
  // point to another that touches no other wire or terminal on the way (so it
  // cannot join anything the user did not aim at). The wire already leading to
  // the aimed-at point counts as that point -- meeting it is the same connection
  // -- so the detour may end on it; but only when that saves more than AIM squares
  // over going to the point itself, since a wire that ends somewhere other than
  // where it was dropped looks like a mistake. Returns grid points or null.
  static AIM = 4;
  detour(from, to) { const occ = this.occupancy(null), fk = P.key(from), tk = P.key(to); if (occ.interior.has(fk) || occ.interior.has(tk)) return null;
    const E = this.wireEdges(), { adj, comp } = Circuit.components(E), targets = new Set([tk]);
    if (comp.has(tk)) for (const [k, n] of comp) if (n === comp.get(tk)) targets.add(k);
    if (targets.has(fk)) return null;                            // already joined by wire
    const busy = new Set([...adj.keys(), ...this.terminalMap(null).keys()]);
    const free = (k) => !occ.interior.has(k) && !busy.has(k), src = new Set([fk]);
    const exact = this.route(src, new Set([tk]), free, occ.edges), any = this.route(src, targets, free, occ.edges);
    const path = exact && exact.length && any && exact.length <= any.length + Circuit.AIM ? exact : any;
    if (!path || !path.length || path.length > Math.abs(to.c - from.c) + Math.abs(to.r - from.r) + 8) return null;
    const pts = [from]; let at = from;                           // edges come back target-first
    for (const e of path.slice().reverse()) { const [a, b] = P.edgeEnds(e); if (P.eq(a, at)) at = b; else if (P.eq(b, at)) at = a; else return null; pts.push(at); }
    return targets.has(P.key(at)) ? pts : null; }
  // Where a path would cross wire that belongs to neither of its ends: laid there it would join a
  // third node, one the user never aimed at (wires that cross on this grid are connected -- there is
  // no hopping over). So a wire is never laid across another one. "Across" means the other wire
  // carries on to both sides of the path. Passing the bare end of a part, or the loose end of a
  // wire hanging down to the path, is not that: it is how a rail is drawn, and joins them.
  // Running ALONG such a wire is the same mistake lying down: the new wire vanishes into the old
  // one and joins whatever that leads to (a battery laid "to the far end of the resistor" along the
  // wire to its near end shorts the resistor). The list returned says which it was in .why.
  static CROSSES = 'it would cross another wire (wires that cross are joined)';
  static ALONG = 'it would run along another wire (wires that touch are joined)';
  crossings(pts) { const E = this.wireEdges(), { comp } = Circuit.components(E), net = (p) => comp.get(P.key(p)), mine = new Set([net(pts[0]), net(pts[pts.length - 1])]), all = [pts[0]], out = [];
    for (let i = 1; i < pts.length; i++) all.push(...P.line(pts[i - 1], pts[i]).slice(1));
    for (let j = 1; j < all.length - 1; j++) { const p = all[j], n = net(p); if (n == null || mine.has(n)) continue;
      const aside = [P.add(p, 1, 0), P.add(p, -1, 0), P.add(p, 0, 1), P.add(p, 0, -1)].filter((q) => !P.eq(q, all[j - 1]) && !P.eq(q, all[j + 1]));
      if (aside.length === 2 && aside.every((q) => E.has(P.edge(p, q)))) out.push(p); }
    out.why = Circuit.CROSSES; if (out.length) return out;
    let on = false;                                               // (the two ends of each stretch shared)
    for (let j = 1; j < all.length; j++) { const n = net(all[j]), along = n != null && !mine.has(n) && E.has(P.edge(all[j - 1], all[j]));
      if (along && !on) out.push(all[j - 1]); if (!along && on) out.push(all[j - 1]); on = along; }
    if (on) out.push(all[all.length - 1]); if (out.length) out.why = Circuit.ALONG; return out; }
  addWire(pts) { const c = this.checkPath(pts); if (!c.ok) return c; const x = this.crossings(pts); if (x.length) return { ok: false, why: x.why }; const E = this.wireEdges(); let fresh = 0; for (const e of c.edges) if (!E.has(e)) { E.add(e); fresh++; }
    if (!fresh) return { ok: false, why: 'there is already a wire there' };
    for (const e of c.edges) this.autoEdges.delete(e);          // drawn by hand: no longer the sim's to re-route
    this.setWireEdges(E); return { ok: true }; }
  // slide a straight run sideways; whatever it was joined to stays joined
  moveWire(w, dc, dr) {
    const own = P.edgesOf(w.a, w.b), E = this.wireEdges(); for (const e of own) E.delete(e);
    const occ = this.occupancy(null), terms = this.terminalMap(null), cur = Circuit.components(E);
    const oldPts = P.line(w.a, w.b), newPts = oldPts.map((p) => P.add(p, dc, dr));
    for (const p of newPts) { if (!this.inBounds(p)) return { ok: false, why: 'off the grid' }; if (occ.interior.has(P.key(p))) return { ok: false, why: this.through(P.key(p)) }; }
    const fresh = P.edgesOf(newPts[0], newPts[newPts.length - 1]), lain = fresh.find((e) => occ.edges.has(e)); if (lain) return { ok: false, why: this.along(lain) };
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
  // without using more wire. A part is never pushed up beside another one:
  // tidying may not bring two parts closer than Circuit.ROOM grid steps unless
  // they were already that close, or they end up along one line, end to end (the
  // way a series loop is drawn: a part dragged out of its row goes back into it). Moving a part only re-lays the wiring that
  // hangs off it, so a part whose own wiring is already straight is skipped, and
  // the only slides worth trying are the ones that bring a terminal into line
  // with a corner or an end of that wiring -- and, after those, the diagonal moves
  // that put a terminal ON one (a part joined to its neighbour by a hook goes
  // end to end with it, which no slide along one axis can do).
  tidyLayout() { let improved = this.tidyWires();
    const gaps = (el) => new Map(this.parts.filter((o) => o !== el).map((o) => [o.id, el.clearanceTo(o)]));
    const crowds = (el, was) => this.parts.some((o) => { if (o === el) return false; const d = el.clearanceTo(o); return d < Circuit.ROOM && d < (was.has(o.id) ? was.get(o.id) : Infinity) && !el.inLineWith(o); });
    const steps = []; for (let d = 1; d <= Circuit.REACH; d++) steps.push([d, 0], [-d, 0], [0, d], [0, -d]);      // nearest first: a tie goes to the smaller move
    for (let round = 0; round < 6; round++) { let any = false;
      for (const part of this.parts) { const E0 = this.wireEdges(), B = this.bends(E0), R = this.reachOf(part, E0); const hot = [...R].filter((k) => B.has(k)); if (!hot.length) continue;
        const mine = part.terminals().map((t) => t.p), marks = [...new Set([...hot, ...R.ends])].map(P.parse).filter((u) => !mine.some((p) => P.eq(p, u)));
        const lines = (dc, dr) => mine.some((p) => marks.some((u) => dr ? u.r === p.r + dr : u.c === p.c + dc));
        let best = B.size, bestSnap = null; const was = gaps(part), onto = new Map();
        for (const p of mine) for (const u of marks) { const dc = u.c - p.c, dr = u.r - p.r; if (dc && dr && Math.abs(dc) <= Circuit.REACH && Math.abs(dr) <= Circuit.REACH) onto.set(dc + ',' + dr, [dc, dr]); }
        const tries = [...steps.filter(([dc, dr]) => lines(dc, dr)), ...[...onto.values()].sort((x, y) => Math.abs(x[0]) + Math.abs(x[1]) - Math.abs(y[0]) - Math.abs(y[1]))];
        for (const [dc, dr] of tries) { const snap = this.snapshot(); const el = this.byId(part.id); if (!el) break;
          const r = this.reshape(el, el.translated(dc, dr)); if (r.ok && !r.spliced && !crowds(el, was)) { const E1 = this.wireEdges(), c = this.turns(E1); if (c < best && E1.size <= E0.size) { best = c; bestSnap = this.snapshot(); } }
          this.restore(snap); }
        if (bestSnap) { this.restore(bestSnap); this.straighten(null); any = true; improved = true; } }
      if (!any) break; }
    return improved; }

  // ---- placing new parts ----
  // Nearest spot to (c0, r0) where `make(c, r)` fits with a clear margin around it.
  findSlot(make, c0, r0, box, phases, clear) { const used = new Set(); for (const e of this.elements) for (const p of (e.isWire ? P.line(e.a, e.b) : e.bodyPoints())) used.add(P.key(p));
    const fits = (el, margin) => { const pts = el.bodyPoints(); let c1 = Infinity, c2 = -Infinity, r1 = Infinity, r2 = -Infinity;
      for (const p of pts) { if (!this.inBounds(p)) return false; c1 = Math.min(c1, p.c); c2 = Math.max(c2, p.c); r1 = Math.min(r1, p.r); r2 = Math.max(r2, p.r); }
      if (box && (c1 < box.c0 || c2 > box.c1 || r1 < box.r0 || r2 > box.r1)) return false;
      // (a roomy slot keeps a label's height clear above and below, and is not hard against the top of the board)
      const tall = margin > 1 ? 1 : 0; if (tall && r1 < 3) return false;
      for (let c = c1 - margin; c <= c2 + margin; c++) for (let r = r1 - margin - (margin ? 1 : 0); r <= r2 + margin + tall; r++) if (used.has(c + ',' + r)) return false;
      // (`clear`: the caller's own veto -- the bench keeps a new part off the labels already on screen -- for all but the last resort)
      if (clear && margin && !clear(el)) return false;
      return this.plan(el, el.geometry()).ok; };
    const cells = []; for (let c = 0; c <= this.NC; c++) for (let r = 0; r <= this.NR; r++) cells.push([c, r, Math.hypot(c - c0, (r - r0) * 1.4)]);
    cells.sort((x, y) => x[2] - y[2]);
    // roomy and close first, then tighter, then anywhere at all
    for (const [margin, reach] of phases || Circuit.SLOTS) for (const [c, r, d] of cells) { if (d > reach) break; const el = make(c, r); if (fits(el, margin)) return el; }
    if (box && !phases) return this.findSlot(make, c0, r0, null, null, clear);
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
