// The physics: momentum is kept to the last digits in every preset; e = 1 keeps K, e = 0 sticks, 0 < e < 1 separates at e times
// the closing speed; the textbook 1D results; an explosion from rest has P = 0 and shares the energy in inverse ratio to the masses;
// equal masses in a glancing elastic collision leave at 90°; a rocket and its exhaust keep P and the CM; Tsiolkovsky; orbits keep
// the CM still and K + U steady.
const L = require('./load.js'), { V, World, PRESETS, setupOf, orbitPair, GRAV, ok, near, done } = L;
const run = (s, T, warp) => { const w = new World(s); while (!w.done && w.t < T) w.advance((warp || 1) / 60); return w; };
const pscale = (w0) => Math.max(1e-30, ...w0.main.map((b) => b.m * V.len(b.v)), V.len(w0.P));

// every preset: total momentum (and the CM's steady motion) to round-off
for (const mode of Object.keys(PRESETS)) for (const p of PRESETS[mode]) { const s = setupOf(mode, p.key), w0 = new World(s), P0 = w0.P, sc = pscale(w0), cm0 = w0.cm, M = w0.M;
  const w = run(s, mode === 'space' ? 12 * s.warp : 20, s.warp), sc2 = Math.max(sc, pscale(w));
  ok(V.len(V.sub(w.P, P0)) < 1e-10 * sc2, mode + '/' + p.key + ': total momentum kept (' + (V.len(V.sub(w.P, P0)) / sc2).toExponential(1) + ')');
  const want = V.at(cm0, P0, w.t / M), span = Math.max(1, ...w.main.map((b) => b.R), V.len(V.sub(w.cm, cm0)), mode === 'space' ? s.view.w : 1);
  ok(V.len(V.sub(w.cm, want)) < 1e-6 * span, mode + '/' + p.key + ': centre of mass moves at P/M in a straight line');
  if (mode !== 'space') ok(!!w.done && w.t < 20, mode + '/' + p.key + ': runs to a clean end (' + (w.done || 'still going at ' + w.t.toFixed(1) + ' s') + ')'); }

// 1D elastic: the textbook formulas, with B at rest
const one = (mA, mB, vA, e) => { const s = setupOf('track', 'equal'); s.e = e; s.bodies[0].m = mA; s.bodies[1].m = mB; s.bodies[0].vx = vA; s.bodies[1].vx = 0; const w = run(s, 20); return w; };
for (const [mA, mB, vA] of [[0.5, 0.5, 0.8], [1.5, 0.25, 0.6], [0.25, 1.5, 0.9], [0.7, 0.45, 1.3]]) { const w = one(mA, mB, vA, 1);
  near(w.main[0].v.x, (mA - mB) / (mA + mB) * vA, 2e-4 * vA, 'elastic ' + mA + ' on ' + mB + ': v_A after'); near(w.main[1].v.x, 2 * mA / (mA + mB) * vA, 2e-4 * vA, 'elastic ' + mA + ' on ' + mB + ': v_B after');
  near(w.K, 0.5 * mA * vA * vA, 2e-4 * 0.5 * mA * vA * vA, 'elastic ' + mA + ' on ' + mB + ': K kept'); }
// e: they separate at e times the speed they closed at; e = 0: one velocity, (m_A v_A)/(m_A + m_B)
for (const e of [0.25, 0.5, 0.6, 0.85]) { const w = one(0.6, 0.4, 0.9, e); near((w.main[1].v.x - w.main[0].v.x) / 0.9, e, 3e-3, 'restitution ' + e + ': speed apart / speed together'); }
{ const w = one(0.75, 0.5, 0.7, 0); near(w.main[0].v.x, w.main[1].v.x, 1e-9, 'sticky: one velocity after'); near(w.main[0].v.x, 0.75 * 0.7 / 1.25, 1e-6, 'sticky: v = m_A v_A/(m_A + m_B)'); ok(w.main[0].g === w.main[1].g, 'sticky: they are joined');
  near(w.th, 0.5 * 0.75 * 0.49 - 0.5 * 1.25 * Math.pow(0.42, 2), 1e-6, 'sticky: the kinetic energy lost is counted as heat'); }
