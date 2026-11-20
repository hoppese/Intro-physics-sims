// The picture and the panel: every world and preset draws without error at two sizes, before, during and after a run,
// with every toggle and the values hidden; no label covers another; the graphs draw in every tab; the editing calls
// (drag, v⃗₀ handle, typed values, add, delete) do what they say; the share link round-trips; it loads paused.
const L = require('./load.js'), { V, Fmt, Lab, Renderer, Graphs, Panel, Link, PRESETS, MODES, ok, near, done } = L;
let font = 12; const grad = { addColorStop() {} };
const g = new Proxy({}, { get: (t, k) => k === 'measureText' ? (s) => ({ width: String(s).length * font * 0.6 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (typeof k === 'string' && /^[a-z]/.test(k) && !(k in t) ? () => {} : t[k]),
  set: (t, k, v) => { if (k === 'font') { const m = String(v).match(/(\d+(\.\d+)?)px/); if (m) font = parseFloat(m[1]); } t[k] = v; return true; } });
const app = (lab) => ({ lab, state: {}, big: false, detail: false, toggleDetail() {}, graphs: new Graphs(), run: (fn) => fn, refresh() {}, setState() {}, setCanvas() {}, setGraph() {}, zoom() {}, copyShare() {}, submitBug() {} });
const r = new Renderer(), gr = new Graphs();
for (const mode of Object.keys(PRESETS)) for (const p of PRESETS[mode]) { const lab = new Lab(); lab.load(mode, p.key); const panel = new Panel(app(lab)), tag = mode + '/' + p.key; let fine = true, worst = '';
  const look = (what) => { for (const [W, H] of [[600, 400], [360, 300]]) { lab.view.resize(W, H); try { r.draw(g, lab); panel.all(); for (const k of ['momentum', 'force', 'energy']) { lab.graph = k; gr.draw(g, lab, W, 200); } lab.graph = 'momentum'; } catch (e) { fine = false; console.log(tag, what, e.stack.split('\n').slice(0, 3).join(' | ')); return; }
      const B = r.placed; for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j]; if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5 && !worst) worst = what + ' ' + W + 'x' + H; } } };
  look('start'); lab.select(lab.setup.bodies[0].id); look('selected'); for (const k of Object.keys(lab.show)) { lab.toggleShow(k); look('toggle ' + k); lab.toggleShow(k); }
  lab.hide(true); lab.play(); for (let i = 0; i < 30; i++) lab.tick(1 / 60); look('hidden'); lab.hide(false);
  for (let i = 0; i < 1200 && lab.playing; i++) { lab.tick(1 / 60); if (i % 25 === 0) look('running ' + i); } look('end'); lab.close = true; look('close-up'); lab.close = false;
  ok(fine, tag + ': draws (canvas, panel, graphs) in every state'); ok(!worst, tag + ': no label covers another' + (worst ? ' (' + worst + ')' : ''));
  ok(r.hits.length === lab.world.main.length, tag + ': every body can be clicked'); }

// loads paused; Run, then Reset, starts again
{ const s = new Lab(); ok(!s.playing && s.time === 0 && s.mode === 'track', 'loads paused at t = 0, on the track'); const x0 = s.world.main[0].p.x; s.play(); for (let i = 0; i < 30; i++) s.tick(1 / 60); ok(s.world.main[0].p.x > x0 + 0.1, 'Run moves it');
  s.reset(); ok(!s.playing && s.time === 0 && s.world.main[0].p.x === x0, 'Reset puts it back, paused'); }
