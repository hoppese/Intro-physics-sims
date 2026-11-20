// The physics: the spline, energy conservation on every track, friction's energy going to E_th, leaving the
// track exactly where n reaches zero, the loop's threshold, turning points, landings, and editing.
const L = require('./load.js'), { Track, CircleLoop, PRESETS, Ride, Sim, Panel, Link, G, ok, near, done } = L;
const runFor = (sim, secs) => { sim.play(); for (let i = 0; i < secs * 60 && sim.playing; i++) sim.tick(1 / 60); };

// ---- the spline goes through its points, smoothly ----
for (const [k, P] of Object.entries(PRESETS)) { const t = new Track(P.pts); ok(t.valid, k + ': the ready-made track is valid');
  let worst = 0; P.pts.forEach((p, i) => { const q = t.at(t.t[i]); worst = Math.max(worst, Math.hypot(q.x - p.x, q.y - p.y)); }); ok(worst < 1e-9, k + ': the curve passes through every point');
  let jump = 0; for (let i = 1; i < t.n - 1; i++) { const a = t.geo(t.t[i] - 1e-7), b = t.geo(t.t[i] + 1e-7); jump = Math.max(jump, Math.abs(a.k - b.k), Math.hypot(a.T.x - b.T.x, a.T.y - b.T.y)); } ok(jump < 1e-4, k + ': slope and curvature are continuous at the points');
  ok(t.bounds.y0 > 0, k + ': the curve stays above the ground'); }

// ---- friction off: K + U_g + E_th is the same all the way (E_th only from landing jolts) ----
for (const k of Object.keys(PRESETS)) { const s = new Sim(); s.choose(k); const E0 = s.E0; let worst = 0, modes = new Set(); s.play();
  for (let i = 0; i < 60 * 30 && s.playing; i++) { s.tick(1 / 60); worst = Math.max(worst, Math.abs(s.energy().E - E0)); modes.add(s.ride.st.mode); }
  ok(worst < 2e-5 * E0, k + ': energy is conserved without friction (worst ' + worst.toExponential(1) + ' J of ' + Math.round(E0) + ')');
  if (!modes.has('air')) ok(s.ride.now().th === 0, k + ': no thermal energy without friction'); }
// on the track alone, K + U_g on its own is conserved to a tiny fraction
{ const s = new Sim(); s.choose('valley'); const E0 = s.E0; runFor(s, 60); near(s.energy().E, E0, 1e-6 * E0, 'valley: a minute of rocking, E unchanged'); ok(s.ride.now().th === 0, 'valley: no E_th'); }

// ---- the speed at the bottom follows from the drop, whatever the shape ----
{ const s = new Sim(); s.choose('valley'); s.play(); let best = { y: Infinity }; for (let i = 0; i < 400; i++) { s.tick(1 / 120); const n = s.ride.now(); if (n.p.y < best.y) best = { y: n.p.y, v: n.speed }; }
  near(best.v, Math.sqrt(2 * G * (s.h0 - best.y)), 1e-4, 'valley: v at the bottom = √(2 g Δh)'); }

// ---- friction on: the mechanical energy lost is exactly the thermal energy gained ----
for (const k of Object.keys(PRESETS)) { const s = new Sim(); s.choose(k); s.setFriction(true); const E0 = s.E0; let worst = 0; s.play();
  for (let i = 0; i < 60 * 30 && s.playing; i++) { s.tick(1 / 60); worst = Math.max(worst, Math.abs(s.energy().E - E0)); }
  ok(worst < 2e-4 * E0, k + ': with friction, K + U_g + E_th stays the same (worst ' + worst.toExponential(1) + ' J)'); if (s.rolling) ok(s.ride.mu === 0, k + ': a rolling ball feels no kinetic friction'); else ok(s.ride.now().th > 0, k + ': friction made thermal energy'); }
{ const s = new Sim(); s.choose('valley'); s.setFriction(true); runFor(s, 120); ok(!!s.ride.done && /rest/.test(s.ride.done), 'valley with friction: comes to rest (' + s.ride.done + ')');
  const n = s.ride.now(); near(n.th, s.E0 - (n.K + s.vals.m * G * (n.p.y - s.vals.y0)), 1e-3 * s.E0, 'valley with friction: E_th = the mechanical energy lost'); ok(n.p.y < 2, 'valley with friction: it settles near the bottom'); }
// friction off a flat start: does not start on a gentle slope
{ const s = new Sim(); s.choose('valley'); s.setFriction(true); s.set('mu', 0.5); s.setRelease(s.track.sAt(s.track.nearest({ x: 16, y: 1 }).u)); ok(!!s.ride.done, 'friction holds a cart at rest at the bottom'); }

