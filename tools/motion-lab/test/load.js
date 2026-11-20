// Loads the model-layer source files (everything before the Component controller) into one scope and hands back
// the classes, for node tests.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(dir).filter((f) => /^[0-7]\d-.*\.js$/.test(f)).sort();
const src = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const names = ['clamp', 'Fmt', 'Kin', 'Motion', 'Car', 'meet', 'TRACK', 'TARGETS', 'target', 'score', 'verdict', 'SCORE_TOL', 'Driver', 'Sim', 'Graphs', 'Renderer', 'Panel', 'UI', 'Link'];
const body = src + '\nconst __o = {};' + names.map((n) => `try { __o.${n} = ${n}; } catch (e) {}`).join('') + 'return __o;';
module.exports = new Function(body)();

// the little test kit every suite uses
let n = 0, bad = 0;
module.exports.ok = (cond, msg) => { n++; if (!cond) { bad++; console.log('FAIL: ' + msg); } };
module.exports.near = (x, y, tol, msg) => { n++; if (!(Math.abs(x - y) <= tol)) { bad++; console.log('FAIL: ' + msg + '  (got ' + x + ', wanted ' + y + ')'); } };
module.exports.done = (name) => { if (bad) { console.log(name + ': ' + bad + ' of ' + n + ' checks FAILED'); process.exit(1); } console.log(name + ': all ' + n + ' checks passed'); };