// editing: drag a body (snapped, kept clear of the others), drag its arrow tip, type values, add and delete
{ const s = new Lab(); s.load('track', 'equal'); s.place('A', { x: 0.123, y: 0.5 }); const A = s.body('A'); ok(Math.abs(A.x - s.body('B').x) >= 0.18 - 1e-9 && Math.abs(A.x * 100 - Math.round(A.x * 100)) < 0.2, 'track: a cart dropped on another is set down clear of it (x = ' + A.x + ')'); ok(A.y === 0, 'track: carts stay on the track');
  s.place('A', { x: -0.6, y: 0 }); near(s.body('A').x, -0.6, 1e-9, 'track: drag to a clear spot');
  s.setV0('A', { x: 0.734, y: 2 }); near(s.body('A').vx, 0.73, 1e-9, 'track: the arrow tip sets v₀ (to 0.01 m/s)'); ok(s.body('A').vy === 0, 'track: no v_y');
  s.setField('A', 'm', '0.65'); near(s.body('A').m, 0.65, 1e-12, 'typed mass'); s.setVec('B', 'v', 'x', '-0.2'); near(s.body('B').vx, -0.2, 1e-12, 'typed v₀x'); ok(s.world.t === 0 && s.setup.edited, 'an edit starts again, marked as changed');
  const id = s.add(); ok(id === 'C' && s.setup.bodies.length === 3 && s.world.main.length === 3, 'add a third cart'); const C = s.body('C'); ok(s.setup.bodies.every((o) => o === C || Math.abs(o.x - C.x) >= o.R + C.R), 'the new cart is clear of the others');
  s.remove('C'); ok(s.setup.bodies.length === 2, 'delete it'); }
{ const s = new Lab(); s.load('table', 'pool'); s.place('A', { x: 0.01, y: 0.06 }); const A = s.body('A'), B = s.body('B'); ok(V.dist(A, B) >= A.R + B.R - 1e-9, 'table: a puck dropped on another is pushed clear');
  s.setVec('A', 'r', 'y', '0.3'); near(s.body('A').y, 0.3, 1e-12, 'table: typed r₀y'); }
{ const s = new Lab(); s.load('space', 'moon'); s.setVec('B', 'v', 'y', '0.9'); near(s.body('B').vy, 900, 1e-9, 'space: v₀ typed in km/s, kept in m/s'); s.setField('B', 'm', '1e23'); near(s.body('B').m, 1e23, 1, 'space: mass in e-notation'); }
{ const s = new Lab(); s.load('space', 'rocket'); s.setField('A', 'fuel', '600'); near(s.body('A').m, 1050, 1e-9, 'rocket: less fuel, less mass'); s.setField('A', 'u', '3'); near(s.body('A').rocket.u, 3000, 1e-9, 'rocket: exhaust speed in km/s'); }
{ const s = new Lab(); s.load('track', 'explosion'); s.place('A', { x: -0.5, y: 0 }); near(s.body('B').x - s.body('A').x, 0.2, 1e-9, 'a latched pair moves together'); s.setCharge('E', '0.3'); near(s.setup.charges[0].E, 0.3, 1e-12, 'spring energy typed'); }
// Numbers off: every arrow keeps its symbol but loses its number; on again, the numbers are back; the link carries it
{ const vals = (lab) => { lab.view.resize(600, 400); r.draw(g, lab); return r.labels.filter((l) => l.runs.some((x) => x.val || / = /.test(x.t))).length; };
  for (const [mode, key] of [['track', 'equal'], ['table', 'glancing'], ['space', 'moon'], ['space', 'rocket']]) { const lab = new Lab(); lab.load(mode, key); lab.show.v = true; lab.play(); for (let i = 0; i < 90; i++) lab.tick(1 / 60);
    const on = vals(lab), syms = r.labels.length; lab.toggleShow('nums'); const off = vals(lab); ok(on > 0 && off === 0 && r.labels.length === syms, mode + '/' + key + ': Numbers off keeps every arrow label, without its number');
    lab.toggleShow('nums'); ok(vals(lab) === on, mode + '/' + key + ': and on again brings them back'); }
  const a = new Lab(); a.load('table', 'pool'); a.toggleShow('nums'); const u = Link.url(a), b = new Lab(); Link.apply(b, u.slice(u.indexOf('?'))); ok(u.includes('values=0') && b.show.nums === false, 'share link: Numbers off comes back off');
  const c = new Lab(); c.load('table', 'pool'); ok(!Link.url(c).includes('values') && c.show.nums, 'Numbers are on by default, and not in the link'); }
