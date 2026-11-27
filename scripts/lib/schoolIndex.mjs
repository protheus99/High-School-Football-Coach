// The national school index New Game reads (src/data/schoolIndex.json): every school in the team files, compact, with
// its national size level (expansion/final/class-levels.csv: L1 = each state's top class ... L5 = the smallest schools;
// California's sections are split into league tiers in class-levels-splits.csv). Quick Pick deals and the all-states
// search run on it without loading 51 state files. Written by build-all-teams.mjs, or on its own by build-school-index.mjs.
//
// Format: [{ state, c: [{ n: class, d: [[district, level], ...], s: [row, ...] }] }], rows
//   [name, city, mascot, primary, secondary, prestige, id, district index]
// city and mascot are '' when not on file; primary and secondary are hex without '#', '' when the colors are not on file;
// id is the school's id without its 'team_<state>_' prefix, or 0 when it is exactly the name's slug.
import fs from 'node:fs';
import path from 'node:path';
import { readCsvRows, slugify } from './expansion.mjs';

export function buildSchoolIndex(repo, expansion) {
  const finalDir = path.join(expansion, 'final');
  const level = new Map();
  const caTier = new Map();
  for (const r of readCsvRows(path.join(finalDir, 'class-levels.csv'))) {
    if (!r.Level) continue;
    level.set(`${r.State}|${r.Class}`, Number(r.Level));
    if (r.State === 'California') caTier.set(r.Class, Number(r.Level));
  }
  const split = new Map();
  for (const r of readCsvRows(path.join(finalDir, 'class-levels-splits.csv'))) split.set(`${r.Class}|${r.District}`, caTier.get(r.Tier));

  const teamsDir = path.join(repo, 'src', 'data', 'teams');
  const out = [];
  const missing = [];
  let schools = 0;
  for (const file of fs.readdirSync(teamsDir).filter((f) => f.endsWith('.json')).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(teamsDir, file), 'utf8'));
    const prefix = `team_${slugify(data.state)}_`;
    const classes = data.classes.map((c) => ({
      n: c.className,
      d: c.districts.map((d) => {
        const lv = level.get(`${data.state}|${c.className}`) ?? split.get(`${c.className}|${d.name}`);
        if (!lv) missing.push(`${data.state} ${c.className} ${d.name}`);
        return [d.name, lv ?? 3];
      }),
      s: c.districts.flatMap((d, i) =>
        d.schools.map((s) => {
          schools++;
          const known = s.colorsConfirmed !== false;
          const id = s.id.startsWith(prefix) ? s.id.slice(prefix.length) : s.id;
          return [s.name, s.city ?? '', s.mascot ?? '', known ? s.primaryColor.slice(1) : '', known ? s.secondaryColor.slice(1) : '', s.prestige, id === slugify(s.name) ? 0 : id, i];
        })
      )
    }));
    out.push({ state: data.state, c: classes });
  }
  if (missing.length) throw new Error(`No national level for: ${missing.slice(0, 10).join('; ')}${missing.length > 10 ? ' …' : ''}`);
  fs.writeFileSync(path.join(repo, 'src', 'data', 'schoolIndex.json'), JSON.stringify(out) + '\n');
  return { states: out.length, schools };
}
