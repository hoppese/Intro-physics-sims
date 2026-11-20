// Every preset loads, solves, runs, and gives the numbers its note promises.
const { V, Angle, Scene, World, PRESETS, PRESET, ok, near, done } = require('./load.js');
const g = 9.8;
const make = (key) => { const p = PRESET(key); return new World(Scene.from({ els: p.els, opts: p.opts })); };
const mag = (w, id, kind) => w.forcesOn(id).filter((f) => f.kind === kind).reduce((s, f) => s + V.len(f.F), 0);

for (const p of PRESETS) { const s = Scene.from({ els: p.els, opts: p.opts });
  ok(s.els.length === p.els.length, p.key + ': every element loads (' + s.els.length + ' of ' + p.els.length + ')');
  const w = new World(s); ok(w.bodies.length > 0, p.key + ': has blocks');
  // set up exactly: nothing starts sunk into anything, no rope starts stretched
  ok(w.contacts().every((c) => c.gap > -1e-6), p.key + ': nothing overlaps at the start');
  for (const b of w.bodies) near(V.dist(b.p, b.el.pos), 0, 1e-6, p.key + ': ' + b.id + ' starts where it was put');
  w.advance(2); ok(w.bodies.every((b) => [b.p.x, b.p.y, b.v.x, b.v.y].every(isFinite)), p.key + ': runs 2 s');
  const back = Scene.decode(s.encode()); ok(back && back.snapshot() === s.snapshot(), p.key + ': survives a share link');
  ok(p.label && p.note && !/\b1(\.0+)? ?(m\/s|N|s)\b/.test(p.note), p.key + ': a note, with no quantity of exactly 1'); }

{ const w = make('incline'), th = 30, a = g * (Math.sin(Angle.rad(th)) - 0.3 * Math.cos(Angle.rad(th))); near(V.len(w.accel(3)), a, 1e-9, 'incline: slides at g(sin - mu_k cos)'); }
{ const w = make('push'); near(V.len(w.accel(2)), 0, 1e-9, 'push: the crate stays put'); near(mag(w, 2, 'static'), 10, 1e-9, 'push: static friction matches the push'); }
{ const w = make('atwood'); near(w.accel(3).y, -1.96, 1e-9, "atwood: 1.96 m/s^2"); near(w.tension(4), 2 * 2 * 3 * g / 5, 1e-9, 'atwood: T = 23.5 N'); }
{ const w = make('table'), a = (1.5 - 0.2 * 4) * g / 5.5; near(w.accel(2).x, a, 1e-6, 'table: a = (m2 - mu_k m1) g / (m1 + m2)'); }
{ const w = make('rampPulley'), th = Angle.rad(30), a = (2.5 - 3 * Math.sin(th) - 0.15 * 3 * Math.cos(th)) * g / 5.5; near(V.dot(w.accel(2), V.polar(30)), a, 1e-6, 'rampPulley: up the ramp at ' + a.toFixed(3)); }
{ const w = make('pair'); near(w.accel(3).x, 2, 1e-9, 'pair: 2 m/s^2'); const c = w.forcesOn(3).find((f) => f.kind === 'normal' && Math.abs(f.F.x) > 1e-6); near(c.F.x, 3, 1e-9, 'pair: 3 N contact force'); }
{ const w = make('stack'); near(w.accel(3).x, 3, 1e-9, 'stack: together at 3 m/s^2'); near(mag(w, 3, 'static'), 3, 1e-9, 'stack: static friction 3 N on the top block'); }
{ const w = make('wall'); near(V.len(w.accel(3)), 0, 1e-9, 'wall: held'); near(mag(w, 3, 'static'), 2 * g, 1e-9, 'wall: f_s = m g'); }
{ const w = make('spring'); near(w.accel(3).x, -50 * 0.4 / 2, 1e-9, 'spring: a = -k x / m at the start'); }
{ const w = make('hanging'); near(w.accel(3).y, -g, 1e-9, 'hanging: let go at the natural length, it starts in free fall'); }
{ const w = make('twoRopes'); near(V.len(w.accel(4)), 0, 1e-9, 'twoRopes: in equilibrium');
  const T5 = w.tension(5), T6 = w.tension(6), b = w.body(4), d5 = V.unit(V.sub({ x: -1.5, y: 3.4 }, b.p)), d6 = V.unit(V.sub({ x: 1.2, y: 3.4 }, b.p));
  near(T5 * d5.x + T6 * d6.x, 0, 1e-9, 'twoRopes: horizontal parts cancel'); near(T5 * d5.y + T6 * d6.y, 3 * g, 1e-9, 'twoRopes: vertical parts hold up m g'); ok(T5 > 0 && T6 > 0, 'twoRopes: both taut'); }
{ const w = make('projectile'); w.advance(1.1); const b = w.body(3); ok(b.p.x > -0.8 && b.p.y < 1.5, 'projectile: off the edge and falling'); near(b.v.x, 2.2, 1e-6, 'projectile: v_x unchanged'); }

done('presets');
