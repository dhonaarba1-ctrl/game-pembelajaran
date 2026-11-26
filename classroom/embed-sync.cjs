// Update the offline bundles from the shared synchronization source.
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'sync.js'), 'utf8').trim();
for (const name of ['Word_Classroom_Halaman_Lengkap_HP_PC.html', 'Excel_Formula_Pro_HP_PC.html']) {
  const filename = path.join(__dirname, '..', name);
  const original = fs.readFileSync(filename, 'utf8');
  const block = /\/\* classroom-sync:start \*\/[\s\S]*?\/\* classroom-sync:end \*\//;
  if (!block.test(original)) throw new Error('Missing sync block in ' + name);
  fs.writeFileSync(filename, original.replace(block, () => '/* classroom-sync:start */\n' + source + '\n/* classroom-sync:end */'));
}
