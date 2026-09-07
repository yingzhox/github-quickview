#!/usr/bin/env node
// Builds the unpacked-extension zip that ships on GitHub releases and, if it
// ever gets there, the Chrome Web Store. Only runtime files go in: no tests,
// no CI config, no package manifest.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';

const PAYLOAD = ['manifest.json', 'src', 'icons', 'README.md', 'LICENSE'];

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const pkg = readJson('package.json');
const manifest = readJson('manifest.json');

// A release is tagged from package.json's version, but Chrome loads
// manifest.json's. Shipping a zip where they disagree is silent breakage.
if (pkg.version !== manifest.version) {
  console.error(
    `version mismatch: package.json is ${pkg.version}, manifest.json is ${manifest.version}`
  );
  process.exit(1);
}

const output = `dist/github-quickview-${pkg.version}.zip`;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

// -X drops extended attributes so the same input produces the same archive.
execFileSync('zip', ['-r', '-X', '-q', output, ...PAYLOAD, '-x', '.*', '*/.*'], {
  stdio: 'inherit',
});

console.log(`${output} (${statSync(output).size} bytes)`);
