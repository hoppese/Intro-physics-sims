// The physics of each situation: Newton's second law holds at every moment, the textbook formulas come out, and
// the motion does the right thing when something gives out (a cut string, a skid, a slack string).
const L = require('./load.js'), { V3, G, Puck, FlatCurve, BankedCurve, Conical, Vertical, SITUATIONS, ok, near, done } = L;
const net = (n) => n.forces.reduce((s, f) => V3.add(s, f.F), V3.O);
const law = (sit, what, tol) => { const n = sit.now(), F = net(n), ma = V3.mul(n.a, n.m); return V3.len(V3.sub(F, ma)) <= (tol || 1e-9) * Math.max(1, n.m * G); };
const run = (sit, T, check) => { let fine = true; for (let t = 0; t < T; t += 1 / 60) { sit.advance(1 / 60); if (check && !check(sit)) fine = false; } return fine; };

// every situation, every variant and road: ΣF = m a at every moment, and on the circle a = v²/r toward the centre
for (const [key, C] of Object.entries(SITUATIONS)) for (const variant of (C.VARIANTS || [[null]]).map((x) => x[0])) for (const road of ['dry', 'wet', 'icy']) {
  const s = new C(); if (variant) s.setVariant(variant); s.setRoad(road); const tag = key + (variant ? '/' + variant : '') + ' ' + road;
  ok(law(s), tag + ': ΣF = m a at the start');
  ok(run(s, 6, (x) => law(x, '', 1e-7)), tag + ': ΣF = m a all the way through 6 s');
  const n = s.now(); if (n.onCircle) { const v = V3.len(n.v); near(V3.dot(n.a, n.rhat), v * v / n.R, 1e-6 * Math.max(1, v * v / n.R), tag + ': on the circle, a_r = v²/r'); } }

// the puck: T = m v²/r; cut, it goes straight on at the same speed, and leaves the table
{ const p = new Puck(); const { m, r, v } = p.vals; near(V3.len(p.now().forces.find((f) => f.kind === 'tension').F), m * v * v / r, 1e-9, 'puck: T = m v²/r = ' + (m * v * v / r).toFixed(2) + ' N');
  run(p, 0.7); p.snip(); const n0 = p.now(); ok(!n0.forces.some((f) => f.kind === 'tension') && V3.len(n0.a) === 0, 'puck: cut, no tension and no acceleration');
  run(p, 0.2); const n1 = p.now(); near(V3.len(V3.cross(V3.sub(n1.p, n0.p), n0.v)), 0, 1e-9, 'puck: and it carries straight on, along the velocity it had'); near(V3.len(n1.v), v, 1e-12, 'puck: at the same speed');
  run(p, 5); ok(!!p.done && /edge/.test(p.done), 'puck: and slides off the table'); p.snip(); ok(!p.cut && p.t === 0, 'puck: tying it back on starts again'); }

// a flat curve: friction m v²/r while it can; v_max = √(μs g r); past it, a skid in a nearly straight line
{ const c = new FlatCurve(); const { m, r, v } = c.vals; const f = c.now().forces.find((x) => x.kind === 'static'); near(V3.len(f.F), m * v * v / r, 1e-9, 'flat curve: static friction = m v²/r');
  near(c.vmax, Math.sqrt(0.8 * G * r), 1e-12, 'flat curve: v_max = √(μs g r)'); ok(v < c.vmax && !c.skid, 'flat curve: ' + v + ' m/s holds on a dry road (v_max ' + c.vmax.toFixed(1) + ' m/s)');
  c.setRoad('wet'); ok(v > c.vmax && !!c.skid && /Too fast/.test(c.event), 'flat curve: and skids on a wet one (v_max ' + c.vmax.toFixed(2) + ' m/s)');
  const n0 = c.now(); run(c, 0.5); const n1 = c.now(); near(V3.len(V3.cross(V3.unit(V3.sub(n1.p, n0.p)), V3.unit(n0.v))), 0, 1e-9, 'flat curve: the skid is a straight line along the velocity, not out from the centre');
  ok(V3.len(n1.v) < V3.len(n0.v), 'flat curve: slowing under kinetic friction'); run(c, 10); ok(!!c.done, 'flat curve: and it ends off the road or stopped: ' + c.done);
  c.setRoad('dry'); c.set('v', c.vmax * 0.999); ok(!c.skid, 'flat curve: just under v_max it holds'); c.set('v', c.vmax * 1.001); ok(!!c.skid, 'flat curve: just over, it skids'); }