// ---- turning points: frictionless, it rises to its start height and no higher ----
{ const s = new Sim(); s.choose('twoHills'); s.play(); let top = -Infinity, back = false; for (let i = 0; i < 60 * 12; i++) { s.tick(1 / 60); const n = s.ride.now(); if (n.p.x > 18) top = Math.max(top, n.p.y); if (s.ride.st.ud < 0 && n.p.x > 18) back = true; }
  ok(back, 'two hills: the car turns back before the taller hill'); near(top, s.h0, 2e-3, 'two hills: it turns at the height it started from'); ok(s.track.pts.some((p) => p.y > s.h0), 'two hills: the second hill is taller than the start'); }
{ const s = new Sim(); s.choose('twoHills'); s.play(); s.tick(1 / 60); const A = s.ahead(); ok(A && A.turn && A.turn.x > 18, 'two hills: the energy line predicts the turn on the tall hill'); }

// ---- leaving the track where n reaches zero; the loop's threshold ----
{ const s = new Sim(); s.choose('loop'); const hm = s.track.hmin, L0 = s.track.loop; ok(hm && L0, 'loop: has a lowest start and a loop top');
  near(hm.h, L0.bottom + 2.5 * L0.r, 0.06 * (hm.h - L0.bottom), 'loop: the lowest start is near 2.5 r above the bottom (' + hm.h.toFixed(2) + ' vs ' + (L0.bottom + 2.5 * L0.r).toFixed(2) + ')');
  const tryStart = (h) => { const t = new Sim(); t.choose('loop'); t.setRider('ice'); t.setHeight(h); let left = null; t.play(); for (let i = 0; i < 60 * 5 && t.playing && !left; i++) { t.tick(1 / 60); if (t.ride.st.mode === 'air' && t.ride.st.left) left = t.ride.st.left; } return { t, left }; };
  const above = tryStart(hm.h * 1.01), below = tryStart(hm.h * 0.97); ok(!above.left, 'loop: from just above the lowest start, the ball stays on'); ok(!!below.left, 'loop: from just below, the ball leaves the track');
  if (below.left) { near(below.left.n, 0, 1e-3 * s.vals.m * G, 'loop: it leaves exactly where n reaches 0'); const q = s.track.geo(below.left.u); ok(q.N.y < 0, 'loop: it leaves on the upper part of the loop'); } }
// a coaster car never leaves
{ const s = new Sim(); s.choose('hill'); let air = false, pulls = false; s.play(); for (let i = 0; i < 60 * 20 && s.playing; i++) { s.tick(1 / 60); if (s.ride.st.mode !== 'track') air = true; if (s.ride.now().n < 0) pulls = true; }
  ok(!air, 'hill: the coaster car stays on'); ok(pulls, 'hill: over the crest the rail pulls it (n < 0)');
  s.setRider('ball'); s.play(); for (let i = 0; i < 60 * 6 && s.playing; i++) { s.tick(1 / 60); if (s.ride.st.mode === 'air') air = true; } ok(air, 'hill: a ball flies off the crest'); }
// the normal force: less than m g over a crest, more in a dip
{ const s = new Sim(); s.choose('valley'); s.play(); let most = 0; for (let i = 0; i < 300; i++) { s.tick(1 / 60); most = Math.max(most, s.ride.now().n); } ok(most > s.vals.m * G * 1.2, 'valley: n is more than m g in the dip'); }

// ---- off the end, through the air, onto the ground ----
{ const s = new Sim(); s.choose('ski'); const seen = new Set(); let landX = null; s.play(); for (let i = 0; i < 60 * 10 && s.playing; i++) { s.tick(1 / 60); seen.add(s.ride.st.mode); if (landX === null && s.ride.st.mode === 'ground') landX = s.ride.st.x; }
  ok(seen.has('air') && seen.has('ground'), 'ski jump: flies off the lip and lands'); ok(landX > 18 && landX < 31, 'ski jump: lands inside the picture (x = ' + (landX && landX.toFixed(1)) + ' m)'); ok(s.ride.now().th > 0, 'ski jump: the landing jolt goes to E_th');
  ok(!!s.ride.done && /side/.test(s.ride.done), 'ski jump: rolls off the side (' + s.ride.done + ')'); }
{ const s = new Sim(); s.choose('halfPipe'); s.set('v0', 8); const E0 = s.E0; let air = false, back = false; s.play(); for (let i = 0; i < 60 * 12 && s.playing; i++) { s.tick(1 / 60); if (s.ride.st.mode === 'air') air = true; if (air && s.ride.st.mode === 'track') back = true; }
  ok(air, 'half-pipe: fast enough, it flies out over the rim'); ok(back, 'half-pipe: it drops back into the pipe'); ok(Math.abs(s.energy().E - E0) < 1e-3 * E0, 'half-pipe: energy still adds up'); }
