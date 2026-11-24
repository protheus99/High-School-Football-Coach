// Shared by the expansion-data build scripts (build-all-teams.mjs, build-state-rules.mjs).
import fs from 'node:fs';
import path from 'node:path';

/**
 * The expansion research folder: the command-line argument, else $HSFC_EXPANSION, else the nearest `expansion/` folder
 * (one holding final/) beside the repo or any of its parents. The last case finds it from a git worktree too.
 */
export function findExpansionDir(repo, arg) {
  const explicit = arg ?? process.env.HSFC_EXPANSION;
  if (explicit) return path.resolve(explicit);
  for (let dir = repo; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'expansion');
    if (fs.existsSync(path.join(candidate, 'final'))) return candidate;
    if (path.dirname(dir) === dir) break;
  }
  throw new Error('expansion/final not found: pass the expansion folder as an argument or set HSFC_EXPANSION');
}

export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** A CSV file as an array of {header: value} rows. */
export function readCsvRows(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, (cols[i] ?? '').trim()]));
  });
}

export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
