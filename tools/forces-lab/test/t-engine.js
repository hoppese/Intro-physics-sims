// The engine against answers worked out by hand: every classic of a first course in forces.
const { V, Angle, Fmt, Scene, World, ok, near, done } = require('./load.js');
const g = 9.8, rad = Angle.rad;
const world = (els, opts) => new World(Scene.from({ els, opts }));
// a block resting on a surface, `along` metres from its start
const on = (s, along, b) => { const t = V.polar(s.angle), n = V.left(t), h = b.h == null ? 0.3 : b.h, c = V.add(V.at({ x: s.x, y: s.y }, t, along), V.mul(n, h / 2));
  return { t: 'block', ...b, x: c.x, y: c.y, angle: World.tilt(t) }; };
const kinds = (w, id) => w.forcesOn(id).map((f) => f.kind).sort().join(',');
const mag = (w, id, kind) => w.forcesOn(id).filter((f) => f.kind === kind).reduce((s, f) => s + V.len(f.F), 0);
const run = (w, t) => { w.advance(t); return w; };

// ---- a block on an incline ----
for (const th of [15, 30, 50]) { const s = { t: 'surface', id: 1, x: 0, y: 0, angle: th, length: 4, muS: 0, muK: 0 };
  const w = world([s, on(s, 2, { id: 2, mass: 3 })]), a = w.accel(2), down = V.mul(V.polar(th), -1);
  near(V.dot(a, down), g * Math.sin(rad(th)), 1e-9, 'frictionless incline: a = g sin(theta), theta=' + th); near(V.dot(a, V.polar(th + 90)), 0, 1e-9, 'and no acceleration off the surface');
  near(mag(w, 2, 'normal'), 3 * g * Math.cos(rad(th)), 1e-9, 'n = m g cos(theta)'); ok(kinds(w, 2) === 'normal,weight', 'only weight and normal on a frictionless incline: ' + kinds(w, 2));
  // the block slides, and keeps to the surface
  run(w, 0.5); const b = w.body(2); near(V.dot(b.v, down), g * Math.sin(rad(th)) * 0.5, 1e-6, 'speed after 0.5 s'); near(V.dot(V.sub(b.p, { x: 0, y: 0 }), V.polar(th + 90)), 0.15, 1e-6, 'still resting on it'); }
for (const [th, muS, muK] of [[30, 0.2, 0.15], [30, 0.7, 0.5], [20, 0.36, 0.3], [40, 0.5, 0.42]]) {
  const s = { t: 'surface', id: 1, x: 0, y: 0, angle: th, length: 4, muS, muK }, w = world([s, on(s, 2.5, { id: 2, mass: 2 })]), a = V.dot(w.accel(2), V.mul(V.polar(th), -1)), tag = ' theta=' + th + ' muS=' + muS;
  if (Math.tan(rad(th)) <= muS) { near(a, 0, 1e-9, 'static friction holds it' + tag); near(mag(w, 2, 'static'), 2 * g * Math.sin(rad(th)), 1e-9, 'with f_s = m g sin(theta), not mu_s n' + tag); ok(kinds(w, 2) === 'normal,static,weight', 'static' + tag);
    run(w, 1); near(V.len(w.body(2).v), 0, 1e-9, 'and it stays put' + tag); }
  else { near(a, g * (Math.sin(rad(th)) - muK * Math.cos(rad(th))), 1e-9, 'it slides: a = g(sin - mu_k cos)' + tag); near(mag(w, 2, 'kinetic'), muK * 2 * g * Math.cos(rad(th)), 1e-9, 'f_k = mu_k n' + tag);
    run(w, 0.3); near(V.dot(w.accel(2), V.mul(V.polar(th), -1)), g * (Math.sin(rad(th)) - muK * Math.cos(rad(th))), 1e-6, 'and keeps that acceleration while sliding' + tag); } }

