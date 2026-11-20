// The kinematics: the formulas, the piecewise motions, the meeting of two cars, the score, the driven cart.
const { Kin, Motion, Car, meet, TARGETS, target, score, Driver, Sim, TRACK, ok, near, done } = require('./load.js');

// constant acceleration: the formulas agree with a fine step-by-step integration
for (const [x0, v0, a] of [[0, 0, 2.5], [30, 20, 0], [12, -3.6, 0.7], [1, 3.2, -1.6]]) { let x = x0, v = v0; const h = 1e-4;
  for (let t = 0; t < 5 - 1e-12; t += h) { x += v * h + 0.5 * a * h * h; v += a * h; } const k = Kin.at(x0, v0, a, 5);
  near(k.x, x, 1e-6, 'x(5) by formula = integrated, a = ' + a); near(k.v, v, 1e-9, 'v(5) by formula = integrated, a = ' + a);
  near(k.v * k.v, v0 * v0 + 2 * a * (k.x - x0), 1e-9, 'v² = v0² + 2aΔx, a = ' + a); }

// piecewise: the default program is continuous in x and v at every boundary, and matches hand values
{ const m = new Motion(0, 0, Sim.PROGRAM); near(m.T, 12.2, 1e-12, 'program lasts 4 + 5 + 3.2 s');
  for (const k of m.knots) { const before = m.at(k.t - 1e-7), after = m.at(k.t + 1e-7); near(before.x, after.x, 1e-5, 'x continuous at t = ' + k.t); near(before.v, after.v, 1e-5, 'v continuous at t = ' + k.t); }
  near(m.at(4).v, 8, 1e-12, 'v = 8 m/s after speeding up'); near(m.at(4).x, 16, 1e-12, 'x = 16 m after speeding up'); near(m.at(9).x, 56, 1e-12, 'x = 56 m after coasting');
  near(m.end.v, 0, 1e-12, 'stops at the end'); near(m.end.x, 68.8, 1e-9, 'x = 68.8 m at the end'); near(m.at(20).x, 68.8, 1e-9, 'past the end it holds its place');
  ok(m.jumps.length === 0, 'a program never jumps in velocity'); }
// a piece with a new starting velocity is a jump (an x–t corner): x stays continuous
{ const T = target('there-back'); ok(T.motion.jumps.length === 2, 'out-wait-back has two velocity jumps'); for (const t of T.motion.jumps) near(T.motion.at(t - 1e-7).x, T.motion.at(t + 1e-7).x, 1e-6, 'x continuous across a jump');
  near(T.motion.at(10).x, 1.5, 1e-12, 'out-wait-back ends at 1.5 m'); }

// every target stays on the track, lasts 10 s, and has a sensible kind
for (const T of TARGETS) { let lo = Infinity, hi = -Infinity, vmax = 0; for (let i = 0; i <= 400; i++) { const s = T.motion.at(i / 400 * T.T); lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); vmax = Math.max(vmax, Math.abs(s.v)); }
  ok(lo >= TRACK.lo && hi <= TRACK.hi, T.key + ': stays on the track (' + lo.toFixed(2) + '–' + hi.toFixed(2) + ' m)'); near(T.T, 10, 1e-9, T.key + ': lasts 10 s'); ok(vmax <= 1, T.key + ': walkable (|v| ≤ 1 m/s)'); ok(T.kind === 'x' || T.kind === 'v', T.key + ': x or v target'); }
ok(TARGETS.some((T) => T.motion.pieces.some((p) => p.v === 0)), 'some target stands still'); ok(TARGETS.some((T) => T.kind === 'v' && T.motion.at(1).v < 0), 'some v target is negative');
ok(TARGETS.filter((T) => { let pos = false; for (let i = 0; i <= 100; i++) { const v = T.motion.at(i / 10).v; if (v > 1e-9) pos = true; else if (pos && v < -1e-9) return true; } return false; }).length >= 3, 'three targets turn round');