// contact forces are equal and opposite at every moment, and the impulse on each is its change of momentum
{ const s = setupOf('track', 'heavyLight'), w = new World(s); let worst = 0, J = 0, peak = 0; const pB = () => w.main[1].m * w.main[1].v.x, p0 = pB();
  while (!w.done && w.t < 10) { const Fa = w.main[0].F.x, Fb = w.main[1].F.x; worst = Math.max(worst, Math.abs(Fa + Fb)); peak = Math.max(peak, Math.abs(Fb)); w.step(); J += 0.5 * (Fb + w.main[1].F.x) * w.h; }
  ok(worst < 1e-12 * peak && peak > 0, 'third law: F on A = −F on B at every step'); near(J, pB() - p0, 1e-9 * Math.abs(J), 'impulse on B = its change of momentum'); }
{ const w = new World(setupOf('track', 'equal')); let len = 0, on = false, t0 = 0; while (!w.done) { w.step(); const c = w.contacts.size > 0; if (c && !on) t0 = w.t; if (!c && on) len = w.t - t0; on = c; } near(len, 2 * World.TC.track, 0.003, 'a bouncy track collision lasts about 2 × TC (' + len.toFixed(4) + ' s)'); }

// explosion from rest: P stays zero; speeds in inverse ratio to the masses; the spring's energy all goes to K
{ const w = run(setupOf('track', 'explosion'), 20), [a, b] = w.main; near(V.len(w.P), 0, 1e-14, 'explosion from rest: P stays 0'); near(a.v.x * a.m + b.v.x * b.m, 0, 1e-12, 'explosion: m_A v_A = −m_B v_B');
  near(-a.v.x / b.v.x, b.m / a.m, 1e-6, 'explosion: v_A/v_B = m_B/m_A'); near(w.K, 0.12, 1e-6, 'explosion: K after = the spring’s energy'); }
// moving explosion: the CM carries on at the same velocity
{ const s = setupOf('table', 'split'), w = run(s, 20); const v = V.mul(w.P, 1 / w.M); near(v.x, 0.45, 1e-9, 'moving explosion: v_cm,x unchanged'); near(v.y, 0.2, 1e-9, 'moving explosion: v_cm,y unchanged'); }

// 2D: equal masses, elastic, glancing: they leave at 90°; momentum kept in x and y separately
{ const w = run(setupOf('table', 'pool'), 20), [a, b] = w.main; let ang = Math.abs(V.deg(a.v) - V.deg(b.v)); if (ang > 180) ang = 360 - ang; near(ang, 90, 0.3, 'pool: equal-mass elastic glancing blow, 90° apart (' + ang.toFixed(2) + '°)');
  near(a.m * a.v.x + b.m * b.v.x, 0.17 * 2.4, 1e-12, 'pool: p_x kept'); near(a.m * a.v.y + b.m * b.v.y, 0, 1e-12, 'pool: p_y kept'); }
{ const w = run(setupOf('table', 'crossing'), 20), [a, b] = w.main; near(a.v.x, 1.4 * 1.5 / 2.3, 1e-9, 'crossing: v_x after'); near(a.v.y, 0.9 * 2.1 / 2.3, 1e-9, 'crossing: v_y after'); near(V.deg(a.v), Math.atan2(0.9 * 2.1, 1.4 * 1.5) * 180 / Math.PI, 1e-6, 'crossing: direction after'); }

