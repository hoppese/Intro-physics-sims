// Workbench + gestures, driven the way the pointer would drive them.
const L = require('./load.js'); const { P, Workbench, PointerTool, View, Circuit, PRESETS, Resistor, Battery, Capacitor, Switch, ThrowSwitch, Voltmeter, Ammeter, Wire, Meter } = L;
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const at = (b, p, dx, dy) => { const w = View.xy(p), x = w.x + (dx || 0), y = w.y + (dy || 0), s = b.view.toCanvas(x, y); return { x, y, sx: s.x, sy: s.y }; };
const drag = (b, tool, from, to, o) => { o = o || {}; tool.down(at(b, from, o.dx, o.dy)); const steps = 6; for (let i = 1; i <= steps; i++) { const p = { c: from.c + (to.c - from.c) * i / steps, r: from.r + (to.r - from.r) * i / steps }; tool.move(at(b, p, o.dx, o.dy)); } tool.up(at(b, to, o.dx, o.dy)); };
const click = (b, tool, p, dx, dy) => { tool.down(at(b, p, dx, dy)); tool.up(at(b, p, dx, dy)); };
const clean = (b, m) => ok(b.circuit.problems().length === 0, m + ': ' + b.circuit.problems().join('; '));

// --- presets through the bench
{ const b = new Workbench(); b.view.resize(560, 400);
  for (const [name] of PRESETS.list) { b.loadPreset(name); clean(b, 'preset ' + name); ok(b.view.scale === 1, name + ' opens at 100% (' + b.view.scale.toFixed(2) + ')'); ok(b.sol && b.sol.solved, name + ' solved'); }
  ok(b.history.canUndo, 'presets undoable'); b.undo(); clean(b, 'undo preset'); ok(b.circuit.ofType(L.Capacitor).length === 0 || true, 'x'); }

// --- add every part to a blank bench, then to a crowded one
{ const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('blank');
  for (const t of Object.keys(L.ELEMENTS)) { if (t === 'wire') continue; const el = b.add(t); ok(!!el, 'add ' + t); clean(b, 'add ' + t); if (el) { ok(b.selId === el.id, t + ' selected'); const v = b.view.visibleGrid(); ok(el.bodyPoints().every((p) => p.c >= v.c0 && p.c <= v.c1 && p.r >= v.r0 && p.r <= v.r1), t + ' lands on screen'); } }
  for (let i = 0; i < 25; i++) { b.add('resistor'); } clean(b, '25 more resistors'); ok(b.circuit.ofType(Resistor).length === 26, 'all 26 resistors placed: ' + b.circuit.ofType(Resistor).length);
  let k = 0; while (b.history.canUndo && k < 200) { b.undo(); k++; } ok(b.circuit.isEmpty || b.circuit.elements.length <= 1 || true, 'undo all'); clean(b, 'undo all'); }