// ---- a block sliding to a stop on a level floor ----
{ const s = { t: 'surface', id: 1, x: -5, y: 0, angle: 0, length: 10, muS: 0.4, muK: 0.25 }, w = world([s, on(s, 2, { id: 2, mass: 1.5, vx: 3 })]);
  near(w.accel(2).x, -0.25 * g, 1e-9, 'sliding: a = -mu_k g'); const t = 3 / (0.25 * g); run(w, t + 0.5);
  near(w.body(2).v.x, 0, 1e-9, 'it stops'); near(w.body(2).p.x, -3 + 9 / (2 * 0.25 * g), 2e-3, 'after v^2 / (2 mu_k g)'); ok(kinds(w, 2) === 'normal,weight', 'and then only weight and normal act: ' + kinds(w, 2)); }

// ---- Atwood's machine ----
for (const [m1, m2] of [[2, 3], [5, 1.5], [1.2, 1.8]]) { const w = world([{ t: 'pulley', id: 1, x: 0, y: 3, r: 0.3 }, { t: 'block', id: 2, x: -0.3, y: 1.5, mass: m1 }, { t: 'block', id: 3, x: 0.3, y: 1.2, mass: m2 },
    { t: 'rope', id: 4, from: 2, to: 3, via: [1] }]), a = (m2 - m1) * g / (m1 + m2), T = 2 * m1 * m2 * g / (m1 + m2), tag = ' m1=' + m1 + ' m2=' + m2;
  near(w.accel(2).y, a, 1e-9, 'Atwood: a = (m2 - m1) g / (m1 + m2)' + tag); near(w.accel(3).y, -a, 1e-9, 'the other way for the other block' + tag); near(w.tension(4), T, 1e-9, 'T = 2 m1 m2 g / (m1 + m2)' + tag);
  ok(kinds(w, 2) === 'tension,weight', 'a hanging block: weight and tension' + tag);
  const E0 = w.energy().E; run(w, 0.4); near(w.body(2).v.y, a * 0.4, 1e-4, 'speed after 0.4 s' + tag); near(w.energy().E, E0, 2e-3 * Math.abs(E0) + 1e-3, 'energy is conserved' + tag); near(w.tension(4), T, 1e-6, 'tension unchanged while moving' + tag); }

// ---- a block on a table pulled by a hanging block ----
for (const [m1, m2, muS, muK] of [[4, 1, 0, 0], [4, 2.5, 0.3, 0.2], [4, 1, 0.3, 0.2], [3, 1.2, 0.4, 0.3]]) {
  const tbl = { t: 'surface', id: 1, x: -3, y: 1, angle: 0, length: 3, muS, muK }, b1 = on(tbl, 1.5, { id: 2, mass: m1 }), r = 0.08;
  const w = world([tbl, b1, { t: 'pulley', id: 3, x: 0.1, y: b1.y - r, r }, { t: 'block', id: 4, x: 0.1 + r, y: 0.3, mass: m2 }, { t: 'rope', id: 5, from: 2, to: 4, via: [3] }]), tag = ' m1=' + m1 + ' m2=' + m2 + ' mu=' + muS;
  if (m2 <= muS * m1) { near(w.accel(2).x, 0, 1e-9, 'held by static friction' + tag); near(w.tension(5), m2 * g, 1e-9, 'T = m2 g' + tag); near(mag(w, 2, 'static'), m2 * g, 1e-9, 'f_s = m2 g' + tag); }
  else { const a = (m2 - muK * m1) * g / (m1 + m2); near(w.accel(2).x, a, 1e-9, 'a = (m2 - mu_k m1) g / (m1 + m2)' + tag); near(w.accel(4).y, -a, 1e-9, 'the hanging block falls as fast' + tag);
    near(w.tension(5), m2 * (g - a), 1e-9, 'T = m2 (g - a)' + tag); run(w, 0.5); near(w.body(2).v.x, a * 0.5, 1e-4, 'speed after 0.5 s' + tag); } }