// the rocket: rocket + exhaust keep P = 0 and the CM at rest; Δv = u ln(m0/m)
{ const s = setupOf('space', 'rocket'), w = new World(s), r = w.main[0]; let worst = 0, cmw = 0; while (w.t < 26) { w.advance(1 / 60); worst = Math.max(worst, V.len(w.P)); cmw = Math.max(cmw, V.len(w.cm)); }
  ok(worst < 1e-9 * 1250 * 2600, 'rocket: rocket + exhaust total momentum stays 0'); ok(cmw < 1e-6, 'rocket: the centre of mass of rocket + exhaust stays put');
  near(r.m, 450, 1e-9, 'rocket: burns all 800 kg of fuel'); near(V.len(r.v), 2600 * Math.log(1250 / 450), 0.5, 'rocket: Δv = u ln(m0/m)'); near(V.len(V.add(V.mul(r.v, r.m), w.Pex)), 0, 1e-6 * 1250 * 2600, 'rocket: p_rocket = −p_exhaust'); }

// orbits: two bodies about a still CM; K + U steady; the period
for (const key of ['moon', 'pluto', 'binary', 'binary2']) { const s = setupOf('space', key), w = new World(s), E0 = w.K + w.U, cm0 = w.cm; let dE = 0, dcm = 0, T = null, lastY = w.main[1].p.y;
  while (w.t < 1.2 * (orbitPair(s.bodies[0].m, s.bodies[1].m, V.dist(s.bodies[0], s.bodies[1]), 1).T)) { w.step(); dE = Math.max(dE, Math.abs(w.K + w.U - E0)); dcm = Math.max(dcm, V.dist(w.cm, cm0)); const y = w.main[1].p.y; if (T == null && lastY < 0 && y >= 0 && w.t > 10 * w.h) T = w.t; lastY = y; }
  ok(dcm < 1e-6 * V.dist(s.bodies[0], s.bodies[1]), key + ': the centre of mass stays put'); ok(dE < 2e-4 * Math.abs(E0), key + ': K + U stays steady (' + (dE / Math.abs(E0)).toExponential(1) + ')');
  if (key !== 'binary2') { const o = orbitPair(s.bodies[0].m, s.bodies[1].m, V.dist(s.bodies[0], s.bodies[1])); near(T, o.T, 2e-3 * o.T, key + ': period 2π d/v'); } }
{ const s = setupOf('space', 'satellite'), w = new World(s); while (w.t < 2 * 5829) w.step(); const r = V.dist(w.main[0].p, w.main[1].p); near(r, 7.0e6, 2e3, 'satellite: circular orbit keeps its radius'); }
// a crash in space: they stick, momentum kept
{ const s = setupOf('space', 'moon'); s.bodies[1].vy = 0; s.bodies[0].vy = 0; const w = new World(s); let n = 0; while (w.main[0].g !== w.main[1].g && n++ < 200000) w.step();
  ok(w.main[0].g === w.main[1].g, 'space: bodies that touch stick together'); near(V.len(w.P), 0, 1e-6 * 7.342e22 * 1000, 'space crash: P stays 0'); }

// e near zero but not zero still steps stably (the step shrinks for the stiff unloading spring)
{ const w = one(0.6, 0.4, 0.9, 0.05); near((w.main[1].v.x - w.main[0].v.x) / 0.9, 0.05, 3e-3, 'restitution 0.05 is stable'); }
// sticking at a glance: the contact impulse plus the lock-up jolt is each body's change of momentum
{ const w = run(setupOf('table', 'crossing'), 20), R = w.rec; for (const i of [0, 1]) for (const c of ['x', 'y']) { let J = R[R.length - 1].b[i].J[c] + R[R.length - 1].b[i].jolt[c]; const dp = R[R.length - 1].b[i].m * R[R.length - 1].b[i].v[c] - R[0].b[i].m * R[0].b[i].v[c]; near(J, dp, 1e-9 * Math.max(1, Math.abs(dp)), 'crossing: impulse + jolt = Δp (' + 'AB'[i] + ', ' + c + ')'); } }
done('physics');
