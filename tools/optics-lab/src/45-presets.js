// =====================================================================
// Presets -- benches that are already set up. Each is a list of elements
// (the same plain objects a scene saves) and the View switches it wants on.
// The numbers are chosen so the classic results come out clean but never
// trivially: s = 45 cm and f = 20 cm give s' = 36 cm and m = -0.8, and so on.
// =====================================================================
// (The two benches meant for checking Snell's law by hand use glass with no dispersion, so that the
// index a student reads off the glass is exactly the index the ray feels, whatever its colour.)
const PRESETS = [
  { key: 'lens', label: 'Converging lens', note: 'A real, inverted image',
    els: [{ t: 'lamp', x: -45, y: 5, angle: 0, nm: 0, spread: 30, count: 9 }, { t: 'lens', x: 0, y: 0, f: 20, height: 40 }] },
  { key: 'object', label: 'Object and lens', note: 'The principal rays, and an inverted image of the whole arrow',
    els: [{ t: 'object', x: -45, y: 0, angle: 0, nm: 0, height: 8 }, { t: 'lens', x: 0, y: 0, f: 20, height: 40 }] },
  { key: 'diverging', label: 'Diverging lens', note: 'Parallel rays spread from a virtual focus',
    els: [{ t: 'beam', x: -50, y: 0, angle: 0, nm: 0, width: 24, count: 7 }, { t: 'lens', x: 0, y: 0, f: -20, height: 40 }] },
  { key: 'concave', label: 'Concave mirror', note: 'A real image in front of the mirror',
    els: [{ t: 'lamp', x: -45, y: 5, angle: 0, nm: 0, spread: 28, count: 9 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 0, f: 18, height: 40 }] },
  { key: 'convex', label: 'Convex mirror', note: 'A small virtual image behind the mirror',
    els: [{ t: 'lamp', x: -40, y: 6, angle: 0, nm: 0, spread: 32, count: 9 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 0, f: -20, height: 40 }] },
  { key: 'flat', label: 'Flat mirror', note: 'The image is as far behind the mirror as the object is in front',
    els: [{ t: 'lamp', x: -32, y: 8, angle: -8, nm: 0, spread: 44, count: 9 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 1, height: 56 }] },
  { key: 'prism', label: 'Prism and white light', note: 'Dispersion: violet is bent the most',
    els: [{ t: 'laser', x: -54, y: -15, angle: 24, nm: 0 }, { t: 'prism', x: 0, y: 0, n: 1.62, spread: 0.04, apex: 60, side: 34 }, { t: 'screen', x: 70, y: -22, angle: 156, height: 30 }] },
  { key: 'snell', label: "Snell's law", note: 'Refraction into and out of a glass block',
    els: [{ t: 'laser', x: -25, y: 30, angle: 310, nm: 650 }, { t: 'block', x: 0, y: -14, n: 1.52, spread: 0, width: 64, height: 28 }], opts: { angles: 1 } },
  { key: 'tir', label: 'Total internal reflection', note: 'Past the critical angle no light escapes',
    els: [{ t: 'laser', x: -32, y: -24, angle: 36.87, nm: 532 }, { t: 'half', x: 0, y: 0, angle: 270, n: 1.49, spread: 0, radius: 24 }], opts: { angles: 1 } },
  { key: 'two', label: 'Two lenses', note: "The first lens's image is the second lens's object",
    els: [{ t: 'lamp', x: -70, y: 4, angle: 0, nm: 0, spread: 18, count: 7 }, { t: 'lens', x: -25, y: 0, f: 15, height: 34 }, { t: 'lens', x: 30, y: 0, f: 20, height: 48 }] },
  { key: 'aberration', label: 'Spherical aberration', note: 'A real spherical mirror has no single focus',
    els: [{ t: 'beam', x: -55, y: 0, angle: 0, nm: 650, width: 34, count: 13 }, { t: 'mirror', x: 0, y: 0, angle: 180, flat: 0, f: 20, height: 38 }], opts: { real: 1 } },
  { key: 'reallens', label: 'A real glass lens', note: 'Rays far from the axis are bent too much',
    els: [{ t: 'beam', x: -55, y: 0, angle: 0, nm: 650, width: 18, count: 11 }, { t: 'lens', x: 0, y: 0, f: 30, height: 40, n: 1.52, spread: 0.018 }], opts: { real: 1 } },
  { key: 'chromatic', label: 'Chromatic aberration', note: 'Each colour has its own focal length',
    els: [{ t: 'beam', x: -55, y: 0, angle: 0, nm: 0, width: 24, count: 7 }, { t: 'lens', x: 0, y: 0, f: 30, height: 40, n: 1.62, spread: 0.04 }], opts: { chroma: 1 } },
  { key: 'periscope', label: 'Reflecting prism', note: 'Two total internal reflections turn the beam back',
    els: [{ t: 'beam', x: -50, y: 6, angle: 0, nm: 650, width: 6, count: 3 }, { t: 'prism', x: 8, y: 0, angle: 270, n: 1.52, spread: 0.018, apex: 90, side: 30 }] },
];
const PRESET = (key) => PRESETS.find((p) => p.key === key) || null;