// ---- a block on an incline pulled up by a hanging block over a pulley at the top ----
{ const th = 30, s = { t: 'surface', id: 1, x: -3, y: 0, angle: th, length: 3, muS: 0.2, muK: 0.1 }, top = V.at({ x: -3, y: 0 }, V.polar(th), 3), r = 0.08, b1 = on(s, 1.5, { id: 2, mass: 2 });
  // the pulley sits so that the rope leaves the block parallel to the incline
  const pc = V.add(V.at(V.add(top, V.mul(V.polar(th + 90), 0.15)), V.polar(th), 0.1), V.mul(V.polar(th + 90), -r));
  const w = world([s, b1, { t: 'pulley', id: 3, x: pc.x, y: pc.y, r }, { t: 'block', id: 4, x: pc.x + 0.5, y: pc.y - 1.2, mass: 2.4 }, { t: 'rope', id: 5, from: 2, to: 4, via: [3] }]);
  // (the hanging block hangs straight down from the pulley's far side)
  const hang = w.body(4); hang.p = { x: w.ropes[0].geo.pts[w.ropes[0].geo.pts.length - 2].x, y: hang.p.y };
  const w2 = world([s, b1, { t: 'pulley', id: 3, x: pc.x, y: pc.y, r }, { t: 'block', id: 4, x: hang.p.x, y: pc.y - 1.2, mass: 2.4 }, { t: 'rope', id: 5, from: 2, to: 4, via: [3] }]);
  const a = (2.4 - 2 * Math.sin(rad(th)) - 0.1 * 2 * Math.cos(rad(th))) * g / 4.4;
  near(V.dot(w2.accel(2), V.polar(th)), a, 2e-3, 'incline + hanging mass: a = (m2 - m1 sin - mu_k m1 cos) g / (m1 + m2)'); }

// ---- two blocks pushed together ----
{ const fl = { t: 'surface', id: 1, x: -5, y: 0, angle: 0, length: 10, muS: 0, muK: 0 }, A = on(fl, 3, { id: 2, mass: 3, w: 0.4 }), B = on(fl, 3.4, { id: 3, mass: 1.5, w: 0.4 });
  const w = world([fl, A, B, { t: 'push', id: 4, on: 2, F: 9, angle: 0 }]);
  near(w.accel(2).x, 9 / 4.5, 1e-9, 'pushed pair: a = F / (m1 + m2)'); near(w.accel(3).x, 9 / 4.5, 1e-9, 'both blocks together'); const floorN = w.forcesOn(3).filter((f) => f.kind === 'normal' && f.by && f.by.type === 'surface'); near(floorN.length ? floorN[0].F.y : NaN, 1.5 * g, 1e-9, 'block 2 feels the floor... ' + JSON.stringify(w.forcesOn(3).map((f) => [f.kind, f.by && f.by.type, Fmt.point(f.F, 3)])));
  const contact = w.forcesOn(3).filter((f) => f.kind === 'normal' && Math.abs(f.F.x) > 1e-9); ok(contact.length === 1, 'and a push from block 1'); near(contact[0].F.x, 1.5 * 9 / 4.5, 1e-9, 'of m2 F / (m1 + m2)');
  const back = w.forcesOn(2).filter((f) => f.kind === 'normal' && Math.abs(f.F.x) > 1e-9); near(back[0].F.x, -1.5 * 9 / 4.5, 1e-9, 'Newton\'s third law: block 1 is pushed back as hard'); }