// nothing falls through the bottom of the picture
for (const k of Object.keys(PRESETS)) for (const rider of ['ice', 'ball', 'hollow', 'car']) for (const v0 of [0, 6, 15]) { const s = new Sim(); s.choose(k); s.setRider(rider); s.set('v0', v0); let low = Infinity; s.play();
  for (let i = 0; i < 60 * 20 && s.playing; i++) { s.tick(1 / 60); low = Math.min(low, s.ride.now().p.y); } ok(low >= -1e-9, k + '/' + rider + ' v0 = ' + v0 + ': never below the ground (' + low.toFixed(3) + ')'); }

// ---- sliding or rolling: the ice cube, a solid ball (beta 2/5), a hollow one (2/3) ----
{ const riders = { ice: 0, ball: 0.4, hollow: 2 / 3, car: 0 }; for (const [k, b] of Object.entries(riders)) { const s = new Sim(); s.setRider(k); near(s.beta, b, 1e-12, k + ': beta = ' + b.toFixed(3)); ok(s.rolling === b > 0, k + (b > 0 ? ' rolls' : ' does not roll')); } }
// energy, with K_rot, is conserved for a rolling ball on every track; K_rot = beta K_tr while it rolls on the track
for (const k of Object.keys(PRESETS)) for (const rider of ['ball', 'hollow']) { const s = new Sim(); s.choose(k); s.setRider(rider); const E0 = s.E0; let worst = 0, ratio = 0, air = false; s.play();
  for (let i = 0; i < 60 * 30 && s.playing; i++) { s.tick(1 / 60); const n = s.ride.now(), e = s.energy(n); worst = Math.max(worst, Math.abs(e.E - E0)); if (n.mode === 'air') air = true; if (n.mode === 'track' && n.K > 1) ratio = Math.max(ratio, Math.abs(n.Kr / n.K - s.beta)); }
  ok(worst < 2e-5 * E0, k + '/' + rider + ': K_tr + K_rot + U_g + E_th is conserved (worst ' + worst.toExponential(1) + ' J)'); ok(ratio < 1e-9, k + '/' + rider + ': on the track K_rot = β K_tr'); }
{ const s = new Sim(); s.choose('valley'); s.setRider('ball'); const E0 = s.E0; runFor(s, 60); near(s.energy().E, E0, 1e-6 * E0, 'valley/ball: a minute of rolling, E unchanged'); ok(s.ride.now().th === 0, 'valley/ball: no E_th'); }
// the speed from a drop: the ball goes √(5/7) as fast as the ice cube; the hollow ball √(3/5)
{ const at = (rider) => { const s = new Sim(); s.choose('valley'); s.setRider(rider); s.play(); let best = { y: Infinity }; for (let i = 0; i < 600; i++) { s.tick(1 / 120); const n = s.ride.now(); if (n.p.y < best.y) best = { y: n.p.y, v: n.speed, h: s.h0 }; } return best; };
  const ice = at('ice'), ball = at('ball'), hol = at('hollow');
  near(ball.v, Math.sqrt(10 * G * (ball.h - ball.y) / 7), 1e-4, 'ball: v at the bottom = √(10 g Δh/7)'); near(ball.v / Math.sqrt(2 * G * (ball.h - ball.y)), Math.sqrt(5 / 7), 1e-5, 'ball/ice cube from the same drop: √(5/7)');
  near(hol.v / Math.sqrt(2 * G * (hol.h - hol.y)), Math.sqrt(3 / 5), 1e-5, 'hollow ball/ice cube: √(3/5)'); near(ice.y, ball.y, 0.02, 'the three reach the same bottom'); }
// it rises back to its start height on the far side (its spin gives back what it took)
{ const s = new Sim(); s.choose('halfPipe'); s.setRider('ball'); s.play(); let top = -Infinity, x0 = s.ride.now().p.x; for (let i = 0; i < 60 * 8; i++) { s.tick(1 / 60); const n = s.ride.now(); if (Math.sign(n.p.x - 16) !== Math.sign(x0 - 16)) top = Math.max(top, n.p.y); }
  near(top, s.h0, 3e-3, 'half-pipe/ball: rolls up to its start height on the other side'); }
