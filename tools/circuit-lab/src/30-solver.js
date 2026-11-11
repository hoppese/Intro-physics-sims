// =====================================================================
// Solver -- modified nodal analysis over a Circuit.
//
// The solver knows nothing about kinds of part. Each element says, for the
// mode being solved ('dc' or 'tran'):
//   shorts(mode)       point pairs it ties together (wire, ammeter, closed switch)
//   grounds()          points it pins at 0 V
//   branch(mode, env)  a Norton branch {a, b, g, J}  (current a->b = g(Va-Vb) + J)
//                      or a source   {a, b, src, V, ri}  (Va - Vb = V - ri*I)
// and takes its own new state back through commit(dV, I).
//
// solve() is pure: it returns a Solution and changes nothing, so the display
// can be refreshed after an edit without moving time on. step() solves one
// time step and commits it. How a step is discretised is the parts' own
// business (see Capacitor / Inductor): second order normally, first order
// when env.first asks for a restart.
// =====================================================================
class Solution {
  constructor(find) { this.find = find; this.nodeV = new Map(); this.branchI = new Map(); this.flows = new Map(); this.group = new Map(); this.groundedGroups = new Set(); this.shorted = false; this.solved = true; }
  node(p) { return this.find(P.key(p)); }
  grounded(p) { return this.groundedGroups.has(this.group.get(this.node(p))); }
  sameGroup(p, q) { const a = this.group.get(this.node(p)), b = this.group.get(this.node(q)); return a !== undefined && a === b; }
  // potential relative to ground; NaN where there is no ground to measure from
  potential(p) { if (!this.grounded(p)) return NaN; const v = this.nodeV.get(this.node(p)); return isFinite(v) ? v : NaN; }
  // potential difference Vp - Vq: needs no ground, only that p and q are in the same circuit
  drop(p, q) { const rp = this.node(p), rq = this.node(q); if (rp === rq) return 0; if (!this.sameGroup(p, q)) return NaN; const d = this.nodeV.get(rp) - this.nodeV.get(rq); return isFinite(d) ? d : NaN; }
  // signed current through an element in its a -> b direction (what the moving dots follow)
  flow(el) { const f = this.flows.get(el.id); return isFinite(f) ? f : 0; }
  // the current to report for an element: a source reports what it delivers out of its + end
  current(el) { const I = this.branchI.has(el.id) ? this.branchI.get(el.id) : this.flows.get(el.id); return isFinite(I) ? I : (el.open ? 0 : NaN); }
  measure(el) { const t = el.terminals(); return { dV: t.length > 1 ? this.drop(t[0].p, t[t.length > 2 ? (el.position || 1) : 1].p) : NaN, I: this.current(el) }; }
}