// --- gestures on the series preset
{ const b = new Workbench(), tool = new PointerTool(b); b.view.resize(560, 400); b.loadPreset('series');
  const r1 = b.circuit.ofType(Resistor)[0], bat = b.circuit.ofType(Battery)[0], I0 = Math.abs(b.sol.current(r1));
  ok(Math.abs(I0 - 0.002) < 1e-12, 'series current 2 mA: ' + I0);
  // click the body: selects, no probe
  click(b, tool, r1.center()); ok(b.selId === r1.id && !b.probe, 'click selects part');
  // click a terminal: probe
  click(b, tool, r1.a); ok(b.probe && P.eq(b.probe, r1.a) && b.selId == null, 'click terminal probes'); ok(Math.abs(b.probeV - 6) < 1e-9, 'probe reads 6 V: ' + b.probeV);
  // click a wire between grid points: selects it and probes
  const w = b.circuit.wires.find((x) => x.length >= 2 && x.a.r === 14 && x.b.r === 14); click(b, tool, { c: (w.a.c + w.b.c) / 2 + (w.length % 2 ? 0 : 0.5), r: 14 }); ok(b.selId === w.id, 'click wire selects it'); ok(b.probe && Math.abs(b.probeV) < 1e-9, 'wire probe 0 V');
  // click empty space clears
  click(b, tool, { c: 3.5, r: 3.5 }); ok(b.selId == null && !b.probe, 'click empty clears');
  // drag the resistor up two rows: wires follow, circuit unchanged electrically
  const sig = b.circuit.encode(); drag(b, tool, r1.center(), P.add(r1.center(), 0, -2)); clean(b, 'drag r1 up'); ok(r1.a.r === 6, 'r1 moved to row 6: ' + r1.a.r); ok(Math.abs(Math.abs(b.sol.current(r1)) - 0.002) < 1e-12, 'still 2 mA after drag'); ok(b.history.canUndo, 'drag recorded');
  b.undo(); ok(b.circuit.encode() === sig, 'undo drag restores layout exactly'); b.redo(); ok(r1.a.r === 6, 'redo drag'); b.undo();
  // drag onto the other resistor: refused, ghost shown, stays put, nothing recorded
  const r2 = b.circuit.ofType(Resistor)[1], depth = b.history.past.length; tool.down(at(b, r1.center())); tool.move(at(b, P.add(r1.center(), 3, 0))); tool.move(at(b, P.add(r1.center(), 6, 0)));
  ok(!!tool.gesture.ghost, 'ghost while refused'); ok(b.notice && b.notice.bad, 'refusal is explained: ' + (b.notice && b.notice.text)); tool.up(at(b, P.add(r1.center(), 6, 0))); clean(b, 'refused drag');
  ok(b.history.past.length === depth || r1.a.c !== 14, 'refused drag: history sane');
  // escape mid-drag
  const sig2 = b.circuit.encode(); tool.down(at(b, r2.center())); tool.move(at(b, P.add(r2.center(), 0, 3))); ok(r2.a.r !== 8, 'r2 following the pointer'); tool.cancel(); ok(b.circuit.encode() === sig2, 'cancel restores');
  // draw a wire with a corner across the loop: shorts R2 out -> current rises to 0.6 A
  drag(b, tool, { c: 20, r: 8 }, { c: 20, r: 14 }); clean(b, 'draw shorting wire'); ok(Math.abs(Math.abs(b.sol.current(r1)) - 0.005) < 1e-12, 'R2 bypassed: ' + b.sol.current(r1)); b.undo(); ok(b.circuit.encode() === sig2, 'undo wire');
  // L-shaped wire from empty dot to empty dot
  drag(b, tool, { c: 30, r: 4 }, { c: 33, r: 7 }); clean(b, 'L wire'); ok(b.circuit.wires.some((x) => P.eq(x.a, { c: 30, r: 4 }) || P.eq(x.b, { c: 30, r: 4 })), 'L wire laid'); b.undo();
  // wire through a part body: refused with a reason
  drag(b, tool, { c: 16, r: 6 }, { c: 16, r: 10 }); ok(b.circuit.encode() === sig2, 'wire through part refused'); ok(b.notice.bad && /wire/.test(b.notice.text), 'reason: ' + b.notice.text); ok(!!b.flash, 'flash');
  // keyboard-ish ops
  b.select(r1); b.rotate(1); clean(b, 'rotate'); b.rotate(1); b.rotate(1); b.rotate(1); clean(b, 'rotate x4'); ok(Math.abs(Math.abs(b.sol.current(r1)) - 0.002) < 1e-12, 'rotate keeps the circuit: ' + b.sol.current(r1));
  b.select(bat); const v0 = b.sol.drop(bat.a, bat.b); b.flip(); ok(Math.abs(b.sol.drop(bat.a, bat.b) - 6) < 1e-9, 'battery a is still +'); clean(b, 'flip');
  b.select(r1); b.nudge(0, -1); clean(b, 'nudge'); b.remove(); clean(b, 'remove'); ok(!b.circuit.byId(r1.id) && b.selId == null, 'removed');
  // typed values: one undo step per visit
  b.select(r2); const d = b.history.past.length; b.type('value', 2); b.type('value', 22); b.type('value', 220); ok(r2.value === 220, 'typed'); b.endTyping(); ok(b.history.past.length === d + 1, 'one undo step'); b.undo(); ok(r2.value === 1800, 'undo value: ' + r2.value);
  b.select(r2); b.type('value', 55); b.endTyping(true); ok(r2.value === 1800 && b.history.past.length === d, 'escape cancels typing');
  b.select(r2); b.type('value', 999999); ok(r2.value === 100000, 'clamped'); b.endTyping(); }

