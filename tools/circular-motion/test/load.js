// Loads the model-layer source files (everything before the Component controller), with the shared G3 kit
// ahead of them as in the bundle, into one scope and hands back the classes, for node tests.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(dir).filter((f) => /^[0-7]\d-.*\.js$/.test(f)).sort();
const kit = fs.readFileSync(path.join(__dirname, '..', '..', 'g3-kit.js'), 'utf8');
const src = kit + '\n' + files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const names = ['G3', 'V', 'V3', 'Angle', 'Fmt', 'G', 'Situation', 'Puck', 'FlatCurve', 'BankedCurve', 'Conical', 'Vertical', 'Ferris', 'Orbit', 'SITUATIONS', 'Camera', 'Renderer', 'Sim', 'Panel', 'UI', 'Link'];
const body = src + '\nconst __o = {};' + names.map((n) => `try { __o.${n} = ${n}; } catch (e) {}`).join('') + 'return __o;';
module.exports = new Function(body)();

// the little test kit every suite uses
let n = 0, bad = 0;
module.exports.ok = (cond, msg) => { n++; if (!cond) { bad++; console.log('FAIL: ' + msg); } };
module.exports.near = (x, y, tol, msg) => { n++; if (!(Math.abs(x - y) <= tol)) { bad++; console.log('FAIL: ' + msg + '  (got ' + x + ', wanted ' + y + ')'); } };
module.exports.done = (name) => { if (bad) { console.log(name + ': ' + bad + ' of ' + n + ' checks FAILED'); process.exit(1); } console.log(name + ': all ' + n + ' checks passed'); };