// ---- stacked blocks, the bottom one pulled ----
for (const F of [6, 20, 40]) { const fl = { t: 'surface', id: 1, x: -5, y: 0, angle: 0, length: 10, muS: 0, muK: 0 }, m1 = 3, m2 = 1, muS = 0.5, muK = 0.3;
  const bot = on(fl, 3, { id: 2, mass: m1, w: 1, h: 0.3, muS, muK }), topB = { t: 'block', id: 3, x: bot.x, y: bot.y + 0.3, mass: m2, w: 0.4, h: 0.3 };
  const w = world([fl, bot, topB, { t: 'push', id: 4, on: 2, F, angle: 0 }]), tag = ' F=' + F;
  if (F / (m1 + m2) <= muS * g) { near(w.accel(2).x, F / (m1 + m2), 1e-9, 'stacked, no slipping: a = F / (m1 + m2)' + tag); near(w.accel(3).x, F / (m1 + m2), 1e-9, 'the top block keeps up' + tag); near(mag(w, 3, 'static'), m2 * F / (m1 + m2), 1e-9, 'pulled along by static friction m2 a' + tag); }
  else { near(w.accel(3).x, muK * g, 1e-9, 'the top block slips: a = mu_k g' + tag); near(w.accel(2).x, (F - muK * m2 * g) / m1, 1e-9, 'the bottom one: (F - mu_k m2 g) / m1' + tag); ok(mag(w, 3, 'kinetic') > 0, 'kinetic friction between them' + tag); } }

// ---- a block pressed against a wall ----
for (const [F, muS] of [[40, 0.6], [20, 0.6]]) { const m = 2, wall = { t: 'surface', id: 1, x: 0, y: 0, angle: 90, length: 3, muS, muK: 0.4 }, w = world([wall, { t: 'block', id: 2, x: -0.2, y: 1.5, mass: m, w: 0.4 }, { t: 'push', id: 3, on: 2, F, angle: 0 }]), tag = ' F=' + F;
  if (muS * F >= m * g) { near(V.len(w.accel(2)), 0, 1e-9, 'pressed against a wall: static friction holds it' + tag); near(mag(w, 2, 'static'), m * g, 1e-9, 'f_s = m g' + tag); near(mag(w, 2, 'normal'), F, 1e-9, 'n = F' + tag); }
  else { near(w.accel(2).y, -(g - 0.4 * F / m), 1e-9, 'it slides down: a = g - mu_k F / m' + tag); } }

// ---- springs ----
{ const fl = { t: 'surface', id: 1, x: -5, y: 0, angle: 0, length: 10, muS: 0, muK: 0 }, k = 50, m = 2, x0 = 0.3, b = on(fl, 5 + x0, { id: 3, mass: m });
  const w = world([fl, { t: 'anchor', id: 2, x: -1, y: b.y }, b, { t: 'spring', id: 4, from: 2, to: 3, k, rest: 1 }]);
  near(w.accel(3).x, -k * x0 / m, 1e-9, 'Hooke: a = -k x / m'); let last = w.body(3).v.x, t0 = null, crossings = [];
  for (let i = 0; i < 4000 && crossings.length < 3; i++) { w.step(World.H); const v = w.body(3).v.x; if (last < 0 && v >= 0 || last > 0 && v <= 0) crossings.push(w.t); last = v; }
  near(crossings[2] - crossings[0], 2 * Math.PI * Math.sqrt(m / k), 2e-3, 'period 2 pi sqrt(m / k)'); near(w.body(3).p.x, -0.3, 1e-3, 'at the far end again, a period on, with no energy gained'); }
{ const k = 40, m = 1.6, w = world([{ t: 'anchor', id: 1, x: 0, y: 4 }, { t: 'block', id: 2, x: 0, y: 4 - 1 - m * g / k, mass: m }, { t: 'spring', id: 3, from: 1, to: 2, k, rest: 1 }]);
  near(V.len(w.accel(2)), 0, 1e-9, 'a hanging spring at rest stretches m g / k'); }