// a banked curve: no friction at the design speed √(g r tanθ); friction down the bank above it, up the bank below it
{ const b = new BankedCurve(); const { m, r } = b.vals, th = b.th; near(b.design, Math.sqrt(G * r * Math.tan(th)), 1e-12, 'banked: design speed √(g r tanθ) = ' + b.design.toFixed(2) + ' m/s');
  b.set('v', b.design); ok(!b.now().forces.some((f) => f.kind === 'static'), 'banked: at the design speed, no friction at all'); near(V3.len(b.now().forces.find((f) => f.kind === 'normal').F), m * G / Math.cos(th), 1e-3, 'banked: and n = m g / cosθ');
  b.set('v', b.design + 2); const f1 = b.now().forces.find((f) => f.kind === 'static'); ok(f1 && f1.F.z < 0 && V3.dot(f1.F, b.now().rhat) > 0, 'banked: faster, friction points down the bank');
  b.set('v', b.design - 2); const f2 = b.now().forces.find((f) => f.kind === 'static'); ok(f2 && f2.F.z > 0 && V3.dot(f2.F, b.now().rhat) < 0, 'banked: slower, up the bank');
  b.set('v', 35); ok(!!b.done && /Too fast/.test(b.done) && b.slip === 'up', 'banked: far too fast, it slides up the bank'); b.setRoad('icy'); b.set('v', 3); ok(!!b.done && /Too slow/.test(b.done) && b.slip === 'down', 'banked: crawling on ice, it slides down'); }

// a conical pendulum: v = √(g L sinθ tanθ), T = m g / cosθ, period 2π √(L cosθ / g)
{ const c = new Conical(); const { m, L } = c.vals, th = c.th; near(c.speed, Math.sqrt(G * L * Math.sin(th) * Math.tan(th)), 1e-12, 'conical: v = √(g L sinθ tanθ)');
  near(V3.len(c.now().forces.find((f) => f.kind === 'tension').F), m * G / Math.cos(th), 1e-9, 'conical: T = m g / cosθ');
  const per = 2 * Math.PI * c.r / c.speed; near(per, 2 * Math.PI * Math.sqrt(L * Math.cos(th) / G), 1e-9, 'conical: period 2π √(L cosθ / g) = ' + per.toFixed(3) + ' s');
  const n = c.now(); near(V3.len(V3.sub(n.p, c.pivot)), L, 1e-9, 'conical: the ball is L from the pivot'); }

// a vertical circle: energy is kept on the circle; at the bottom T = m v²/r + m g; at the top it needs √(g r)
for (const variant of ['string', 'loop']) { const s = new Vertical(); s.setVariant(variant); const { m, r, vb } = s.vals, kind = variant === 'loop' ? 'normal' : 'tension';
  near(V3.len(s.now().forces.find((f) => f.kind === kind).F), m * vb * vb / r + m * G, 1e-9, variant + ': at the bottom, ' + kind + ' = m v²/r + m g');
  ok(vb > s.vbmin, variant + ': the preset speed (' + vb + ' m/s) clears the top (needs ' + s.vbmin.toFixed(2) + ' m/s at the bottom)');
  const E = (x) => { const n = x.now(); return V3.dot(n.v, n.v) / 2 + G * n.p.z; }, E0 = E(s);
  ok(run(s, 4, (x) => Math.abs(E(x) - E0) < 1e-6 * E0), variant + ': energy is kept all the way round'); ok(!s.free && !s.event, variant + ': and it never leaves the circle');
  s.set('vb', s.vbmin * 0.9); run(s, 3); ok(!!s.event && /Too slow/.test(s.event), variant + ': at 90% of √(5 g r) it leaves the circle near the top'); ok(run(s, 4, (x) => law(x, '', 1e-7)), variant + ': ΣF = m a through the fall and the jolt');
  s.set('vb', Math.sqrt(2 * G * r) * 0.95); ok(run(s, 6, (x) => !x.free), variant + ': too slow to reach the side, it swings like a pendulum and never leaves'); }

// ---- a Ferris wheel ----
{ const { Ferris } = L, s = new Ferris(), { m, r, v } = s.vals, ac = v * v / r, comp = (n, k) => n.forces.filter((f) => f.kind === k).reduce((a, f) => V3.add(a, f.F), V3.O);
  ok(run(s, 40, (x) => law(x, '', 1e-9)), 'ferris: ΣF = m a all the way round'); s.reset();
  near(comp(s.now(), 'normal').z, m * (G + ac), 1e-9, 'ferris: at the bottom n = m(g + v²/r)'); ok(V3.len(comp(s.now(), 'static')) < 1e-9, 'ferris: at the bottom no friction is needed');
  s.al = Math.PI; near(comp(s.now(), 'normal').z, m * (G - ac), 1e-9, 'ferris: at the top n = m(g − v²/r)');
  s.al = Math.PI / 2; const n3 = s.now(); near(comp(n3, 'normal').z, m * G, 1e-9, 'ferris: at the side n = m g'); near(V3.len(comp(n3, 'static')), m * ac, 1e-9, 'ferris: and static friction alone gives m v²/r');
  ok(s.now().forces.every((f) => f.kind !== 'normal' || (Math.abs(f.F.x) < 1e-12 && Math.abs(f.F.y) < 1e-12)), 'ferris: the seat’s normal force is always vertical (the gondola stays level)');
  const v0 = V3.len(s.now().v); s.advance(3); near(V3.len(s.now().v), v0, 1e-12, 'ferris: the speed is steady');
  s.set('v', s.vtop * 1.1); ok(/lap bar/.test(s.event || ''), 'ferris: faster than √(g r), the lap bar has to hold the rider in at the top'); s.al = Math.PI; ok(s.now().forces.some((f) => f.by === 'the lap bar' && f.F.z < 0), 'ferris: and at the top it pulls down'); }