// the loop: from 2.6 r the ice cube gets round and the solid ball does not; a ball needs 2.7 r; a hollow one 2 + 5/6 r
{ const loopRun = (rider, f) => { const t = new Sim(); t.choose('loop'); t.setRider(rider); const L = t.track.loop; t.setHeight(L.bottom + f * L.r); let left = null; t.play(); for (let i = 0; i < 60 * 6 && t.playing && !left; i++) { t.tick(1 / 60); if (t.ride.st.mode === 'air' && t.ride.st.left) left = t.ride.st.left; } return { t, left }; };
  const s = new Sim(); s.choose('loop'); const L = s.track.loop; near(s.track.hminFor(0).h, L.bottom + 2.5 * L.r, 1e-9, 'loop: sliding needs 2.5 r'); near(s.track.hminFor(0.4).h, L.bottom + 2.7 * L.r, 1e-9, 'loop: a solid ball needs 2.7 r'); near(s.track.hminFor(2 / 3).h, L.bottom + (2 + 5 / 6) * L.r, 1e-9, 'loop: a hollow ball needs 2.83 r');
  ok(!loopRun('ice', 2.52).left, 'loop: the ice cube from 2.52 r stays on'); ok(!!loopRun('ball', 2.52).left, 'loop: a ball from the same height leaves the track'); ok(!loopRun('ball', 2.72).left, 'loop: the ball from 2.72 r stays on'); ok(!!loopRun('ball', 2.68).left, 'loop: and from 2.68 r leaves');
  ok(!!loopRun('hollow', 2.8).left && !loopRun('hollow', 2.86).left, 'loop: the hollow ball needs 2.83 r');
  const b = loopRun('ball', 2.6); if (b.left) near(b.left.n, 0, 1e-3 * b.t.vals.m * G, 'loop/ball: it leaves exactly where n reaches 0');
  // the spline loop's own threshold moves the same way
  const sp = new Sim(); sp.choose('loop'); sp.setLoopMode('spline'); ok(sp.track.hminFor(0.4).h > sp.track.hminFor(0).h, 'spline loop: a ball needs a higher start than an ice cube'); }
// rolling: no kinetic friction, and the friction switch does nothing to it; static friction is drawn, along the track
{ const s = new Sim(); s.choose('valley'); s.setRider('ball'); s.setFriction(true); ok(s.ride.mu === 0, 'a rolling ball ignores the kinetic-friction switch'); s.play(); for (let i = 0; i < 20; i++) s.tick(1 / 60);
  const n = s.ride.now(), fs = n.forces.find((f) => f.kind === 'static'); ok(!!fs, 'rolling down a slope: static friction acts'); if (fs) { near(Math.abs(fs.F.x * n.N.x + fs.F.y * n.N.y), 0, 1e-9, 'static friction is along the track');
    const sum = n.forces.reduce((a, f) => ({ x: a.x + f.F.x, y: a.y + f.F.y }), { x: 0, y: 0 }), F = s.ride.forces(s.ride.st.u, s.ride.st.ud); near((sum.x * n.T.x + sum.y * n.T.y) / n.m, F.at, 1e-9, 'the forces add up to m a along the track'); }
  const c = new Sim(); c.choose('valley'); c.setRider('ice'); c.play(); c.tick(1 / 60); ok(!c.ride.now().forces.some((f) => f.kind === 'static'), 'an ice cube feels no static friction'); }
// the drawn ball turns by the distance rolled over its drawn radius
{ const s = new Sim(); s.choose('valley'); s.setRider('ball'); s.play(); let d = 0, last = s.ride.now().p; for (let i = 0; i < 30; i++) { s.tick(1 / 60); const p = s.ride.now().p; d += Math.hypot(p.x - last.x, p.y - last.y); last = p; }
  near(Math.abs(s.ride.now().ang), d / Ride.RDRAW, 0.01 * d / Ride.RDRAW + 1e-3, 'the ball turns through (distance rolled)/(drawn radius)'); const c = new Sim(); c.choose('valley'); c.play(); for (let i = 0; i < 30; i++) c.tick(1 / 60); ok(c.ride.now().ang === 0, 'the ice cube does not turn'); }
