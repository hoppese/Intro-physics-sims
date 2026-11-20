// =====================================================================
// Presets -- ready-made benches: the classic problems of a first course in
// forces, set up so that the numbers come out clean but never trivially
// (no acceleration or tension of exactly 1), and so that each runs to a quiet end: what slides
// stops on a rough floor, what is pushed for ever goes off the side. Each is a list of elements in
// the form a scene saves, built with a few helpers so that blocks sit
// exactly on their surfaces and ropes leave them parallel to the surface.
// =====================================================================
const Build = {
  // a block resting on a surface, `along` metres from the surface's start
  on(s, along, b) { const t = V.polar(s.angle), n = V.left(t), h = b.h || 0.3, c = V.add(V.at({ x: s.x, y: s.y }, t, along), V.mul(n, h / 2));
    return { t: 'block', ...b, x: c.x, y: c.y, angle: World.tilt(t) }; },
  // a block resting on top of another (same tilt)
  stack(lower, b) { const n = V.polar(lower.angle + 90), h = b.h || 0.3, c = V.add({ x: lower.x, y: lower.y }, V.mul(n, (lower.h || 0.3) / 2 + h / 2));
    return { t: 'block', ...b, x: c.x + (b.dx || 0), y: c.y, angle: lower.angle }; },
  // a pulley just past the end of a surface, its top level with a block's centre on that surface
  pulleyAtEnd(s, blockH, r, id) { const t = V.polar(s.angle), n = V.left(t), end = V.at({ x: s.x, y: s.y }, t, s.length), c = V.add(V.at(end, t, r * 0.6 + 0.04), V.mul(n, blockH / 2 - r));
    return { t: 'pulley', id, x: c.x, y: c.y, r }; },
  // straight below the far side of a pulley, `drop` metres down
  hangFrom(p, drop, b, side) { return { t: 'block', ...b, x: p.x + (side || 1) * p.r, y: p.y - drop, angle: 0 }; },
};