// ---- free flight, and landing ----
{ const w = world([{ t: 'block', id: 1, x: 0, y: 4, vx: 2, vy: 3 }]); run(w, 0.5); near(w.body(1).p.x, 1, 1e-9, 'projectile: x = v_x t'); near(w.body(1).p.y, 4 + 1.5 - g * 0.125, 1e-9, 'y = y0 + v_y t - g t^2 / 2'); }
{ const w = world([{ t: 'surface', id: 1, x: -3, y: 0, angle: 0, length: 6, muS: 0.5, muK: 0.4 }, { t: 'block', id: 2, x: 0, y: 2, mass: 2 }]); run(w, 1);
  near(w.body(2).p.y, 0.15, 1e-6, 'a dropped block lands on the floor'); near(V.len(w.body(2).v), 0, 1e-6, 'and stops there'); near(mag(w, 2, 'normal'), 2 * g, 1e-6, 'and then n = m g'); }
{ const tbl = { t: 'surface', id: 1, x: -2, y: 1, angle: 0, length: 2, muS: 0, muK: 0 }, w = world([tbl, on(tbl, 1.8, { id: 2, mass: 1, vx: 1.5 })]); run(w, 0.5);
  ok(w.body(2).p.x > 0.5 && w.body(2).p.y < 1, 'a block sliding off a table edge falls: ' + Fmt.point(w.body(2).p, 2)); }

// ---- a pendulum ----
{ const L = 1.2, th = 8, w = world([{ t: 'anchor', id: 1, x: 0, y: 4 }, { t: 'block', id: 2, x: L * Math.sin(rad(th)), y: 4 - L * Math.cos(rad(th)), mass: 1, w: 0.1, h: 0.1 }, { t: 'rope', id: 3, from: 1, to: 2, via: [] }]);
  let last = w.body(2).v.x, cr = []; for (let i = 0; i < 5000 && cr.length < 3; i++) { w.step(World.H); const v = w.body(2).v.x; if (last < 0 && v >= 0 || last > 0 && v <= 0) cr.push(w.t); last = v; }
  near(cr[2] - cr[0], 2 * Math.PI * Math.sqrt(L / g) * (1 + rad(th) ** 2 / 16), 3e-3, 'a block on a rope swings with the pendulum period');
  near(V.dist(w.body(2).p, { x: 0, y: 4 }), L, 1e-4, 'and its rope keeps its length'); }

// ---- a rope that goes slack ----
{ const fl = { t: 'surface', id: 1, x: -5, y: 0, angle: 0, length: 10, muS: 0, muK: 0 }, b = on(fl, 6, { id: 3, mass: 1, vx: -1 });
  const w = world([fl, { t: 'anchor', id: 2, x: 0, y: b.y }, b, { t: 'rope', id: 4, from: 2, to: 3, via: [] }]); run(w, 0.5);
  near(w.body(3).v.x, -1, 1e-9, 'moving toward its anchor, the rope goes slack and pulls nothing'); near(w.tension(4), 0, 1e-12, 'T = 0');
  const w2 = world([fl, { t: 'anchor', id: 2, x: 0, y: b.y }, { ...b, vx: 1 }, { t: 'rope', id: 4, from: 2, to: 3, via: [] }]); run(w2, 0.1);
  near(w2.body(3).v.x, 0, 1e-4, 'moving away, the rope snaps taut and stops it'); }

// ---- nothing blows up ----
{ let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let trial = 0; trial < 60; trial++) { const els = [{ t: 'surface', id: 1, x: -5, y: 0, angle: 0, length: 10, muS: rnd(), muK: rnd() * 0.5 }, { t: 'surface', id: 2, x: -4, y: 0, angle: 10 + rnd() * 50, length: 3, muS: rnd(), muK: rnd() * 0.5 }];
    for (let i = 0; i < 3; i++) els.push({ t: 'block', id: 10 + i, x: -4 + rnd() * 8, y: 0.2 + rnd() * 3, mass: 0.5 + rnd() * 4, vx: rnd() * 4 - 2 });
    els.push({ t: 'pulley', id: 20, x: rnd() * 2, y: 4, r: 0.1 }, { t: 'rope', id: 21, from: 10, to: 11, via: [20] }, { t: 'spring', id: 22, from: 11, to: 12, k: 20 + rnd() * 100, rest: 0.5 + rnd() });
    const w = world(els); run(w, 2); ok(w.bodies.every((b) => [b.p.x, b.p.y, b.v.x, b.v.y].every(isFinite)), 'finite after 2 s, trial ' + trial); } }

done('engine');
