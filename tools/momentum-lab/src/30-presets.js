// =====================================================================
// The three worlds and their presets.
//   track   an air track, side on: carts move along x only. Spring bumpers (bouncy) or Velcro (sticky).
//   table   an air table, from above: pucks slide anywhere on it, and can hit at a glance.
//   space   no table, no air: bodies pull on each other by gravity. Lengths in km, speeds in km/s.
// A setup is plain data (the World is built from it): its bodies with their starting r⃗₀ and v⃗₀ (SI),
// how bouncy collisions are (e), any latched springs (charges), the clock (step h, warp: simulated
// seconds per real second), and the view it opens on.
// =====================================================================
const COLS = ['#4f86c6', '#d0663f', '#4f9d6b', '#a46fc4', '#c9a43a', '#3fa6a6'];
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

const MODES = {
  track: { label: 'Track', icon: '▭', what: 'Carts on an air track (one dimension)', L: 1, lu: 'm', vu: 'm/s', oneD: true, h: 1 / 6000, recDt: 1 / 600, warp: 1, tMax: 60, bounds: { x0: -1.5, x1: 1.5, y0: -1, y1: 1 }, view: { x: 0, y: 0.3, w: 3.3 }, size: 0.09, snap: 0.01 },
  table: { label: 'Table', icon: '◎', what: 'Pucks on an air table (two dimensions)', L: 1, lu: 'm', vu: 'm/s', oneD: false, h: 1 / 6000, recDt: 1 / 600, warp: 1, tMax: 60, bounds: { x0: -1.2, x1: 1.2, y0: -0.7, y1: 0.7 }, view: { x: 0, y: 0, w: 2.7 }, size: 0.05, snap: 0.01 },
  space: { label: 'Space', icon: '✦', what: 'Bodies in space, pulling on each other by gravity', L: 1000, lu: 'km', vu: 'km/s', oneD: false, size: 6.371e6, snap: 0 },
};

// two bodies going round their centre of mass: masses M and m, d apart, centre of mass at the origin; f = 1 for circles
// (less for an ellipse, starting at the far end). Returns the two bodies' x, vy.
function orbitPair(M, m, d, f) { const vr = Math.sqrt(GRAV * (M + m) / d) * (f == null ? 1 : f), k = m / (M + m);
  return { x1: -d * k, x2: d * (1 - k), v1: -vr * k, v2: vr * (1 - k), T: 2 * Math.PI * d / Math.sqrt(GRAV * (M + m) / d) }; }
const body = (i, m, R, x, y, vx, vy, more) => ({ id: NAMES[i], name: NAMES[i], kind: 'body', col: COLS[i], m, R, x, y, vx, vy, ...(more || {}) });

