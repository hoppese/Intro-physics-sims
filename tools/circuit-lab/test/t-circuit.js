const M = require('./load.js');
const { P, Element, Circuit, Resistor, Battery, Wire, ThrowSwitch, Ground, Switch, Capacitor, Ammeter, Voltmeter } = M;
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };
const pt = (c, r) => ({ c, r });
const sig = (c) => JSON.stringify(c.netSignature(null).map((l) => l.join(',')).sort());
const dump = (c) => c.encode();

// ---- T1 build a loop ----
function loop() {
  const c = new Circuit(44, 30);
  const b = new Battery(pt(6, 8), pt(6, 12)); ok(c.insert(b).ok, 'insert battery');
  const r = new Resistor(pt(12, 6), pt(16, 6)); ok(c.insert(r).ok, 'insert resistor');
  ok(c.addWire([pt(6, 8), pt(6, 6), pt(12, 6)]).ok, 'wire 1');
  ok(c.addWire([pt(16, 6), pt(22, 6), pt(22, 14), pt(6, 14), pt(6, 12)]).ok, 'wire 2');
  return { c, b, r };
}
{
  const { c } = loop();
  ok(c.problems().length === 0, 'T1 problems ' + c.problems());
  ok(c.netSignature(null).length === 2, 'T1 two nets: ' + sig(c));
  ok(c.wires.length === 6, 'T1 six runs, got ' + c.wires.length + ' ' + dump(c));
}
// ---- T2 colinear merge, T junction split ----
{
  const c = new Circuit();
  c.addWire([pt(2, 2), pt(6, 2)]); c.addWire([pt(6, 2), pt(10, 2)]);
  ok(c.wires.length === 1, 'T2 colinear wires merge: ' + dump(c));
  ok(c.addWire([pt(5, 2), pt(5, 6)]).ok, 'T2 wire ending mid-wire');
  ok(c.wires.length === 3, 'T2 T junction splits the run: ' + dump(c));
  ok(!c.addWire([pt(2, 2), pt(4, 2)]).ok, 'T2 duplicate wire refused');
  ok(!c.addWire([pt(2, 2), pt(4, 4)]).ok, 'T2 diagonal refused');
  ok(c.problems().length === 0, 'T2 problems ' + c.problems());
}
// ---- T3 wire across / along a part refused ----
{
  const c = new Circuit(); const r = new Resistor(pt(10, 10), pt(14, 10)); c.insert(r);
  ok(!c.addWire([pt(12, 8), pt(12, 12)]).ok, 'T3 wire through a body refused');
  ok(!c.addWire([pt(8, 10), pt(12, 10)]).ok, 'T3 wire along a body refused');
  ok(c.addWire([pt(8, 10), pt(10, 10)]).ok, 'T3 wire to a terminal ok');
  ok(c.addWire([pt(14, 10), pt(14, 14)]).ok, 'T3 wire from a terminal ok');
}
// ---- T4 moves keep the wiring ----
{
  const { c, r, b } = loop(); const s0 = sig(c);
  const walk = [[0, 1], [0, 1], [1, 0], [0, 3], [-3, 0], [0, -6], [4, 2], [0, 8], [-9, 0], [3, -3], [0, -4], [5, 0]];
  for (const [dc, dr] of walk) { const res = c.move(c.byId(r.id), dc, dr); const p = c.problems();
    ok(p.length === 0, 'T4 problems after move ' + dc + ',' + dr + ': ' + p.join('; ') + '\n   ' + dump(c));
    ok(sig(c) === s0, 'T4 wiring changed after move ' + dc + ',' + dr + ' ok=' + res.ok + ' ' + sig(c)); }
  for (const [dc, dr] of walk) { c.move(c.byId(b.id), dc, dr); ok(c.problems().length === 0 && sig(c) === s0, 'T4 battery move ' + dc + ',' + dr + ' ' + c.problems()); }
}
// ---- T5 rotate x4 comes home ----
// (a half turn of a part wired in line exchanges its ends: see Circuit.rotate)
{
  const swapEnds = (list, id) => list.map((l) => l.map((t) => t === id + ':a' ? id + ':b' : t === id + ':b' ? id + ':a' : t).sort());
  for (const dir of [1, -1]) { const { c, r, b } = loop(); const s0 = sig(c);
    for (const el of [r, b]) { const g0 = JSON.stringify(c.byId(el.id).geometry()); let swaps = 0;
      for (let i = 0; i < 4; i++) { const x = c.byId(el.id), want = JSON.stringify(x.rotated(dir)), before = c.netSignature(null), res = c.rotate(x, dir);
        ok(res.ok, 'T5 rotate ' + el.type + ' #' + i + ' dir ' + dir + ': ' + res.why); ok(c.problems().length === 0, 'T5 problems ' + c.problems());
        ok(JSON.stringify(x.geometry()) === want, 'T5 ' + el.type + ' turned the way asked'); if (res.swapped) swaps++;
        ok(Circuit.compatible(res.swapped ? swapEnds(before, x.id) : before, c.netSignature(null), false), 'T5 wiring changed by rotate'); }
      ok(swaps === 2, 'T5 ' + el.type + ': two of the four turns are end for end, got ' + swaps);
      ok(sig(c) === s0, 'T5 the circuit is the same after four turns');
      ok(JSON.stringify(c.byId(el.id).geometry()) === g0, 'T5 ' + el.type + ' back home after 4 turns: ' + JSON.stringify(c.byId(el.id).geometry()) + ' vs ' + g0); } }
}
// ---- T6 splice by dropping a part onto a wire ----
{
  const { c } = loop(); const r2 = new Resistor(pt(26, 20), pt(30, 20)); c.insert(r2);
  const res = c.reshape(c.byId(r2.id), { a: pt(12, 14), b: pt(16, 14) });
  ok(res.ok && res.spliced, 'T6 splice ok ' + res.why);
  ok(c.netSignature(null).length === 3, 'T6 three nets after splice: ' + sig(c));
  ok(c.problems().length === 0, 'T6 problems ' + c.problems());
  // and nudging it along the wire keeps it in line
  const s1 = sig(c); c.move(c.byId(r2.id), 1, 0); c.move(c.byId(r2.id), 1, 0); c.move(c.byId(r2.id), -4, 0);
  ok(sig(c) === s1 && c.problems().length === 0, 'T6 slide along wire');
  ok(c.byId(r2.id).a.r === 14, 'T6 still on row 14');
}
// ---- T7 parts cannot overlap; a part cannot join two nets ----
{
  const { c, r } = loop(); const r2 = new Resistor(pt(12, 8), pt(16, 8)); c.insert(r2);
  ok(!c.move(c.byId(r2.id), 0, -2).ok, 'T7 overlap refused');
  ok(!c.move(c.byId(r2.id), 2, -2).ok, 'T7 partial overlap refused');
  const s0 = sig(c);
  // wired resistor dragged so its end would land on the other net
  const res = c.reshape(c.byId(r.id), { a: pt(18, 10), b: pt(22, 10) });
  ok(sig(c) === s0, 'T7 nets not merged (ok=' + res.ok + ') ' + sig(c));
  ok(c.problems().length === 0, 'T7 problems ' + c.problems());
}
// ---- T8 flip ----
{
  const { c, b } = loop(); const a0 = P.key(b.a); const wires0 = dump(c).replace(/^[^w]*/, '');
  ok(c.flip(c.byId(b.id)).ok, 'T8 flip battery'); ok(P.key(c.byId(b.id).b) === a0, 'T8 a/b swapped'); ok(dump(c).replace(/^[^w]*/, '') === wires0, 'T8 wires untouched by flip');
  const x = ThrowSwitch.at(pt(28, 20), 1); c.insert(x); c.addWire([pt(31, 19), pt(34, 19)]); c.addWire([pt(31, 21), pt(34, 21)]); c.addWire([pt(28, 20), pt(26, 20)]);
  const s0 = sig(c); const res = c.flip(c.byId(x.id)); ok(res.ok, 'T8 flip throw switch: ' + res.why); ok(sig(c) === s0, 'T8 throw flip keeps wiring'); ok(c.problems().length === 0, 'T8 problems ' + c.problems());
  ok(c.byId(x.id).b1.c === 25, 'T8 throws mirrored');
  for (let i = 0; i < 4; i++) { const rr = c.rotate(c.byId(x.id), 1); ok(rr.ok, 'T8 rotate throw #' + i + ' ' + rr.why); ok(sig(c) === s0 && c.problems().length === 0, 'T8 rotate throw keeps wiring ' + c.problems()); }
}
// ---- T9 moving a wire ----
{
  const { c } = loop(); const s0 = sig(c);
  const top = c.wires.find((w) => w.a.r === 6 && w.b.r === 6 && Math.min(w.a.c, w.b.c) === 6);
  ok(!!top, 'T9 found the top-left run');
  let res = c.move(top, 0, -2); ok(res.ok, 'T9 move wire up: ' + res.why); ok(sig(c) === s0, 'T9 wiring kept'); ok(c.problems().length === 0, 'T9 problems ' + c.problems());
  res = c.move(c.byId(top.id), 0, 3); ok(res.ok, 'T9 move wire down: ' + res.why); ok(sig(c) === s0 && c.problems().length === 0, 'T9 wiring kept 2 ' + c.problems() + dump(c));
  // a loose wire just slides, and nothing else is touched
  c.addWire([pt(30, 2), pt(34, 2)]); const n0 = c.wires.length; const loose = c.wires.find((w) => w.a.r === 2);
  res = c.move(loose, 0, 3); ok(res.ok && c.wires.length === n0, 'T9 loose wire slides');
  ok(c.wires.some((w) => w.a.r === 5 && w.b.r === 5 && Math.min(w.a.c, w.b.c) === 30), 'T9 loose wire at new row');
}
// ---- T10 delete leaves wires alone; loose wires survive other edits (B71) ----
{
  const { c, r } = loop(); c.addWire([pt(30, 20), pt(34, 20)]); c.addWire([pt(30, 24), pt(30, 27)]);
  const n = c.wires.length; c.move(c.byId(r.id), 0, 2); c.move(c.byId(r.id), 0, -2);
  ok(c.wires.some((w) => w.a.r === 20 && w.b.r === 20 && Math.min(w.a.c, w.b.c) === 30) && c.wires.some((w) => w.a.c === 30 && Math.min(w.a.r, w.b.r) === 24), 'T10 loose wires survive a move');
  c.remove(c.byId(r.id)); ok(c.wires.length >= n - 1, 'T10 delete keeps wires'); ok(c.problems().length === 0, 'T10 problems ' + c.problems());
}
// ---- T11 share-link round trip ----
{
  const { c, b } = loop(); c.byId(b.id).setRi(1.5); const x = ThrowSwitch.at(pt(28, 20), 1); c.insert(x); const g = new Ground(pt(6, 14), pt(6, 16)); ok(c.insert(g).ok, 'T11 ground');
  const s = c.encode(); const d = Circuit.decode(s); ok(d.encode() === s, 'T11 round trip\n ' + s + '\n ' + d.encode()); ok(d.problems().length === 0, 'T11 problems');
  ok(d.ofType(Battery)[0].ri === 1.5, 'T11 battery r kept');
  const old = 'b6.8-6.12@6_r12.6-16.6@10_w6.8-6.6_w6.6-12.6_w16.6-22.6_w22.6-22.14_w22.14-6.14_w6.14-6.12_g6.14-6.16';
  const o = Circuit.decode(old); ok(o.parts.length === 3 && o.netSignature(null).length === 2, 'T11 old link decodes: ' + o.encode());
}
// ---- T12 fuzz ----
{
  let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const kinds = ['resistor', 'cap', 'battery', 'switch', 'amm', 'volt', 'ind'];
  let moves = 0, refused = 0, worst = 0;
  for (let trial = 0; trial < 60; trial++) { const c = new Circuit(44, 30);
    for (let i = 0; i < 4 + rnd(4); i++) { const kind = kinds[rnd(kinds.length)]; const horiz = rnd(2);
      const el = c.findSlot((cc, rr) => Element.create(kind, pt(cc, rr), horiz ? pt(cc + 4, rr) : pt(cc, rr + 4)), 8 + rnd(28), 6 + rnd(18), null); if (el) c.insert(el); }
    if (rnd(2)) { const x = c.findSlot((cc, rr) => ThrowSwitch.at(pt(cc, rr), rnd(2) ? 1 : -1), 20, 15, null); if (x) c.insert(x); }
    // random wires between terminals / wire points
    for (let i = 0; i < 12; i++) { const ts = c.parts.flatMap((e) => e.terminals().map((t) => t.p)); const a = ts[rnd(ts.length)], b = ts[rnd(ts.length)]; if (P.eq(a, b)) continue;
      const mid = rnd(2) ? pt(a.c, b.r) : pt(b.c, a.r); const s0 = sig(c); const snap = c.snapshot(); c.addWire([a, mid, b].filter((p, j, arr) => j === 0 || !P.eq(p, arr[j - 1]))); }
    ok(c.problems().length === 0, 'T12 problems after build ' + c.problems().slice(0, 3));
    for (let step = 0; step < 60; step++) { const parts = c.parts; let el = parts[rnd(parts.length)]; const enc0 = c.encode(); const op = rnd(10); let res; const t0 = Date.now();
      const wiresOf = (x) => x.encode().replace(/^[^w]*/, '');
      if (op === 9) { const ws = c.wires; if (!ws.length) continue; el = ws[rnd(ws.length)]; }
      const before = c.netSignature(el.isWire ? null : el), w0 = wiresOf(c);
      if (op < 6) res = c.move(el, rnd(7) - 3, rnd(7) - 3); else if (op < 8) res = c.rotate(el, rnd(2) ? 1 : -1); else if (op < 9) res = c.flip(el); else res = c.move(el, rnd(5) - 2, rnd(5) - 2);
      worst = Math.max(worst, Date.now() - t0); moves++; if (!res.ok) { refused++; ok(c.encode() === enc0, 'T12 refused edit changed the circuit (' + res.why + ')'); }
      const p = c.problems(); ok(p.length === 0, 'T12 trial ' + trial + ' step ' + step + ' op ' + op + ': ' + p.slice(0, 3).join('; ') + '\n  before ' + enc0 + '\n  after  ' + c.encode());
      if (op === 8 && !(el instanceof ThrowSwitch)) ok(wiresOf(c) === w0, 'T12 a/b flip moved wires');
      else ok(Circuit.compatible(res.ok && res.swapped ? before.map((l) => l.map((t) => t === el.id + ':a' ? el.id + ':b' : t === el.id + ':b' ? el.id + ':a' : t).sort()) : before, c.netSignature(null), !!(res.ok && res.spliced)), 'T12 wiring changed, trial ' + trial + ' step ' + step + ' op ' + op + ' ok=' + res.ok + ' el=' + el.type + el.id + '\n  before ' + enc0 + '\n  after  ' + c.encode());
      if (fails > 12) break; }
    if (fails > 12) break; }
  console.log('fuzz: ' + moves + ' edits, ' + refused + ' refused, slowest ' + worst + ' ms');
}
console.log(fails ? fails + ' FAILED of ' + checks : 'all ' + checks + ' checks passed');
process.exit(fails ? 1 : 0);