// landing: a spinning ball that lands is brought back to rolling, keeping angular momentum about the contact; the jolt goes to E_th, E still adds up
{ const r = new Ride(new Track(PRESETS.ski.pts), { beta: 0.4, m: 10 }); const R = r.reroll(5, 0); near(R.v, 5 / 1.4, 1e-12, 'a ball landing without spin rolls on at v/(1 + β)'); near(R.loss, 10 * 25 / 2 - 1.4 * 10 * (5 / 1.4) ** 2 / 2, 1e-9, 'and the energy that takes is the loss');
  const same = r.reroll(5, -5); near(same.v, 5, 1e-12, 'already rolling: unchanged'); near(same.loss, 0, 1e-9, 'with no loss'); }
{ const s = new Sim(); s.choose('ski'); s.setRider('ball'); const E0 = s.E0; let worst = 0, seen = new Set(); s.play(); for (let i = 0; i < 60 * 10 && s.playing; i++) { s.tick(1 / 60); seen.add(s.ride.st.mode); worst = Math.max(worst, Math.abs(s.energy().E - E0)); }
  ok(seen.has('air') && seen.has('ground'), 'ski jump/ball: flies and lands'); ok(worst < 2e-5 * E0, 'ski jump/ball: K_tr + K_rot + U_g + E_th still adds up (worst ' + worst.toExponential(1) + ' J)'); }

// ---- moving the zero of U_g changes U_g and E, never K or the motion ----
{ const a = new Sim(), b = new Sim(); a.choose('hill'); b.choose('hill'); b.set('y0', 4.3); runFor(a, 2); runFor(b, 2); const na = a.ride.now(), nb = b.ride.now();
  near(nb.K, na.K, 1e-9, 'zero moved: K the same'); near(b.energy().U, a.energy().U - a.vals.m * G * 4.3, 1e-6, 'zero moved: U_g lower by m g Δy0'); near(nb.p.x, na.p.x, 1e-12, 'zero moved: the motion the same');
  const t = b.time; b.set('y0', 1.1); ok(b.time === t, 'moving the zero does not restart the clock'); }

// ---- editing keeps the track valid ----
{ const t = new Track(PRESETS.hill.pts); ok(!t.move(1, { x: t.pts[0].x + 0.1, y: t.pts[0].y }), 'a point cannot sit on top of its neighbour');
  ok(t.move(2, { x: 7, y: -5 }) && t.pts[2].y === Track.YMIN, 'a point dragged below the ground stops just above it');
  const n0 = t.n, i = t.insert(t.T * 0.4); ok(i > 0 && t.n === n0 + 1 && t.valid, 'a point can be added on the track'); ok(t.remove(i) && t.n === n0 && t.valid, 'and removed');
  const small = new Track(PRESETS.hill.pts.slice(0, 3)); ok(!small.remove(1), 'a track keeps at least three points');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; let fine = true;
  for (let j = 0; j < 400; j++) { const k = Math.floor(rnd() * t.n), r = rnd(); if (r < 0.7) t.move(k, { x: t.pts[k].x + (rnd() - 0.5) * 6, y: t.pts[k].y + (rnd() - 0.5) * 6 }); else if (r < 0.85) t.insert(rnd() * t.T); else t.remove(k); if (!t.valid) { fine = false; break; } }
  ok(fine, '400 random edits: the track stays valid'); const s = new Sim(); s.setPoints(t.pts); s.play(); let bad = false; for (let j = 0; j < 600 && s.playing; j++) { s.tick(1 / 60); const n = s.ride.now(); if (!isFinite(n.p.x) || !isFinite(n.p.y) || n.p.y < -1e-9) bad = true; } ok(!bad, 'a randomly edited track runs without trouble'); }

// every ready-made start sits on track the right way up: nothing leaves the track as it sets off
for (const k of Object.keys(PRESETS)) { const s = new Sim(); s.choose(k); const q = s.track.geo(s.track.uAt(s.s0)); ok(q.N.y > 0.05, k + ': the start is not on an overhang'); s.play(); let air = false; for (let i = 0; i < 30; i++) { s.tick(1 / 60); if (s.ride.st.mode !== 'track') air = true; } ok(!air, k + ': it sets off along the track'); }

