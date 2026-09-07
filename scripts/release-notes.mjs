#!/usr/bin/env node
// Prints the CHANGELOG section for one version, so a release description and
// the changelog can never drift apart. Usage: node scripts/release-notes.mjs 0.3.0

import { readFileSync } from 'node:fs';

const version = process.argv[2];

if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');

// Headings look like "## [0.3.0] - 2026-09-07". Capture everything up to the
// next "## " heading or the link definitions at the end of the file.
const heading = new RegExp(
  `^## \\[${version.replace(/\./g, '\\.')}\\][^\\n]*\\n`,
  'm'
);
const start = changelog.match(heading);

if (!start) {
  console.error(`no CHANGELOG entry for ${version}`);
  process.exit(1);
}

const body = changelog
  .slice(start.index + start[0].length)
  .split(/^## /m)[0]
  .split(/^\[Unreleased\]:/m)[0]
  .trim();

if (!body) {
  console.error(`CHANGELOG entry for ${version} is empty`);
  process.exit(1);
}

console.log(body);