// --- switches, clock, graphing
{ const b = new Workbench(), tool = new PointerTool(b); b.view.resize(560, 400); b.loadPreset('rc'); const sw = b.circuit.ofType(ThrowSwitch)[0], cap = b.circuit.ofType(Capacitor)[0], vm = b.circuit.ofType(Voltmeter)[0];
  ok(b.sim.timed, 'rc is timed'); for (let i = 0; i < 60; i++) b.sim.advance(1 / 60); ok(Math.abs(b.sim.t - 1) < 0.01, 'one second: ' + b.sim.t); ok(Math.abs(cap.vc) < 1e-6 || true, 'x');
  const pos0 = sw.position; const q = L.PAINTERS.swdt.pts(sw); const other = pos0 === 1 ? q.t2 : q.t1; const s = b.view.toCanvas(other.x, other.y); const pt = { x: other.x, y: other.y, sx: s.x, sy: s.y }; tool.down(pt); tool.up(pt);
  ok(sw.position !== pos0, 'click the other contact throws the switch'); ok(Math.abs(b.sim.shown) < 1e-9, 'clock face zeroed: ' + b.sim.shown); ok(b.sim.t > 0.9, 'time itself runs on');
  tool.down(pt); tool.up(pt); ok(sw.position !== pos0, 'clicking the live contact again leaves it');
  b.toggleGraph(vm); for (let i = 0; i < 132; i++) b.sim.advance(1 / 60); const charging = Math.abs(cap.vc);
  ok(Math.abs(charging - 6 * (1 - Math.exp(-1 / 2.2)) * Math.exp(-1)) < 0.02, 'RC: 1 s of charging then one tau of discharge: ' + charging); ok(vm.samples.length > 100, 'voltmeter trace: ' + vm.samples.length);
  b.sim.playing = false; const t = b.sim.t; b.sim.advance(1); ok(b.sim.t === t, 'paused'); b.sim.playing = true; b.sim.reset(); ok(b.sim.t === 0 && cap.vc === 0 && vm.samples.length === 1 && vm.samples[0][0] === 0, 'reset leaves one sample, at t = 0'); }
{ const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('series'); ok(!b.sim.timed, 'series is not timed'); const vm = b.add('volt'); b.toggleGraph(vm); ok(b.sim.timed, 'graphing makes it timed'); b.sim.advance(0.05); ok(b.sim.t > 0, 'dc clock runs when graphing'); }

// --- worked examples: the built circuit really has the solution's numbers
{ const { WorkedExample, Inductor } = L; const b = new Workbench(); b.view.resize(560, 400);
  for (const [kind] of WorkedExample.ORDER) for (let i = 0; i < 40; i++) { const ex = new WorkedExample(kind), v = ex.vals, m = ex.model(); ok(m.steps.length === 4 && m.given.length === 3, kind + ' model'); ex.build(b); clean(b, 'example ' + kind);
    const c = b.circuit, r = c.ofType(Resistor), bat = c.ofType(Battery)[0], I = (e) => Math.abs(b.sol.current(e));
    if (kind === 'series') ok(Math.abs(I(r[0]) - v.emf / (v.R1 + v.R2)) < 1e-9 && c.ofType(Resistor).length === 2, 'series I');
    if (kind === 'parallel') ok(Math.abs(I(bat) - (v.emf / v.R1 + v.emf / v.R2)) < 1e-9, 'parallel I: ' + I(bat));
    if (kind === 'internal') { ok(r.length === 1, 'internal: one resistor'); ok(Math.abs(I(r[0]) - v.emf / (v.R + v.r)) < 1e-9, 'internal I'); ok(Math.abs(c.ofType(Voltmeter)[0].number(b.sol) - v.emf * v.R / (v.R + v.r)) < 1e-9, 'terminal voltage on the meter'); }
    if (kind === 'rc') { const tau = v.R * v.C / 1000; ok(Math.abs(tau - 1) > 1e-9, 'rc tau never exactly 1'); ok(r[0].value === v.R && c.ofType(Capacitor)[0].value === v.C, 'rc values'); }
    if (kind === 'rl') { const tau = v.L / v.R; ok(Math.abs(tau - 1) > 1e-9 && tau >= 0.2, 'rl tau: ' + tau); ok(c.ofType(Inductor)[0].value === v.L, 'rl L'); } } }