// ---- the perfect-circle loop: exact geometry, exact thresholds ----
{ const s = new Sim(); s.choose('loop'); ok(s.loopMode === 'circle' && s.track instanceof CircleLoop, 'loop: a perfect circle by default'); const tr = s.track, L0 = tr.loop, r = L0.r;
  let worst = 0; for (let u = tr.uLoop0 + 1e-6; u < tr.uLoop1; u += 0.05) { const q = tr.geo(u); worst = Math.max(worst, Math.abs(q.k - 1 / r), Math.abs(Math.hypot(q.p.x - 19, q.p.y - (L0.bottom + r)) - r)); } ok(worst < 1e-9, 'loop: the curvature is exactly 1/r all the way round');
  let jump = 0; for (const u of [tr.pieces[1].u0, tr.pieces[2].u0, tr.uLoop0, tr.uLoop1]) { const a = tr.geo(u - 1e-7), b = tr.geo(u + 1e-7); jump = Math.max(jump, Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) * 1e6, Math.hypot(a.T.x - b.T.x, a.T.y - b.T.y) * 1e3); } ok(jump < 1, 'loop: the pieces meet with no gap or kink');
  near(tr.hmin.h, L0.bottom + 2.5 * r, 1e-12, 'loop: the lowest start is exactly 2.5 r above the bottom');
  const tryStart = (h, rad) => { const t = new Sim(); t.choose('loop'); if (rad) t.set('r', rad); t.setHeight(h); let left = null; const E0 = t.E0; let drift = 0; t.play();
    for (let i = 0; i < 60 * 6 && t.playing && !left; i++) { t.tick(1 / 60); drift = Math.max(drift, Math.abs(t.energy().E - E0)); if (t.ride.st.mode === 'air' && t.ride.st.left) left = t.ride.st.left; } return { t, left, drift, E0 }; };
  for (const rad of [4, 2.7, 5.3]) { const hm = 0.6 + 2.5 * rad, up = tryStart(hm + 0.02, rad), dn = tryStart(hm - 0.02, rad);
    ok(!up.left && up.t.ride.seen.top, 'circle r = ' + rad + ': 2 cm above 2.5 r, the ball goes round'); ok(!!dn.left, 'circle r = ' + rad + ': 2 cm below, it leaves');
    if (dn.left) { const q = dn.t.track.geo(dn.left.u); ok(q.N.y < -0.9, 'circle r = ' + rad + ': it leaves near the top'); near(dn.left.n, 0, 1e-3 * dn.t.vals.m * G, 'circle r = ' + rad + ': n = 0 where it leaves'); }
    ok(up.drift < 1e-5 * up.E0, 'circle r = ' + rad + ': energy conserved round the loop (' + up.drift.toExponential(1) + ' J)'); }
  // n at the bottom and top, as the ride gives them, against m(v²/r ± g) with v from energy
  for (const [h, v0] of [[11.3, 0], [13.7, 2.5]]) { const t = new Sim(); t.choose('loop'); t.set('v0', v0); t.setHeight(h); t.play(); for (let i = 0; i < 60 * 6 && t.playing && !(t.ride.seen.top && t.ride.seen.bottom); i++) t.tick(1 / 60);
    const m = t.vals.m, vb2 = v0 * v0 + 2 * G * (h - 0.6), vt2 = v0 * v0 + 2 * G * (h - 0.6 - 2 * r);
    near(t.ride.seen.bottom.n, m * (vb2 / r + G), 1e-3 * m * G, 'start ' + h + ' m: n at the bottom = m(v²/r + g)'); near(t.ride.seen.top.n, m * (vt2 / r - G), 1e-3 * m * G, 'start ' + h + ' m: n at the top = m(v²/r − g)');
    const rows = new Panel({ sim: t, state: {}, run: (f) => f }).results().resultRows; ok(rows.filter((x) => /the ride/.test(x.mark || '') && /✓/.test(x.mark)).length === 2, 'start ' + h + ' m: the panel ticks both against the ride'); }
  // the normal force steps where the straight run meets the circle
  { const t = new Sim(); t.choose('loop'); t.play(); let step = 0, prev = null; for (let i = 0; i < 60 * 3; i++) { t.tick(1 / 60); const n = t.ride.now().n; if (prev !== null) step = Math.max(step, n - prev); prev = n; } ok(step > 2 * t.vals.m * G, 'loop: n jumps up where the ball enters the circle (by ' + Math.round(step) + ' N)'); }
  // modes, radius, editing off, the share link
  const e = new Sim(); e.choose('loop'); ok(!e.movePoint(0, { x: 3, y: 3 }) && e.insertAt(30) === -1 && !e.custom, 'circle mode: the loop cannot be reshaped');
  e.set('r', 3.3); near(e.track.loop.r, 3.3, 1e-12, 'the radius slider sets r'); near(e.h0, 11.3, 1e-6, 'changing r keeps the start height');
  e.setLoopMode('spline'); ok(e.loopMode === 'spline' && e.track.pts.length > 3 && !(e.track instanceof CircleLoop), 'the editable spline loop is still there'); ok(e.movePoint(5, { x: e.track.pts[5].x, y: e.track.pts[5].y + 0.5 }), 'and can be reshaped');
  const a = new Sim(); a.choose('loop'); a.set('r', 4.7); a.setHeight(13.9); const url = Link.url(a), b = new Sim(); Link.apply(b, url.slice(url.indexOf('?')));
  ok(b.loopMode === 'circle' && b.vals.r === 4.7 && Math.abs(b.h0 - 13.9) < 0.02, 'share link: circle mode, radius and start come back');
  const c2 = new Sim(); c2.choose('loop'); c2.setLoopMode('spline'); const u2 = Link.url(c2), d2 = new Sim(); Link.apply(d2, u2.slice(u2.indexOf('?'))); ok(d2.loopMode === 'spline', 'share link: spline mode comes back'); }