const PRESETS = (() => {
  const floor = (id, x, len, mu) => ({ t: 'surface', id, x, y: 0, angle: 0, length: len, muS: mu ? mu[0] : 0, muK: mu ? mu[1] : 0 });
  const out = [];
  { const r = { t: 'surface', id: 1, x: -2, y: 0, angle: 30, length: 3.4, muS: 0.4, muK: 0.3 };
    out.push({ key: 'incline', label: 'Block on a ramp', note: 'Static friction cannot hold it at 30°: it slides, against kinetic friction', els: [r, floor(2, 0.944, 3), Build.on(r, 2.6, { id: 3, mass: 2 }), floor(4, -5.5, 3.5, [0.4, 0.3])], graph: 'motion', axis: 's' }); }
  { const f = floor(1, -3, 6, [0.4, 0.3]);
    out.push({ key: 'push', label: 'Pushing a crate', note: 'A 10 N push is less than the most static friction can give (15.7 N): nothing moves. Push harder', els: [f, Build.on(f, 2.5, { id: 2, mass: 4, w: 0.6, h: 0.5 }), { t: 'push', id: 3, on: 2, F: 10, angle: 0 }], graph: 'forces' }); }
  { const p = { t: 'pulley', id: 1, x: 0, y: 3.2, r: 0.35 };
    out.push({ key: 'atwood', label: "Atwood's machine", note: 'a = (m₂ − m₁) g / (m₁ + m₂) = 1.96 m/s²', els: [p, Build.hangFrom(p, 1.6, { id: 2, mass: 2 }, -1), Build.hangFrom(p, 1.9, { id: 3, mass: 3 }, 1), { t: 'rope', id: 4, from: 2, to: 3, via: [1] }, floor(5, -1.5, 3)], graph: 'motion', axis: 'y' }); }
  { const t = { t: 'surface', id: 1, x: -3, y: 1.2, angle: 0, length: 3, muS: 0.3, muK: 0.2 }, b = Build.on(t, 1.2, { id: 2, mass: 4 }), p = Build.pulleyAtEnd(t, 0.3, 0.1, 3);
    out.push({ key: 'table', label: 'Table and hanging block', note: 'The hanging 1.5 kg block beats the most static friction (11.8 N) and drags the 4 kg block', els: [t, b, p, Build.hangFrom(p, 0.8, { id: 4, mass: 1.5 }), { t: 'rope', id: 5, from: 2, to: 4, via: [3] }, floor(6, -3, 4)], graph: 'forces' }); }
  { const r = { t: 'surface', id: 1, x: -3, y: 0, angle: 30, length: 3.2, muS: 0.25, muK: 0.15 }, b = Build.on(r, 1.4, { id: 2, mass: 3 }), p = Build.pulleyAtEnd(r, 0.3, 0.1, 3);
    out.push({ key: 'rampPulley', label: 'Ramp with a pulley', note: 'Which way will it go? Compare m₂ g with m₁ g sin θ', els: [r, b, p, Build.hangFrom(p, 0.9, { id: 4, mass: 2.5 }), { t: 'rope', id: 5, from: 2, to: 4, via: [3] }, floor(6, -3, 6)], graph: 'motion', axis: 's' }); }
  { const f = floor(1, -3, 11, [0.4, 0.3]);
    out.push({ key: 'harder', label: 'Pushing harder and harder', note: 'The push grows by 4 N each second. Static friction keeps up until 15.7 N (μs n), then the crate breaks free and kinetic friction is only 11.8 N',
      els: [f, Build.on(f, 2.5, { id: 2, mass: 4, w: 0.6, h: 0.5 }), { t: 'push', id: 3, on: 2, F: 0, angle: 0, rate: 4 }], view: { x0: -3, y0: 0, x1: 3, y1: 1 }, graph: 'forces' }); }
  { const f = floor(1, -3, 11), a = Build.on(f, 2, { id: 2, mass: 3, w: 0.5, h: 0.4 }), b = Build.on(f, 2.5, { id: 3, mass: 1.5, w: 0.5, h: 0.4 });
    out.push({ key: 'pair', label: 'Two blocks pushed', note: 'The push on block 2 is only m₂ a = 3 N of the 9 N: Newton’s third law pair at the contact', els: [f, a, b, { t: 'push', id: 4, on: 2, F: 9, angle: 0 }], view: { x0: -3, y0: 0, x1: 3, y1: 1 }, graph: 'forces' }); }
  { const f = floor(1, -3, 11), lo = Build.on(f, 2, { id: 2, mass: 3, w: 1.2, h: 0.3, muS: 0.5, muK: 0.3 }), hi = Build.stack(lo, { id: 3, mass: 1, w: 0.4, h: 0.3 });
    out.push({ key: 'stack', label: 'Stacked blocks', note: 'Static friction carries the top block, up to μs m g. Pull harder than 19.6 N and it slips', els: [f, lo, hi, { t: 'push', id: 4, on: 2, F: 12, angle: 0 }], view: { x0: -3, y0: 0, x1: 3, y1: 1 }, graph: 'forces' }); }
  { const w = { t: 'surface', id: 1, x: 0.5, y: 0, angle: 90, length: 3.5, muS: 0.6, muK: 0.4 };
    out.push({ key: 'wall', label: 'Block against a wall', note: 'Pressed with 40 N, static friction (up to 24 N) holds the 2 kg block up. Press with less', els: [w, floor(2, -3, 3.5), { t: 'block', id: 3, x: 0.3, y: 1.6, mass: 2, w: 0.4, h: 0.4 }, { t: 'push', id: 4, on: 3, F: 40, angle: 0 }], graph: 'forces' }); }
  { const f = floor(1, -3, 6), b = Build.on(f, 3.4, { id: 3, mass: 2 });
    out.push({ key: 'spring', label: 'Mass on a spring', note: 'Pulled 0.4 m out: T = 2π √(m / k) = 1.26 s', els: [f, { t: 'anchor', id: 2, x: -2.8, y: b.y }, b, { t: 'spring', id: 4, from: 2, to: 3, k: 50, rest: 2.8 }, { t: 'surface', id: 5, x: -2.8, y: 0, angle: 90, length: 0.8, muS: 0, muK: 0 }], graph: 'motion', axis: 'x' }); }
  { out.push({ key: 'hanging', label: 'Hanging spring', note: 'At rest it stretches m g / k = 0.392 m. Let go from the natural length and it bobs about that point', els: [{ t: 'surface', id: 1, x: 1, y: 3.4, angle: 180, length: 2, muS: 0, muK: 0 },
    { t: 'anchor', id: 2, x: 0, y: 3.4 }, { t: 'block', id: 3, x: 0, y: 3.4 - 1.2, mass: 1.6 }, { t: 'spring', id: 4, from: 2, to: 3, k: 40, rest: 1.2 }], graph: 'energy' }); }
  { const L = 1.8, th = 20, c = { x: 0, y: 3.4 };
    out.push({ key: 'pendulum', label: 'Pendulum', note: 'Small swings: T = 2π √(L / g) = 2.69 s, whatever the mass', els: [{ t: 'surface', id: 1, x: 1, y: 3.4, angle: 180, length: 2, muS: 0, muK: 0 }, { t: 'anchor', id: 2, x: c.x, y: c.y },
      { t: 'block', id: 3, x: L * Math.sin(Angle.rad(th)), y: c.y - L * Math.cos(Angle.rad(th)), mass: 1.2, w: 0.2, h: 0.2 }, { t: 'rope', id: 4, from: 2, to: 3, via: [] }], graph: 'energy', opts: { trails: true } }); }
  { out.push({ key: 'twoRopes', label: 'Hanging from two ropes', note: 'Equilibrium: the two tensions’ horizontal parts cancel, their vertical parts hold up m g', els: [{ t: 'surface', id: 1, x: 2, y: 3.4, angle: 180, length: 4, muS: 0, muK: 0 },
    { t: 'anchor', id: 2, x: -1.5, y: 3.4 }, { t: 'anchor', id: 3, x: 1.2, y: 3.4 }, { t: 'block', id: 4, x: 0, y: 2.2, mass: 3, w: 0.3, h: 0.3 }, { t: 'rope', id: 5, from: 2, to: 4, via: [] }, { t: 'rope', id: 6, from: 3, to: 4, via: [] }], graph: 'forces' }); }
  { const t = { t: 'surface', id: 1, x: -3, y: 1.5, angle: 0, length: 2.2, muS: 0, muK: 0 };
    out.push({ key: 'projectile', label: 'Off the table', note: 'Once it leaves the edge only gravity acts: it keeps its 2.2 m/s across and falls', els: [t, floor(2, -3, 6, [0.4, 0.3]), Build.on(t, 0.4, { id: 3, mass: 1, vx: 2.2, w: 0.3, h: 0.25 }),
      { t: 'surface', id: 4, x: -0.8, y: 1.5, angle: 270, length: 1.5, muS: 0, muK: 0 }], graph: 'motion', axis: 'y', opts: { trails: true } }); }
  return out;
})();
const PRESET = (key) => PRESETS.find((p) => p.key === key) || null;
