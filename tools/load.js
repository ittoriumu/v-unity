// Loads the DOM-free game modules into a Node global so tools/tests can drive them.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', 'js');
for (const f of ['core.js', 'cards.js', 'engine.js', 'ai.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
module.exports = globalThis.JD;
