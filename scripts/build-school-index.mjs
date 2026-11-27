#!/usr/bin/env node
// Rebuilds src/data/schoolIndex.json (New Game's national school list) from the team files and the national levels,
// without rebuilding the team files. build-all-teams.mjs runs the same step at its end.
//
//   node scripts/build-school-index.mjs [expansionDir]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExpansionDir } from './lib/expansion.mjs';
import { buildSchoolIndex } from './lib/schoolIndex.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { states, schools } = buildSchoolIndex(repo, findExpansionDir(repo, process.argv[2]));
console.log(`${states} states, ${schools} schools -> src/data/schoolIndex.json`);
