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
  ok(worst < 2e-4 * E0, k + ': with friction, K + U_g + E_th stays the same (worst ' + worst.toExponential(1) + ' J)'); ok(s.ride.now().th > 0, k + ': friction made thermal energy'); }
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
  const tryStart = (h) => { const t = new Sim(); t.choose('loop'); t.setHeight(h); let left = null; t.play(); for (let i = 0; i < 60 * 5 && t.playing && !left; i++) { t.tick(1 / 60); if (t.ride.st.mode === 'air' && t.ride.st.left) left = t.ride.st.left; } return { t, left }; };
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
for (const k of Object.keys(PRESETS)) for (const rider of ['ball', 'car']) for (const v0 of [0, 6, 15]) { const s = new Sim(); s.choose(k); s.setRider(rider); s.set('v0', v0); let low = Infinity; s.play();
  for (let i = 0; i < 60 * 20 && s.playing; i++) { s.tick(1 / 60); low = Math.min(low, s.ride.now().p.y); } ok(low >= -1e-9, k + '/' + rider + ' v0 = ' + v0 + ': never below the ground (' + low.toFixed(3) + ')'); }

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

done('physics');