// two cars: the police chase (one meeting), toward each other, two meetings, never, tangent, together at 0, parallel
{ const m = meet({ x0: 0, v0: 0, a: 2.5 }, { x0: 30, v0: 20, a: 0 }, 20); ok(m.times.length === 1, 'chase: one meeting'); near(m.times[0], (20 + Math.sqrt(550)) / 2.5, 1e-9, 'chase: t = (20 + √550)/2.5'); near(m.xs[0], 30 + 20 * m.times[0], 1e-9, 'chase: both at the same x'); }
{ const m = meet({ x0: 0, v0: 15, a: 0 }, { x0: 300, v0: -10, a: 0 }, 16); ok(m.times.length === 1, 'toward: one meeting'); near(m.times[0], 12, 1e-12, 'toward: t = 12 s'); near(m.xs[0], 180, 1e-9, 'toward: x = 180 m'); }
{ const m = meet({ x0: 0, v0: 6, a: 0 }, { x0: 20, v0: 0, a: 0.5 }, 25); ok(m.times.length === 2 && m.inside === 2, 'bus: two meetings'); near(m.times[0], 4, 1e-9, 'bus: first at 4 s'); near(m.times[1], 20, 1e-9, 'bus: second at 20 s'); near(m.xs[0], 24, 1e-9, 'bus: first at 24 m'); near(m.xs[1], 120, 1e-9, 'bus: second at 120 m'); }
{ const m = meet({ x0: 0, v0: 5, a: 0 }, { x0: 20, v0: 0, a: 1 }, 15); ok(m.times.length === 0 && m.closest, 'miss: no meeting, a closest approach'); near(m.closest.t, 5, 1e-9, 'miss: closest at 5 s'); near(m.closest.gap, 7.5, 1e-9, 'miss: 7.5 m apart then'); }
{ const m = meet({ x0: 0, v0: 4, a: 0 }, { x0: 8, v0: 0, a: 1 }, 10); ok(m.times.length === 1 && m.tangent, 'tangent: they just touch once'); near(m.times[0], 4, 1e-6, 'tangent: at 4 s'); }
{ const m = meet({ x0: 5, v0: 2, a: 0 }, { x0: 5, v0: 0, a: 1 }, 10); ok(m.times.length === 2 && m.times[0] === 0, 'together at t = 0 counts, then again'); near(m.times[1], 4, 1e-9, '... at 4 s'); }
{ const m = meet({ x0: 0, v0: 3, a: 0 }, { x0: 10, v0: 3, a: 0 }, 10); ok(!m.times.length && !m.always && m.closest && Math.abs(m.closest.gap - 10) < 1e-9, 'same velocity: never, always 10 m apart'); }
{ const m = meet({ x0: 0, v0: 3, a: 0.5 }, { x0: 0, v0: 3, a: 0.5 }, 10); ok(m.always, 'identical cars are always together'); }
{ const m = meet({ x0: 0, v0: 10, a: 0 }, { x0: 0 + 300, v0: 0, a: 0 }, 20); ok(m.times.length === 1 && m.inside === 0, 'a meeting after the time shown is found, but flagged as later'); }
// the presets meet as their notes say
{ const s = new Sim(); s.choose('cars'); const want = { chase: 1, toward: 1, bus: 2, miss: 0 }; for (const P of Sim.CARS) { s.setCars(P.key); ok(s.meeting.inside === want[P.key], P.key + ': ' + want[P.key] + ' meeting(s) inside the time shown'); }
  for (const P of Sim.CARS) for (const t of meet(P.A, P.B, P.time).times) ok(Math.abs(t - 1) > 0.05, P.key + ': no meeting at exactly 1 s'); }

// the score: 100 % for a perfect match, lower for a miss, 0 for a big miss; the sketch scores the same way
for (const T of TARGETS) { const k = T.kind, perfect = []; for (let i = 0; i <= 600; i++) { const t = i / 600 * T.T; perfect.push({ t, val: T.motion.at(Math.min(t, T.T - 1e-9))[k] }); }
  ok(score(perfect, T).pct === 100, T.key + ': a perfect run scores 100 %');
  const off = perfect.map((p) => ({ t: p.t, val: p.val + 0.5 * (k === 'x' ? 0.5 : 0.25) })); const s = score(off, T); ok(s.pct === 50, T.key + ': off by half the tolerance scores 50 % (got ' + s.pct + ')');
  ok(score(perfect.map((p) => ({ t: p.t, val: p.val + 9 })), T).pct === 0, T.key + ': far off scores 0'); }
{ const s = new Sim(); s.setTask('sketch'); s.setTarget('turn-v'); s.setSketchOf('v'); const T = s.target;
  for (let i = 0; i < Sim.N; i++) { const t = i / (Sim.N - 1) * T.T; s.pen(t, T.motion.at(Math.min(t, T.T - 1e-9)).v, i === 0); } s.penUp(); ok(s.check() && s.result.pct === 100, 'a perfect sketch scores 100 %');
  const u = new Sim(); u.setTask('sketch'); u.pen(0, 0, true); u.pen(3, 0.2); ok(!u.check() && u.result.short, 'a sketch across less than 80 % of the time is not checked'); }
// a sketch drawn in two strokes, backwards: filled in between the pointer's positions
{ const s = new Sim(); s.setTask('sketch'); s.pen(10, 0.4, true); s.pen(0, 0, false); s.penUp(); ok(s.sketchCoverage === 1, 'one stroke right to left covers the run'); near(s.sketch[100], 0.2, 1e-9, 'and is filled in straight between'); }