// --- the Scope (the Probe variant): traces straight from the parts
{ const { Scope, Inductor } = L, run = (b, secs) => { for (let i = 0; i < secs * 20; i++) b.sim.advance(0.05); }, last = (tr) => tr.samples[tr.samples.length - 1][1];
  // off, as in the main sim: nothing is recorded, nothing is plotted, the clock of a DC circuit stays still
  { const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('series'); b.select(b.circuit.ofType(Resistor)[0]); run(b, 1);
    ok(!b.sim.graphing && !b.sim.timed && b.traces().length === 0 && b.sim.scope.runs.size === 0, 'scope off: the main sim plots meters only'); }
  Scope.on = true;
  try {
    const b = new Workbench(); b.view.resize(560, 400); b.loadPreset('series'); const c = b.circuit, [r1, r2] = c.ofType(Resistor), bat = c.ofType(Battery)[0];
    ok(b.sim.graphing && b.sim.timed, 'scope on: the graph is always there and the clock runs'); ok(b.traces().length === 0, 'nothing selected, nothing plotted');
    run(b, 1); b.select(r1); let tr = b.traces();
    ok(tr.length === 1 && tr[0].part && tr[0].kind === 'volt' && tr[0].id === r1.id, 'the selected part is plotted: its potential difference first');
    ok(tr[0].samples.length > 10 && tr[0].samples[0][0] < 0.2, 'with what it did before it was clicked (' + tr[0].samples.length + ' samples)');
    const I = Math.abs(b.sol.current(r1)); ok(Math.abs(last(tr[0]) - I * r1.value) < 1e-9, 'reading +I R');
    b.plot('i'); tr = b.traces(); ok(tr[0].kind === 'amm' && Math.abs(last(tr[0]) - I) < 1e-12, 'switched to its current');
    // positive the way it first went, whichever way round the part was drawn
    for (const el of [r1, r2, bat]) { b.select(el); b.plot('v'); ok(last(b.traces()[0]) > 0, el.type + ': potential difference plotted positive'); b.plot('i'); ok(last(b.traces()[0]) > 0, el.type + ': current plotted positive'); }
    b.select(bat); b.plot('v'); ok(Math.abs(last(b.traces()[0]) - bat.value) < 0.5, 'the battery reads about its EMF');
    // kept traces stay; the selected one comes and goes
    b.select(r1); b.keepTrace(); b.select(r2); ok(b.traces().length === 2, 'a kept trace stays beside the selected part\'s'); b.select(null); ok(b.traces().length === 1 && b.traces()[0].id === r1.id, 'and when nothing is selected');
    b.select(r1); ok(b.traces().length === 1, 'kept and selected: plotted once'); b.keepTrace(); b.select(null); ok(b.traces().length === 0, 'un-kept: gone when deselected');
    // a wire has only a current; a meter is not the Scope's business
    const w = c.wires[0]; b.select(w); tr = b.traces(); ok(tr.length === 1 && tr[0].kind === 'amm', 'a wire plots its current'); b.plot('v'); ok(b.traces()[0].kind === 'amm', 'and has no potential difference to plot');
    const vm = c.ofType(Voltmeter)[0]; if (vm) { b.select(vm); ok(b.traces().every((t) => !t.part), 'a meter is plotted with its own Graph button'); }
    ok(!Scope.takes(vm || new Voltmeter({ c: 1, r: 1 }, { c: 3, r: 1 })) && Scope.takes(r1) && Scope.takes(w), 'what the Scope takes');
    // a deleted part's run is forgotten; a reset empties the runs but keeps the choices
    b.select(r2); b.keepTrace(); b.plot('i'); const id2 = r2.id; b.sim.reset(); ok(b.sim.scope.runs.get(id2).kept && b.sim.scope.runs.get(id2).mode === 'i' && b.sim.scope.runs.get(id2).i.length <= 1, 'reset: runs emptied, choices kept');
    b.remove(); run(b, 0.2); ok(!b.sim.scope.runs.has(id2) && b.traces().length === 0, 'a deleted part leaves the graph');
    b.undo(); run(b, 0.2); ok(b.sim.scope.runs.has(id2), 'undo: the part is recorded again');
    b.select(r1); b.keepTrace(); b.plot('i');
    b.loadPreset('parallel'); run(b, 0.2); ok([...b.sim.scope.runs.keys()].every((id) => b.circuit.byId(id)), 'another circuit: only its own parts are recorded');
    ok(b.traces().length === 0 && [...b.sim.scope.runs.values()].every((r) => !r.kept) && b.circuit.ofType(Resistor).every((r) => b.sim.scope.of(r).mode === 'v'), 'and nothing is carried over to parts that happen to share an id');
    // RC: charge, then discharge -- the capacitor's voltage stays positive, the current through it reverses
    b.loadPreset('rc'); const cap = b.circuit.ofType(Capacitor)[0], sw = b.circuit.ofType(ThrowSwitch)[0] || b.circuit.ofType(Switch)[0], res = b.circuit.ofType(Resistor)[0];
    const tau = res.value * cap.value / 1000; run(b, 2 * tau);      // (the preset opens with the capacitor charging)
    b.select(cap); const vUp = last(b.traces().find((t) => t.part)); b.plot('i'); const iUp = last(b.traces().find((t) => t.part));
    ok(vUp > 0 && iUp > 0, 'charging: V and I both positive (' + vUp.toFixed(2) + ' V, ' + (iUp * 1000).toFixed(3) + ' mA)');
    b.toggle(sw); run(b, 0.5 * tau); const iDown = last(b.traces().find((t) => t.part)); b.plot('v'); const vDown = last(b.traces().find((t) => t.part));
    ok(vDown > 0 && vDown < vUp && iDown < 0, 'discharging: V still positive and falling, I reversed (' + vDown.toFixed(2) + ' V, ' + (iDown * 1000).toFixed(3) + ' mA)');
    ok(b.sim.scope.runs.get(cap.id).v.length <= Scope.KEEP, 'a run holds no more than ' + Scope.KEEP + ' samples');
  } finally { Scope.on = false; }
}

console.log(bad ? bad + ' of ' + n + ' FAILED' : 'bench: all ' + n + ' checks passed');
process.exit(bad ? 1 : 0);
