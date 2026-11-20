// The picture, the graphs and the panel: every track, rider, toggle and graph draws without error, at rest, running,
// in the air and stopped; the labels never cover each other; the share link round-trips; it loads paused.
const L = require('./load.js'), { Sim, Renderer, Graphs, Panel, Link, PRESETS, ok, near, done } = L;
let font = 12; const grad = { addColorStop() {} };
const g = new Proxy({}, { get: (t, k) => k === 'measureText' ? (s) => ({ width: String(s).length * font * 0.6 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]),
  set: (t, k, v) => { if (k === 'font') { const m = String(v).match(/(\d+(\.\d+)?)px/); if (m) font = parseFloat(m[1]); } t[k] = v; return true; } });
const app = (sim) => ({ sim, state: {}, big: false, run: (fn) => fn, refresh() {}, setState() {}, setCanvas() {}, setGraphCanvas() {}, copyShare() {}, submitBug() {} });
const r = new Renderer(), gr = new Graphs();
for (const key of Object.keys(PRESETS)) for (const rider of ['ball', 'car']) for (const fr of [false, true]) {
  const sim = new Sim(); sim.choose(key); sim.setRider(rider); sim.setFriction(fr); const panel = new Panel(app(sim)), tag = key + '/' + rider + (fr ? ' friction' : ''); let fine = true, worst = '';
  const look = (what) => { for (const [W, H] of [[600, 440], [360, 264]]) { try { r.draw(g, sim, W, H); for (const k of ['time', 'x', 'normal']) { sim.graph = k; gr.draw(g, sim, W, 200); } sim.graph = 'time'; panel.all(); } catch (e) { fine = false; console.log(tag, what, e.stack.split('\n').slice(0, 3).join(' | ')); return; }
      const B = r.boxes.slice(-r.labels.length); for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j]; if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5 && !worst) worst = what + ' ' + W + 'x' + H; } } };
  look('at rest'); for (const k of ['height', 'trail', 'nums']) { sim.toggleShow(k); look(k); } sim.hide(true); look('hidden'); sim.hide(false);
  sim.play(); for (let i = 0; i < 60 * 14 && sim.playing; i++) { sim.tick(1 / 60); if (i % 50 === 0) look('running ' + sim.ride.st.mode); } look('end');
  if (sim.ride.rec.length > 4) { sim.seek(sim.ride.rec[Math.floor(sim.ride.rec.length / 2)].t); look('rewound'); }
  ok(fine, tag + ': draws in every state, toggle and graph'); ok(!worst, tag + ': no label covers another' + (worst ? ' (' + worst + ')' : '')); }

// the panel: the energy rows add up, and hiding takes every energy away
{ const sim = new Sim(); sim.choose('valley'); const p = new Panel(app(sim)); sim.play(); for (let i = 0; i < 40; i++) sim.tick(1 / 60);
  const e = p.energy(), val = (t) => (e.nowCells.find((c) => c.tex === t) || {}).val; ok(e.nowCells.length === 8 && /J$/.test(val('K')) && /J$/.test(val('U_g')) && /J$/.test(val('E')) && /m\/s$/.test(val('v')) && /conserved/.test(e.energyNote), 'panel: K, U_g, E beside h, v, n, m g, and the total is the same as at the start');
  ok(p.results().resultRows.some((x) => x.mark === '✓'), 'panel: the speed from the drop matches');
  sim.hide(true); const h = p.energy(); ok(h.nowCells.filter((c) => /J/.test(c.val)).length === 0 && !p.results().resultRows.some((x) => /sqrt/.test(x.tex)), 'panel: hidden, no energy or energy-based prediction is shown');
  ok(sim.snapshot().energy === null, 'snapshot: hidden energies are not reported'); }
{ const sim = new Sim(); sim.choose('loop'); const lines = new Panel(app(sim)).results().aheadLines.map((x) => x.t).join(' '); ok(/Lowest start/.test(lines) && /2\.5 r/.test(lines), 'panel: the loop shows its lowest start and the 2.5 r rule'); }

