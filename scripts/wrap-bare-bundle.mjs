// scripts/wrap-bare-bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , inFile, outFile] = process.argv;

if (!inFile || !outFile) {
    console.error('Usage: node scripts/wrap-bare-bundle.mjs <in.bundle> <out.mjs>');
    process.exit(1);
}

const buf = readFileSync(inFile);
const b64 = buf.toString('base64');

// Avoid a single enormous string literal (safer for Metro/Hermes parsing).
const CHUNK = 1024 * 1024; // 1 MiB
const chunks = [];
for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.slice(i, i + CHUNK));

mkdirSync(dirname(outFile), { recursive: true });

writeFileSync(
    outFile,
    `// Auto-generated. Do not edit.\n` +
    `const chunks = ${JSON.stringify(chunks)};\n` +
    `export default chunks.join('');\n`,
);