// the driven cart: the throttle moves it at the set velocity; the walls stop it; a drag reads a smoothed velocity
{ const d = new Driver(1); d.cmd = 0.4; for (let i = 0; i < 240; i++) d.step(1 / 240); near(d.x, 1.4, 1e-9, 'throttle 0.4 m/s for 1 s: 0.4 m'); near(d.v, 0.4, 1e-12, 'v reads 0.4 m/s');
  d.keys = 1; for (let i = 0; i < 480; i++) d.step(1 / 240); near(d.cmd, 0.8, 1e-9, 'holding → for 2 s adds 0.4 m/s'); d.keys = 0; d.cmd = -1.5; for (let i = 0; i < 1200; i++) d.step(1 / 240); ok(d.x === TRACK.lo && d.v === 0, 'the end of the track stops it');
  const e = new Driver(2); e.drag = 2; for (let i = 0; i < 480; i++) { e.drag += 0.3 / 240; e.step(1 / 240); } near(e.v, 0.3, 0.005, 'dragging at 0.3 m/s reads 0.3 m/s'); near(e.a, 0, 0.02, 'and a ≈ 0'); }
// a driven run that follows the target exactly scores 100 %
{ const s = new Sim(); s.setTarget('steady-away'); ok(Math.abs(s.driver.x - 0.8) < 1e-12, 'the cart starts where the target does'); s.throttle(0.3); s.play(); for (let i = 0; i < 700; i++) s.tick(1 / 60);
  ok(!s.playing && s.t === 10, 'the run stops at 10 s'); ok(s.result && s.result.pct >= 99, 'driving at exactly 0.3 m/s scores ' + (s.result && s.result.pct) + ' %'); }
// rewind and drive on: the recording after that moment is dropped
{ const s = new Sim(); s.setTarget('steady-away'); s.throttle(0.3); s.play(); for (let i = 0; i < 300; i++) s.tick(1 / 60); s.pause(); const n0 = s.rec.length; s.seek(2); s.play(); ok(s.rec.length < n0 && s.recEnd <= 2 + 1e-9, 'driving on from 2 s drops the rest');
  near(s.driver.x, 0.8 + 0.6, 0.01, 'and the cart is back where it was at 2 s'); }
// turning round: found where v = 0 inside the run
{ const s = new Sim(); s.choose('diagram'); s.setCase('turn'); near(s.turn.t, 2, 1e-12, 'turning round at 2 s'); near(s.turn.x, 4.2, 1e-12, 'at x = 4.2 m'); s.setCase('steady'); ok(!s.turn, 'steady: never turns'); }

// ---- braking cars stop and stay stopped; a car from rest with aₓ ≠ 0 speeds up ----
{ const c = { x0: 10, v0: 12, a: -3 }; near(Car.stop(c), 4, 1e-12, 'stop time t = −v0/a = 4 s'); near(Car.stopX(c), 34, 1e-12, 'stops at x = 10 + 12·4 − ½·3·16 = 34 m');
  const m = Car.motion(c, 10); near(m.at(4).v, 0, 1e-9, 'v = 0 at the stop'); near(m.at(7).v, 0, 1e-12, 'and stays 0'); near(m.at(7).x, 34, 1e-9, 'and stays at 34 m'); near(m.at(7).a, 0, 1e-12, 'a drops to 0 once stopped'); near(m.at(2).a, -3, 1e-12, 'a = −3 m/s² while braking');
  ok(m.jumps.length === 0, 'stopping is not a velocity jump'); const r = Car.motion({ x0: 0, v0: -8, a: 2 }, 10); near(r.at(9).x, -16, 1e-9, 'braking toward −x stops at −16 m too'); near(r.at(9).v, 0, 1e-12, '... and stays');
  ok(!isFinite(Car.stop({ x0: 0, v0: 0, a: 2.5 })), 'from rest with a > 0: never stops (an engine pushes it)'); near(Car.motion({ x0: 0, v0: 0, a: -1.5 }, 10).at(4).v, -6, 1e-12, 'from rest with a < 0: speeds up toward −x');
  ok(!isFinite(Car.stop({ x0: 0, v0: 5, a: 0.5 })), 'speeding up: never stops'); const late = Car.motion({ x0: 0, v0: 30, a: -1 }, 20); near(late.at(20).v, 10, 1e-12, 'a stop after the time shown is not reached'); }
// the presets where nobody brakes meet exactly as before
{ const chase = meet({ x0: 0, v0: 0, a: 2.5 }, { x0: 30, v0: 20, a: 0 }, 20); near(chase.times[0], (20 + Math.sqrt(550)) / 2.5, 1e-9, 'chase unchanged');
  const bus = meet({ x0: 0, v0: 6, a: 0 }, { x0: 20, v0: 0, a: 0.5 }, 25); ok(bus.times.length === 2 && Math.abs(bus.times[0] - 4) < 1e-9 && Math.abs(bus.times[1] - 20) < 1e-9, 'bus unchanged'); ok(bus.eqs.length === 1, 'no braking: one equation for all time'); }