// Values off: the arrows, the height and the energy bars keep their symbols but lose their numbers; on again, back
{ const said = []; const rec = new Proxy(g, { get: (t, k) => k === 'fillText' ? (str) => said.push(String(str)) : t[k], set: (t, k, v) => { t[k] = v; return true; } });
  const sim = new Sim(); sim.choose('valley'); sim.toggleShow('height'); sim.play(); for (let i = 0; i < 40; i++) sim.tick(1 / 60);
  const draw = () => { said.length = 0; r.draw(rec, sim, 600, 440); const labels = r.labels.map((L) => L.runs.map((x) => x.t).join('')); for (const k of ['time', 'bars']) { sim.graph = k; gr.draw(rec, sim, 600, 200); } sim.graph = 'time'; return { labels, said: said.slice() }; };
  const num = /= ?-?[0-9]/, on = draw(); ok(on.labels.some((t) => num.test(t)) && on.labels.some((t) => /^h/.test(t) && num.test(t)), 'Values on: arrow and height labels carry numbers');
  const plain = (L) => L.filter((t) => /^-?[0-9.]+$/.test(t.trim())).length, joules = (L) => L.some((t) => /[0-9] J$/.test(t));
  ok(joules(on.said), 'Values on: the graph read-outs carry energies in J');
  sim.toggleShow('nums'); const off = draw(); ok(off.labels.length >= 3 && off.labels.every((t) => !/[0-9]/.test(t)), 'Values off: the arrows and the height keep their symbols, no numbers (' + off.labels.join(' | ') + ')');
  ok(!joules(off.said) && plain(on.said) - plain(off.said) >= 3, 'Values off: the energy bars and graph read-outs lose their numbers (the axis ticks stay)');
  ok(off.labels.some((t) => /^w/i.test(t)) && off.labels.some((t) => /^n/.test(t)) && off.labels.some((t) => /^v/.test(t)), 'Values off: W, n and v are still labelled');
  sim.toggleShow('nums'); const back = draw(); ok(back.labels.some((t) => num.test(t)), 'Values on again: the numbers come back');
  const a = new Sim(); a.choose('loop'); a.toggleShow('nums'); const u = Link.url(a), b = new Sim(); Link.apply(b, u.slice(u.indexOf('?'))); ok(u.includes('values=0') && b.show.nums === false, 'share link: Values off comes back off');
  const c = new Sim(); Link.apply(c, '?track=loop'); ok(c.show.nums === true, 'Values is on by default'); }

// the share link: the track (with edits), rider, settings, start and zero come back
{ const a = new Sim(); a.choose('twoHills'); a.movePoint(4, { x: 14, y: 7.9 }); a.setRider('ball'); a.set('m', 55); a.set('v0', 2.3); a.set('y0', 1.7); a.setFriction(true); a.set('mu', 0.07); a.setRelease(3.4); a.setGraph('x');
  const url = Link.url(a, true), b = new Sim(); Link.apply(b, url.slice(url.indexOf('?')));
  ok(b.key === 'twoHills' && b.custom && b.rider === 'ball' && b.vals.m === 55 && b.vals.v0 === 2.3 && b.vals.y0 === 1.7 && b.friction && b.vals.mu === 0.07 && b.hidden && b.graph === 'x', 'share link: the setup comes back');
  near(b.track.pts[4].y, 7.9, 1e-9, 'share link: the edited point comes back'); near(b.s0, 3.4, 0.02, 'share link: the start comes back');
  const c = new Sim(); Link.apply(c, '?track=loop&mass=999&speed=-4'); ok(c.key === 'loop' && c.vals.m === 200 && c.vals.v0 === 0, 'share link: values are clamped');
  const e = new Sim(); Link.apply(e, '?v=7&track=valley'); ok(e.vals.v0 === 0 && e.key === 'valley', 'share link: a cache-buster ?v=7 is not a speed');
  const d = new Sim(); Link.apply(d, '?track=nonsense&points=1:2,abc'); ok(d.key === 'hill' && !d.custom, 'share link: nonsense leaves the default'); }

// loads paused; Run moves it; Reset puts it back, paused
{ const s = new Sim(); ok(!s.playing && s.time === 0, 'loads paused at t = 0'); const p0 = s.ride.now().p; s.play(); for (let i = 0; i < 30; i++) s.tick(1 / 60); ok(Math.hypot(s.ride.now().p.x - p0.x, s.ride.now().p.y - p0.y) > 0.05, 'Run moves it');
  s.reset(); ok(!s.playing && Math.hypot(s.ride.now().p.x - p0.x, s.ride.now().p.y - p0.y) < 1e-12, 'Reset puts it back, paused'); }
// no coincidences in the defaults: no start height, mass or energy of exactly 1 (or a round match between K and U)
for (const k of Object.keys(PRESETS)) { const s = new Sim(); s.choose(k); ok(Math.abs(s.h0 - 1) > 0.05 && Math.abs(s.h0 - 9.8) > 0.05, k + ': the start height is not 1 or g'); }

done('scene');
