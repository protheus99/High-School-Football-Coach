// Our rosters' players named on a real play's key roles, and the spot written the way the test pages show it.
import { Position, Team } from '../types/game';
import { LibPlay } from './replayLibrary';

export type Tags = Record<'qb' | 'carrier' | 'target' | 'tackler' | 'intercepter' | 'sacker', string>;

const HS: Record<string, Position> = {
  QB: 'QB', RB: 'RB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', CB: 'CB', DB: 'CB', FS: 'S', SS: 'S', S: 'S', OLB: 'LB', ILB: 'LB', MLB: 'LB', LB: 'LB',
  DE: 'DE', DT: 'DT', NT: 'DT', P: 'P', K: 'K', LS: 'C', C: 'C', G: 'OG', T: 'OT'
};

export const spot = (los: number) => (los === 50 ? 'Midfield' : los < 50 ? `Own ${Math.round(los)}` : `Opp ${Math.round(100 - los)}`);

/** Our rosters' players in the real play's key roles: "QB Rogers" on the real quarterback, and so on */
export function tagPlay(play: LibPlay, offense: Team, defense: Team, extra: number[] = []) {
  const used = new Set<string>();
  const tag = (k: number): string => {
    const [side, raw] = play.roles[k].split(':');
    const pos = HS[raw] ?? 'LB';
    const team = side === 'O' ? offense : defense;
    const pool = team.roster.filter((p) => p.position === pos && !used.has(p.id)).sort((a, b) => (a.depthOrder ?? 9) - (b.depthOrder ?? 9));
    const pl = pool[0];
    if (!pl) return pos;
    used.add(pl.id);
    return `${pos} ${pl.lastName}`;
  };
  const names: Record<number, string> = {};
  const tags = {} as Tags;
  for (const r of ['qb', 'carrier', 'target', 'tackler', 'intercepter', 'sacker'] as const) {
    const k = play.key[r];
    if (k === undefined) {
      tags[r] = '';
      continue;
    }
    tags[r] = names[k] ?? tag(k);
    names[k] = tags[r];
  }
  // Anyone else the test needs named (a penalty's offender)
  for (const k of extra) if (k >= 0 && names[k] === undefined) names[k] = tag(k);
  return { names, tags };
}