const PRESETS = {
  track: [
    { key: 'equal', label: 'Equal masses, bouncy', note: 'A moving cart hits an equal one at rest with spring bumpers. A stops dead and B carries on with A’s speed: all the momentum (and all the kinetic energy) is handed over.', e: 1,
      bodies: [body(0, 0.5, 0.09, -0.9, 0, 0.8, 0), body(1, 0.5, 0.09, 0.1, 0, 0, 0)] },
    { key: 'heavyLight', label: 'Heavy hits light', note: 'A heavy cart hits a light one at rest. The heavy one hardly slows; the light one shoots off at nearly twice the heavy one’s speed.', e: 1,
      bodies: [body(0, 1.5, 0.09, -0.9, 0, 0.6, 0), body(1, 0.25, 0.09, 0, 0, 0, 0)] },
    { key: 'lightHeavy', label: 'Light hits heavy', note: 'A light cart hits a heavy one at rest and bounces back. Its momentum changes sign, so the heavy cart gets more momentum than A brought in.', e: 1,
      bodies: [body(0, 0.25, 0.09, -0.9, 0, 0.9, 0), body(1, 1.5, 0.09, 0.1, 0, 0, 0)] },
    { key: 'sticky', label: 'Velcro: they stick', note: 'Two carts coming toward each other with Velcro on their ends stick together. Momentum is the same after as before; much of the kinetic energy is gone, into heat and sound.', e: 0,
      bodies: [body(0, 0.75, 0.09, -0.9, 0, 0.7, 0), body(1, 0.5, 0.09, 0.6, 0, -0.35, 0)] },
    { key: 'partly', label: 'Partly bouncy', note: 'Soft bumpers (e = 0.6): the carts bounce apart, but slower than they came together. Momentum is kept; some kinetic energy is not.', e: 0.6,
      bodies: [body(0, 0.6, 0.09, -0.9, 0, 0.9, 0), body(1, 0.4, 0.09, 0, 0, 0, 0)] },
    { key: 'chase', label: 'Catching up', note: 'A fast cart catches up with a slower one going the same way. Watch the force graph: the two forces are mirror images, so the two impulses cancel.', e: 1,
      bodies: [body(0, 0.4, 0.09, -1.1, 0, 0.9, 0), body(1, 0.6, 0.09, -0.3, 0, 0.3, 0)] },
    { key: 'explosion', label: 'Explosion: spring between', note: 'Two carts at rest with a compressed spring latched between them. Let go, it pushes them apart: the total momentum stays zero, so the lighter cart goes faster.', e: 1,
      bodies: [body(0, 0.8, 0.09, -0.1, 0, 0, 0), body(1, 0.3, 0.09, 0.1, 0, 0, 0)], charges: [{ a: 'A', b: 'B', E: 0.12, at: 0.4 }] },
  ],
  table: [
    { key: 'pool', label: 'Glancing blow, equal masses', note: 'One puck hits an equal one at rest, off centre. In a bouncy collision of equal masses they always leave at 90° to each other. Check the angles in the table.', e: 1,
      bodies: [body(0, 0.17, 0.05, -0.8, 0, 2.4, 0), body(1, 0.17, 0.05, 0, 0.06, 0, 0)] },
    { key: 'glancing', label: 'Glancing blow, unequal', note: 'A heavier puck strikes a lighter one off centre, a little less than bouncy (e = 0.7). Add up p_x and p_y before and after: each is kept on its own.', e: 0.7,
      bodies: [body(0, 0.3, 0.06, -0.8, 0, 1.8, 0), body(1, 0.18, 0.045, 0, -0.05, 0, 0)] },
    { key: 'crossing', label: 'Crash at a crossing', note: 'Two pucks meet at right angles and stick (like two cars at an intersection). After, they move together in a direction set by the two momenta: p_x from one, p_y from the other.', e: 0,
      bodies: [body(0, 1.4, 0.07, -0.45, 0, 1.5, 0), body(1, 0.9, 0.06, 0, -0.63, 0, 2.1)] },
    { key: 'dart', label: 'Dart into a puck', note: 'A light, fast dart sticks in a heavy puck at rest (like a ballistic pendulum). Momentum is kept; almost all of the kinetic energy is not.', e: 0,
      bodies: [body(0, 0.024, 0.018, -0.9, 0, 7.2, 0), body(1, 0.5, 0.07, 0, 0, 0, 0)] },
    { key: 'split', label: 'Moving explosion', note: 'Two pucks latched to a spring, sliding together. When the spring lets go they fly apart, but their centre of mass carries on exactly as before.', e: 1,
      ...(() => { const m1 = 0.4, m2 = 0.25, n = V.polar(70), d = 0.116, c = { x: -0.55, y: -0.25 }, a = V.at(c, n, -d * m2 / (m1 + m2)), b = V.at(c, n, d * m1 / (m1 + m2));
        return { bodies: [body(0, m1, 0.06, a.x, a.y, 0.45, 0.2), body(1, m2, 0.05, b.x, b.y, 0.45, 0.2)], charges: [{ a: 'A', b: 'B', E: 0.15, at: 0.5 }] }; })() },
  ],
  space: [
    (() => { const M = 5.972e24, r = 7.0e6, v = Math.sqrt(GRAV * M / r), T = 2 * Math.PI * r / v;
      return { key: 'satellite', label: 'Satellite and Earth', note: 'Gravity pulls the satellite toward Earth and Earth toward the satellite, equally hard. Earth’s momentum is always as big as the satellite’s (and opposite), but Earth is so heavy that its velocity is about 10⁻¹⁸ m/s. Change the satellite’s starting velocity to see other orbits.', e: 0, gravity: true,
        h: T / 3000, recDt: T / 600, warp: T / 12, view: { x: 0, y: 0, w: 2.0e7, fit: true },
        bodies: [body(0, M, 6.371e6, 0, 0, -1200 * v / M, 0, { name: 'Earth', kind: 'planet', col: '#4f86c6' }), body(1, 1200, 0, 0, -r, v, 0, { name: 'Satellite', kind: 'craft', col: '#d9dde2' })] }; })(),
    (() => { const M = 5.972e24, m = 7.342e22, o = orbitPair(M, m, 3.844e8);
      return { key: 'moon', label: 'Earth and Moon', note: 'Earth and the Moon both go round their centre of mass (the barycentre), 4670 km from Earth’s centre: inside Earth. Their momenta are always equal and opposite. Zoom in on Earth to see it wobble.', e: 0, gravity: true,
        h: o.T / 4000, recDt: o.T / 800, warp: o.T / 20, view: { x: 0, y: 0, w: 9.8e8, fit: true },
        bodies: [body(0, M, 6.371e6, o.x1, 0, 0, o.v1, { name: 'Earth', kind: 'planet', col: '#4f86c6' }), body(1, m, 1.737e6, o.x2, 0, 0, o.v2, { name: 'Moon', kind: 'planet', col: '#b9bec4' })] }; })(),
    (() => { const M = 1.303e22, m = 1.586e21, o = orbitPair(M, m, 1.9596e7);
      return { key: 'pluto', label: 'Pluto and Charon', note: 'Charon is an eighth of Pluto’s mass, so their centre of mass is outside Pluto: Pluto itself swings round a point in empty space.', e: 0, gravity: true,
        h: o.T / 4000, recDt: o.T / 800, warp: o.T / 16, view: { x: 0, y: 0, w: 5.0e7, fit: true },
        bodies: [body(0, M, 1.188e6, o.x1, 0, 0, o.v1, { name: 'Pluto', kind: 'planet', col: '#c9a47a' }), body(1, m, 6.06e5, o.x2, 0, 0, o.v2, { name: 'Charon', kind: 'planet', col: '#9aa3ad' })] }; })(),
    (() => { const M = 1.99e30, o = orbitPair(M, M, 1.2e11);
      return { key: 'binary', label: 'Binary stars, equal', note: 'Two stars of the same mass circle their centre of mass, halfway between them, always on opposite sides of it.', e: 0, gravity: true,
        h: o.T / 4000, recDt: o.T / 800, warp: o.T / 16, view: { x: 0, y: 0, w: 1.6e11, fit: true },
        bodies: [body(0, M, 6.96e8, o.x1, 0, 0, o.v1, { name: 'Star A', kind: 'star', col: '#ffd27a' }), body(1, M, 6.96e8, o.x2, 0, 0, o.v2, { name: 'Star B', kind: 'star', col: '#ffb070' })] }; })(),
    (() => { const M = 2.6e30, m = 1.1e30, o = orbitPair(M, m, 1.4e11, 0.75);
      return { key: 'binary2', label: 'Binary stars, unequal', note: 'A heavy star and a lighter one on ellipses. Both ellipses have the centre of mass at a focus; the lighter star’s is bigger, in proportion to the masses.', e: 0, gravity: true,
        h: o.T / 5000, recDt: o.T / 900, warp: o.T / 10, view: { x: -2.5e10, y: 0, w: 2.4e11, fit: true },
        bodies: [body(0, M, 8.5e8, o.x1, 0, 0, o.v1, { name: 'Star A', kind: 'star', col: '#bcd6ff' }), body(1, m, 6.2e8, o.x2, 0, 0, o.v2, { name: 'Star B', kind: 'star', col: '#ffb070' })] }; })(),
    { key: 'rocket', label: 'Rocket in deep space', note: 'The rocket throws its exhaust backward; the exhaust pushes the rocket forward. The rocket and its exhaust together keep the momentum they started with (zero), and their centre of mass stays put.', e: 0, gravity: false,
      h: 1 / 600, recDt: 1 / 60, warp: 1, view: { x: 1.2e4, y: 0, w: 1.5e5 }, bounds: { x0: -6.4e4, x1: 8.6e4, y0: -4e4, y1: 4e4 }, puffEvery: 1 / 6,
      bodies: [body(0, 1250, 0, 0, 0, 0, 0, { name: 'Rocket', kind: 'rocket', col: '#e0e4e8', rocket: { fuel: 800, rate: 40, u: 2600, ang: 0, start: 1 } })] },
  ],
};
const PRESET = (mode, key) => (PRESETS[mode] || []).find((p) => p.key === key) || null;

// a fresh setup (plain data the World is built from) for one preset
function setupOf(mode, key) { const M = MODES[mode], p = PRESET(mode, key) || PRESETS[mode][0];
  return JSON.parse(JSON.stringify({ mode, preset: p.key, e: p.e == null ? 1 : p.e, gravity: mode === 'space' && p.gravity !== false, h: p.h || M.h, recDt: p.recDt || M.recDt, warp: p.warp || M.warp, tMax: p.tMax || M.tMax || 0,
    bounds: p.bounds || M.bounds || null, view: p.view || M.view, puffEvery: p.puffEvery || 0, bodies: p.bodies, charges: p.charges || [] })); }