// the share link: everything comes back; values are clamped; a cache-buster ?v=3 changes nothing
{ const a = new Lab(); a.load('table', 'glancing'); a.setE(0.55); a.setVec('A', 'v', 'y', '0.25'); a.hide(true); const url = Link.url(a, true), b = new Lab(); Link.apply(b, url.slice(url.indexOf('?')));
  ok(b.mode === 'table' && b.setup.preset === 'glancing' && b.setup.e === 0.55 && Math.abs(b.body('A').vy - 0.25) < 1e-9 && b.hidden, 'share link: the setup comes back as it was');
  ok(JSON.stringify(b.setup.bodies.map((x) => [x.m, x.x, x.y, x.vx, x.vy, x.R])) === JSON.stringify(a.setup.bodies.map((x) => [x.m, x.x, x.y, x.vx, x.vy, x.R])), 'share link: every body exactly');
  const c = new Lab(); Link.apply(c, '?mode=track&preset=sticky'); ok(c.mode === 'track' && c.setup.preset === 'sticky' && !c.setup.edited, 'share link: a preset by name');
  const d = new Lab(); Link.apply(d, '?v=3&mode=space&preset=pluto'); ok(d.setup.preset === 'pluto' && !d.setup.edited, 'share link: ?v=3 is not a setting');
  const e = new Lab(); Link.apply(e, '?mode=nonsense'); ok(e.mode === 'track' && e.setup.preset === 'equal', 'share link: nonsense leaves the default');
  const f = new Lab(); Link.apply(f, '?mode=track&preset=equal&restitution=7&bodies=A,0.5,-0.9,3,0.8,9,0.09;B,0.5,0.1,0,0,0,0.09'); ok(f.setup.e === 1 && f.body('A').y === 0 && f.body('A').vy === 0, 'share link: values clamped, carts kept on the track'); }
// the panel's table: ✓ momentum kept after a run; values hidden after the start when asked
{ const s = new Lab(); s.load('table', 'crossing'); s.play(); for (let i = 0; i < 600 && s.playing; i++) s.tick(1 / 60); const t = new Panel(app(s)).table(); ok(t.briefRows.some((r) => r.name === 'Total' && / ✓$/.test(r.p)), 'table: total momentum before → now, ✓ kept');
  s.hide(true); const h = new Panel(app(s)).table(); ok(h.tableRows.filter((x) => x.isPair && x.label === 'now').every((x) => x.val === Fmt.HIDE) && h.tableRows.some((x) => x.isPair), 'hidden: every “now” value is hidden'); }
// an arrow-tip handle maps back to the velocity it shows (arrows start at the body's edge on the table)
{ const s = new Lab(); s.load('table', 'glancing'); s.view.resize(600, 400); r.draw(g, s); const h = r.handles.find((q) => q.id === 'A'), dx = h.x - h.ax, dy = h.y - h.ay, l = Math.hypot(dx, dy), m = (l - h.gap) / h.k;
  near(dx / l * m, 1.8, 1e-9, 'handle: its tip reads back as v₀x'); near(-dy / l * m, 0, 1e-9, 'handle: and v₀y'); ok(h.gap > 0, 'handle: the arrow starts at the puck’s edge'); }
// the panel stays short: a bounded number of rows whatever the world (so it fits beside the canvas)
for (const mode of Object.keys(PRESETS)) for (const p of PRESETS[mode]) { const lab = new Lab(); lab.load(mode, p.key); lab.select(lab.setup.bodies[0].id); const v = new Panel(app(lab)).all();
  const n = v.briefRows.length + v.tableChecks.length + v.selFields.length + v.vecFields.length + v.barGroups.reduce((a, g) => a + g.rows.length, 0) / (v.barGroups.length || 1);
  ok(n <= 22, mode + '/' + p.key + ': the panel has at most 22 rows (' + n + ')'); ok(v.presetItems.length === PRESETS[mode].length && !v.presetsOpen, mode + '/' + p.key + ': presets in a closed menu'); }
done('scene');