// ---- a satellite in orbit ----
{ const { Orbit } = L, s = new Orbit(), GM = Orbit.GM, r0 = s.r0, E = (x) => { const n = x.now(); return V3.dot(n.v, n.v) / 2 - GM / V3.len(n.p); };
  near(s.vals.v * 1000, Math.sqrt(GM / r0), 1e-3, 'orbit: loads at the circular speed for 400 km'); near(s.vals.v, 7.67, 0.01, 'orbit: that is about 7.67 km/s');
  const n0 = s.now(), F = V3.len(n0.forces[0].F); near(F, n0.m * V3.dot(n0.v, n0.v) / r0, 1e-6 * F, 'orbit: gravity = m v²/r at the circular speed');
  near(V3.len(n0.a), GM / (r0 * r0), 1e-9, 'orbit: a = GM/r², a little under 9.8 m/s² at 400 km'); ok(V3.len(n0.a) < 9.8 && V3.len(n0.a) > 8.5, 'orbit: g at the ISS height is about 8.7 m/s²');
  const T = 2 * Math.PI * r0 / s.vcirc, E0 = E(s); let rmin = Infinity, rmax = 0; while (s.t < T) { s.advance(1 / 60); const r = V3.len(s.p); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
  ok(rmax - rmin < 1e-6 * r0, 'orbit: at the circular speed the distance stays the same all the way round'); near(E(s), E0, 1e-7 * Math.abs(E0), 'orbit: energy is kept'); ok(!s.done, 'orbit: a circular orbit never ends');
  near(Orbit.conic(s.p, s.vel).T, T, 1e-4 * T, 'orbit: the period from the orbit matches 2πr/v');
  // a little slower: an ellipse with its far point at the start; Kepler's period
  s.set('v', 7.2); const c = s.shape; ok(c.bound && Math.abs(c.ra - r0) < 1e-6 * r0 && c.rp < r0, 'orbit: slower, the start is the far point of an ellipse');
  ok(c.rp < Orbit.RE, 'orbit: 7.2 km/s at 400 km dips into the Earth'); let k = 0; while (!s.done && k++ < 5000) s.advance(1 / 60); ok(/hit the Earth/.test(s.done || ''), 'orbit: and it crashes');
  s.set('v', 7.9); const d = s.shape; ok(d.bound && Math.abs(d.rp - r0) < 1e-6 * r0 && d.ra > r0, 'orbit: faster, the start is the near point of an ellipse'); const E1 = E(s), h1 = s.p.x * s.vel.y - s.p.y * s.vel.x; let back = false, gone = false, t1 = 0;
  while (s.t < d.T * 1.02) { s.advance(1 / 60); if (s.t > d.T / 2 && !gone) gone = true; if (gone && !back && V3.len(V3.sub(s.p, { x: 0, y: -r0, z: 0 })) < 0.002 * r0) { back = true; t1 = s.t; } }
  ok(back && Math.abs(t1 - d.T) < 0.01 * d.T, 'orbit: it comes back to the start after Kepler’s period 2π√(a³/GM)'); near(E(s), E1, 1e-6 * Math.abs(E1), 'orbit: energy is kept on the ellipse');
  near(s.p.x * s.vel.y - s.p.y * s.vel.x, h1, 1e-8 * h1, 'orbit: angular momentum is kept (equal areas)');
  s.set('v', s.vesc / 1000 * 1.01); ok(!s.shape.bound, 'orbit: just past √(2GM/r) it is not bound'); k = 0; while (!s.done && k++ < 20000) s.advance(1 / 60); ok(/escaped/.test(s.done || ''), 'orbit: and it escapes');
  s.set('v', 7.0); s.set('alt', 35786); ok(!s.circular, 'orbit: a non-circular speed stays when the height changes'); s.setCircular(); near(2 * Math.PI * s.r0 / s.vcirc / 3600, 23.93, 0.01, 'orbit: circular at 35 786 km takes a sidereal day (geostationary)');
  s.set('alt', 1000); ok(s.circular, 'orbit: a circular orbit stays circular when the height changes'); }

done('physics');
