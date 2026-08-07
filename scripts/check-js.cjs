const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.git', 'tmp']);
const files = [];

function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) collect(fullPath);
        else if (entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)) files.push(fullPath);
    }
}

collect(root);
const failures = [];
for (const file of files.sort()) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) failures.push((result.stderr || result.stdout || file).trim());
}
if (failures.length) {
    console.error(failures.join('\n\n'));
    process.exit(1);
}
console.log('Đã kiểm tra cú pháp ' + files.length + ' tệp JavaScript.');