// a braking car is caught after it has stopped: solve the other car's equation against x_stop
{ const A = { x0: 0, v0: 4, a: 0 }, B = { x0: 10, v0: 12, a: -3 }, m = meet(A, B, 20); // B stops at 4 s at 34 m; A reaches 34 m at 8.5 s
  ok(m.times.length === 1, 'caught once, after the stop'); near(m.times[0], 8.5, 1e-9, 'at t = 34/4 = 8.5 s'); near(m.xs[0], 34, 1e-9, 'at x_stop = 34 m');
  const e = m.eqs.find((q) => q.roots.length); ok(e.restB && !e.restA && Math.abs(e.t0 - 4) < 1e-12, 'the equation used is the one after B stops');
  // with constant acceleration B would have reversed and met A earlier: check that is NOT what happens
  const naive = (t) => 10 + 12 * t - 1.5 * t * t - 4 * t; ok(Math.abs(naive(m.times[0])) > 1, 'not the reversing-car answer'); }
// meeting before the stop: the quadratic, as before
{ const A = { x0: 0, v0: 20, a: -2 }, B = { x0: 30, v0: 5, a: 0 }, m = meet(A, B, 20); // A stops at 10 s at 100 m; −t² + 15t − 30 = 0 → t = 2.457 s
  near(m.times[0], (15 - Math.sqrt(105)) / 2, 1e-9, 'meets before A stops: from the quadratic'); ok(m.times.length === 2, 'and B passes the stopped A later'); near(m.times[1], 14, 1e-9, 'B reaches x_stop = 100 m at 14 s'); near(m.xs[1], 100, 1e-9, '... at 100 m'); }
// both stop: they meet only if they stop at the same place
{ const m1 = meet({ x0: 0, v0: 10, a: -2 }, { x0: 40, v0: 4, a: -1 }, 20); ok(!m1.times.length && m1.closest && Math.abs(m1.closest.gap - 23) < 1e-9, 'both stopped apart (25 m vs 48 m): never meet, 23 m apart');
  const m2 = meet({ x0: 0, v0: 10, a: -2 }, { x0: 21, v0: 4, a: -2 }, 20); ok(m2.times.length === 1 && Math.abs(m2.times[0] - 5) < 1e-6 && Math.abs(m2.xs[0] - 25) < 1e-6, 'B stops at 25 m at 2 s; A stops right there at 5 s: they meet once, at rest together (' + JSON.stringify(m2.times) + ')');
  const m3 = meet({ x0: 0, v0: 10, a: -2 }, { x0: 21, v0: 4, a: -4 }, 20); near(m3.times[0], 5 - Math.SQRT2, 1e-9, 'B already stopped at 23 m: A gets there at 5 − √2 s, still braking'); ok(m3.times.length === 1, '... and passes it once'); }
{ const s = new Sim(); s.choose('cars'); s.setCar('B', 'v0', 12); s.setCar('B', 'a', -3); s.setCar('B', 'x0', 10); s.setCar('A', 'v0', 4); s.setCar('A', 'a', 0); s.setCar('A', 'x0', 0);
  const B = s.bodies()[1]; near(B.at(15).x, 34, 1e-9, 'the sim draws the braking car at rest after it stops'); near(B.at(15).a, 0, 1e-12, 'with a = 0'); }

// ---- programs from velocity pieces: straight x–t segments, a = 0 inside pieces, the jumps honest ----
{ const s = new Sim(); s.choose('program'); s.setBuild('v'); const m = s.motion(); near(m.T, 10.5, 1e-12, 'velocity program lasts 4 + 2.5 + 4 s');
  near(m.at(4).x, 12, 1e-9, 'Δx = 3 × 4 = 12 m'); near(m.at(6.5).x, 12, 1e-9, 'standing still: no Δx'); near(m.end.x, 6, 1e-9, 'then −1.5 × 4: ends at 6 m');
  for (const t of [1, 5, 8]) near(m.at(t).a, 0, 1e-12, 'a = 0 inside a piece (t = ' + t + ')'); ok(m.jumps.length === 2, 'two velocity jumps between pieces');
  for (const tj of m.jumps) near(m.at(tj - 1e-7).x, m.at(tj + 1e-7).x, 1e-5, 'x continuous at a jump');
  ok(s.addPiece() && s.pieces[3].v === 0 && s.prog.pieces.length === 3, 'adding a piece adds a velocity piece, leaving the acceleration list alone');
  s.setPiece(0, 'v', 2.5); near(s.motion().at(4).x, 10, 1e-9, 'editing a velocity piece');
  s.setBuild('a'); near(s.motion().end.x, 68.8, 1e-9, 'switching back finds the acceleration program as it was'); }
done('kin');