// ---- the history: the run's events, stepped through ----
{ const hump = () => { const s = new Sim(); s.choose('valley'); const pts = PRESETS.valley.pts.map((p) => ({ ...p })); pts[3] = { x: 16, y: 4 }; s.setPoints(pts); s.setHeight(8.3); return s; };
  const s = hump(); ok(s.events.length === 1 && s.events[0].kind === 'start' && s.evIndex === 0, 'history: a fresh run has its start as event 1, and the clock is at it');
  const kinds = []; for (let i = 0; i < 6; i++) { ok(s.nextEvent(), 'history: next event ' + (i + 1) + ' found'); kinds.push(s.events[s.evIndex].kind); ok(s.evIndex === i + 1, 'history: the clock is at event ' + (i + 2)); }
  ok(kinds.join(' ') === 'fast leave apex land turn fast', 'history: over a hump too sharp for it, the ice cube goes fastest, leaves (n = 0), tops its flight, lands, turns back (got ' + kinds.join(' ') + ')');
  const E = s.events, E0 = (e) => e.r.K + e.r.y * s.vals.m * G + e.r.th;
  for (const e of E) near(E0(e), E0(E[0]), 0.02 * Math.max(1, E0(E[0]) / 100), 'history: K + U_g + E_th is the same at every event (' + e.kind + ')');
  const land = E.find((e) => e.kind === 'land'), before = E[E.indexOf(land) - 1];
  near(land.r.th - before.r.th, land.d.jolt, 0.5, 'history: what E_th gains at the landing is the jolt, ½ m v⊥²'); near(land.d.jolt, s.vals.m * land.d.vn * land.d.vn / 2, 1e-6, 'history: the jolt is ½ m v⊥²');
  ok(land.d.jolt > 1000, 'history: this landing is nearly head-on: most of K goes (' + land.d.jolt.toFixed(0) + ' J)');
  const leave = E.find((e) => e.kind === 'leave'); near(s.ride.forces(s.track.nearest(leave.r).u, 0).n >= -1e9 ? leave.d.v * leave.d.v * Math.abs(leave.d.k) : 0, G * Math.abs(leave.d.Ny), 0.05, 'history: at leaving, v²/r = g cos θ (n = 0)');
  const turn = E.find((e) => e.kind === 'turn'); near(turn.r.K, 0, 1e-3, 'history: K = 0 at the turning point');
  for (let i = 0; i < E.length; i++) { const D = s.describe(i); ok(D && D.title && D.why && D.why.length > 20 && D.tally, 'history: event ' + (i + 1) + ' (' + E[i].kind + ') is put in words'); }
  ok(/inelastic/.test(s.describe(E.indexOf(land)).why) && /E_th \+/.test(s.describe(E.indexOf(land)).tally), 'history: the landing says why energy went, and the tally shows E_th rising');
  // back, and forward again over the recording (no new run)
  const t5 = s.time, n = E.length; ok(s.prevEvent() && s.evIndex === n - 2, 'history: back one event'); ok(s.trail.length > 10, 'history: the trail is drawn back in after a jump');
  ok(s.nextEvent() && Math.abs(s.time - t5) < 1e-9 && s.events.length === n, 'history: forward again lands on the same moment, nothing re-run');
  s.seek(0); ok(s.evIndex === 0, 'history: seeking to 0 is the start'); s.play(); for (let i = 0; i < 30; i++) s.tick(1 / 60); ok(s.events.length < n, 'history: running on from earlier drops the events that came after');
  s.pause(); ok(s.evLast >= 0 && s.evIndex === -1, 'history: between events: none is current, the last one passed is known');
  // the hidden energies stay hidden in the words
  const h = hump(); h.nextEvent(); h.hide(true); const D = h.describe(1); ok(!/[0-9] J/.test(D.why) && D.tally === '', 'history: with energies hidden, no joules in the event card');
  // a plain valley: no ripples of fast/slow in the nearly level bottom; fast and turn alternate
  const v = new Sim(); v.choose('valley'); for (let i = 0; i < 6; i++) v.nextEvent(); const vk = v.events.map((e) => e.kind).join(' ');
  ok(vk === 'start fast turn fast turn fast turn', 'history: the valley alternates fastest and turning points (got ' + vk + ')');
  for (const e of v.events.filter((e) => e.kind === 'turn')) near(e.r.y, v.h0, 0.01, 'history: without friction every turning point is at the start height');
  // friction: turning points get lower, and the stop ends the history
  const f = new Sim(); f.choose('valley'); f.setFriction(true); for (let i = 0; i < 40 && f.nextEvent(); i++); const fk = f.events.map((e) => e.kind);
  ok(fk[fk.length - 1] === 'done' && !f.nextEvent(), 'history: friction stops it, the last event, and there is no next');
  const ft = f.events.filter((e) => e.kind === 'turn'); ok(ft.length >= 2 && ft.every((e, i) => !i || e.r.y < ft[i - 1].r.y), 'history: with friction each turning point is lower than the one before');
  // the ski jump: off the end, top of the flight, onto the ground
  const k = new Sim(); k.choose('ski'); for (let i = 0; i < 10 && k.nextEvent(); i++); const kk = k.events.map((e) => e.kind).join(' ');
  ok(/end apex ground/.test(kk), 'history: the ski jump goes off the end, tops its flight, hits the ground (got ' + kk + ')');
  const ap = k.events.find((e) => e.kind === 'apex'); near(ap.r.K, k.vals.m * ap.d.vx * ap.d.vx / 2, 0.5, 'history: at the top of the flight K = ½ m v_x², not zero');
  // a ball in the loop from too low: leaves near the top
  const b = new Sim(); b.choose('loop'); b.setRider('ball'); for (let i = 0; i < 4; i++) b.nextEvent(); ok(b.events.some((e) => e.kind === 'leave' && e.d.Ny < -0.5), 'history: a ball from 2.5 r leaves the loop near its top'); }