class Solver {
  static gauss(A, z) { const n = A.length; if (n === 0) return []; const M = A.map((row, i) => [...row, z[i]]);
    for (let col = 0; col < n; col++) { let piv = col; for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null; const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      for (let r = 0; r < n; r++) { if (r === col) continue; const f = M[r][col] / M[col][col]; if (f === 0) continue; for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k]; } }
    return M.map((row, i) => row[n] / row[i]); }

  // env = { mode: 'dc' | 'tran', dt, t, first };  opts.flows === false skips the wire-current pass
  static solve(circuit, env, opts) {
    const mode = env.mode, els = circuit.elements, parent = new Map();
    const find = (x) => { let p = parent.get(x); if (p === undefined) { parent.set(x, x); return x; } if (p === x) return x; p = find(p); parent.set(x, p); return p; };
    const union = (a, b) => { parent.set(find(a), find(b)); };
    for (const el of els) for (const t of el.terminals()) find(P.key(t.p));
    for (const el of els) for (const [p, q] of el.shorts(mode)) union(P.key(p), P.key(q));
    const sol = new Solution(find);
    const branches = []; for (const el of els) { const b = el.branch(mode, env); if (b) branches.push({ el, b, ra: find(P.key(b.a)), rb: find(P.key(b.b)) }); }
    // connected groups of nodes (joined through branches)
    const adj = new Map(), link = (u, v) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v); };
    for (const br of branches) if (br.ra !== br.rb) { link(br.ra, br.rb); link(br.rb, br.ra); }
    let gid = 0; for (const k of [...parent.keys()]) { const rt = find(k); if (sol.group.has(rt)) continue; gid++; sol.group.set(rt, gid); const q = [rt];
      while (q.length) { const u = q.pop(); for (const v of (adj.get(u) || [])) if (!sol.group.has(v)) { sol.group.set(v, gid); q.push(v); } } }
    const groundRoots = new Set(); for (const el of els) for (const p of el.grounds()) groundRoots.add(find(P.key(p)));
    for (const r of groundRoots) sol.groundedGroups.add(sol.group.get(r));
    const byGroup = new Map(); for (const br of branches) { const g = sol.group.get(br.ra); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(br); }

    for (const bs of byGroup.values()) {
      // a grounded node goes first: it is the reference (0 V)
      const nodes = [...new Set(bs.flatMap((b) => [b.ra, b.rb]))].sort((x, y) => (groundRoots.has(x) ? 0 : 1) - (groundRoots.has(y) ? 0 : 1));
      const idx = new Map(nodes.map((n, i) => [n, i])), srcs = bs.filter((b) => b.b.src), n = nodes.length, m = (n - 1) + srcs.length;
      const A = Array.from({ length: m }, () => new Array(m).fill(0)), z = new Array(m).fill(0), ni = (rt) => idx.get(rt) - 1;
      for (const br of bs) { if (br.b.src) continue; const p = ni(br.ra), q = ni(br.rb), g = br.b.g, J = br.b.J;
        if (p >= 0) A[p][p] += g; if (q >= 0) A[q][q] += g; if (p >= 0 && q >= 0) { A[p][q] -= g; A[q][p] -= g; }
        if (p >= 0) z[p] -= J; if (q >= 0) z[q] += J; }
      srcs.forEach((br, k) => { const jc = (n - 1) + k, p = ni(br.ra), q = ni(br.rb); if (br.ra === br.rb && !(br.b.ri > 1e-6)) sol.shorted = true;
        if (p >= 0) { A[p][jc] += 1; A[jc][p] += 1; } if (q >= 0) { A[q][jc] -= 1; A[jc][q] -= 1; } A[jc][jc] -= (br.b.ri || 0); z[jc] += br.b.V; });
      const x = Solver.gauss(A, z);
      if (!x) { sol.solved = false; for (const nd of nodes) sol.nodeV.set(nd, NaN); continue; }
      nodes.forEach((nd, i) => sol.nodeV.set(nd, i === 0 ? 0 : x[i - 1]));
      for (const br of bs) if (!br.b.src) sol.branchI.set(br.el.id, br.b.g * (sol.nodeV.get(br.ra) - sol.nodeV.get(br.rb)) + br.b.J);
      // the unknown solved for each source is the current INTO its + end; report what it delivers
      srcs.forEach((br, k) => sol.branchI.set(br.el.id, -x[(n - 1) + k]));
    }
    if (!opts || opts.flows !== false) Solver.wireFlows(circuit, mode, sol, branches);
    return sol;
  }

  // How the current splits among the ideal conductors inside each node. Every
  // zero-resistance link gets the same small resistance, the currents the
  // branches push in and pull out are the sources, and the resulting flows
  // are what the moving dots (and the ammeters) show.
  static wireFlows(circuit, mode, sol, branches) {
    const inj = new Map(), add = (k, v) => inj.set(k, (inj.get(k) || 0) + v);
    for (const br of branches) { const I = sol.branchI.get(br.el.id); if (!isFinite(I)) { sol.flows.set(br.el.id, 0); continue; }
      const ka = P.key(br.b.a), kb = P.key(br.b.b);
      if (br.b.src) { add(ka, +I); add(kb, -I); sol.flows.set(br.el.id, -I); } else { add(ka, -I); add(kb, +I); sol.flows.set(br.el.id, I); } }
    const byRoot = new Map();
    for (const el of circuit.elements) for (const [p, q] of el.shorts(mode)) { const rt = sol.node(p); if (!byRoot.has(rt)) byRoot.set(rt, []); byRoot.get(rt).push({ el, a: P.key(p), b: P.key(q) }); }
    for (const links of byRoot.values()) { const pts = [...new Set(links.flatMap((l) => [l.a, l.b]))], gi = new Map(pts.map((k, i) => [k, i])), nn = pts.length;
      const L = Array.from({ length: nn - 1 }, () => new Array(nn - 1).fill(0)), S = new Array(nn - 1).fill(0), li = (k) => gi.get(k) - 1;
      for (const l of links) { const a = li(l.a), b = li(l.b); if (a >= 0) L[a][a] += 1; if (b >= 0) L[b][b] += 1; if (a >= 0 && b >= 0) { L[a][b] -= 1; L[b][a] -= 1; } }
      for (let i = 1; i < nn; i++) S[i - 1] = inj.get(pts[i]) || 0;
      const W = Solver.gauss(L, S) || [], wv = new Map(pts.map((k, i) => [k, i === 0 ? 0 : (W[i - 1] || 0)]));
      for (const l of links) sol.flows.set(l.el.id, wv.get(l.a) - wv.get(l.b)); }
  }

  // one step of length env.dt ending at time env.t; parts take their new state
  static step(circuit, env, opts) { const sol = Solver.solve(circuit, env, opts);
    for (const el of circuit.elements) { if (!el.reactive) continue; const t = el.terminals(); if (t.length !== 2) continue;
      const dV = sol.nodeV.get(sol.node(t[0].p)) - sol.nodeV.get(sol.node(t[1].p)); el.commit(dV, sol.branchI.get(el.id)); }
    return sol; }
}
