// Loads the model-layer source files (everything before the Component
// controller) into one scope and hands back the classes, for node tests.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(dir).filter((f) => /^[0-7]\d-.*\.js$/.test(f)).sort();
const src = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const names = ['P', 'Element', 'Wire', 'Resistor', 'Capacitor', 'Inductor', 'Battery', 'AcSource', 'Voltmeter', 'Ammeter', 'Switch', 'ThrowSwitch', 'Ground', 'ELEMENTS', 'Circuit', 'Solver', 'History', 'View', 'PRESETS', 'Fmt', 'PAINTERS', 'Renderer', 'GraphPainter', 'Simulation', 'Workbench', 'Panel', 'PointerTool', 'Gesture', 'WireGesture', 'MoveGesture', 'PanGesture', 'PinchGesture', 'Meter', 'Draw', 'WorkedExample', 'ShareLink'];
const body = src + '\nconst __o = {};' + names.map((n) => `try { __o.${n} = ${n}; } catch (e) {}`).join('') + 'return __o;';
module.exports = new Function(body)();