// ---- landings that keep their energy (unphysical, to compare) ----
{ const mk = (soft, rider) => { const s = new Sim(); s.choose('valley'); const pts = PRESETS.valley.pts.map((p) => ({ ...p })); pts[3] = { x: 16, y: 4 }; s.setPoints(pts); s.setHeight(8.3); if (rider) s.setRider(rider); s.setSoftLanding(soft); return s; };
  const a = mk(false), b = mk(true); ok(!a.softLanding && new Sim().softLanding === false, 'landings lose energy by default');
  for (const s of [a, b]) for (let i = 0; i < 12 && s.nextEvent(); i++);
  const la = a.events.find((e) => e.kind === 'land'), lb = b.events.find((e) => e.kind === 'land');
  ok(la && la.d.jolt > 1000 && la.r.th > 1000, 'real landing: the jolt goes to E_th'); ok(lb && lb.d.jolt === 0 && lb.r.th === 0 && b.ride.rec.every((r) => r.th === 0), 'keep-energy landing: nothing goes to E_th, ever');
  near(lb.d.after, lb.d.v, 1e-9, 'keep-energy landing: the whole speed is turned along the track');
  const tb = b.events.filter((e) => e.kind === 'turn'); ok(tb.length && tb.every((e) => Math.abs(e.r.y - 8.3) < 0.05), 'keep-energy landings: every turning point is back at the start height');
  ok(/not physical/.test(b.describe(b.events.indexOf(lb)).why) && /unphysical/.test(b.describe(b.events.indexOf(lb)).title), 'keep-energy landing: the card says it is unphysical');
  const c = mk(true, 'ball'); for (let i = 0; i < 12 && c.nextEvent(); i++); ok(c.ride.rec.every((r) => r.th === 0), 'keep-energy landing, rolling ball: nothing lost either');
  const P = new Panel({ sim: b, state: {}, run: (f) => f }), L = P.landing(); ok(/unphysical/.test(L.landNote) && /c23b3b/.test(L.landNoteStyle), 'keep-energy landings: a red warning');
  const u = Link.url(b), d = new Sim(); Link.apply(d, u.slice(u.indexOf('?'))); ok(d.softLanding && /landing=keep/.test(u), 'share link carries keep-energy landings'); ok(!/landing=/.test(Link.url(a)), 'share link: default landings not written'); }

done('physics');
