import { Team } from '../types/game';
import { Career, CareerLength } from './careerScore';

// ---------------------------------------------------------------------------
// After a contract ends: an extension at the same school, or offers from other schools in the same world. Each
// signed contract starts a new Hall of Fame entry at the program's prestige that day.
// ---------------------------------------------------------------------------

export type OfferTier = 'POWERHOUSE' | 'TRADITION' | 'REBUILD';

export interface JobOffer {
  teamId: string;
  name: string;
  prestige: number;
  tier: OfferTier;
}

export const OFFER_NOTES: Record<OfferTier, string> = {
  POWERHOUSE: 'Powerhouse. Title or bust.',
  TRADITION: 'Tradition. Fans expect deep playoff runs.',
  REBUILD: 'Rebuild. Patience from the AD; lower prestige scores more.'
};

export const offerTier = (prestige: number): OfferTier => (prestige >= 88 ? 'POWERHOUSE' : prestige >= 72 ? 'TRADITION' : 'REBUILD');

/** How the job market sees a coach (50-99): winning, playoff runs and titles open better doors. */
export function coachReputation(career: Career): number {
  const n = Math.max(1, career.seasons.length);
  const wins = career.seasons.reduce((s, x) => s + x.wins + x.playoffWins, 0);
  const losses = career.seasons.reduce((s, x) => s + x.losses, 0);
  const winPct = wins / Math.max(1, wins + losses);
  const playoffWins = career.seasons.reduce((s, x) => s + x.playoffWins, 0) / n;
  const titles = career.seasons.filter((x) => x.stateTitle).length / n;
  return Math.round(Math.max(50, Math.min(99, 45 + winPct * 40 + playoffWins * 3 + titles * 20)));
}

const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

/**
 * Three offers from the coach's state: a reach near his reputation, a step below it, and a rebuild. Missing
 * bands fall back to the closest schools so there are always three.
 */
export function jobOffers(career: Career, teams: Team[], currentTeamId: string): JobOffer[] {
  const rep = coachReputation(career);
  const pool = teams.filter((t) => t.id !== currentTeamId);
  const chosen: Team[] = [];
  const take = (inBand: (p: number) => boolean, target: number) => {
    const open = pool.filter((t) => !chosen.includes(t));
    const team = pick(open.filter((t) => inBand(t.prestige))) ?? [...open].sort((a, b) => Math.abs(a.prestige - target) - Math.abs(b.prestige - target))[0];
    if (team) chosen.push(team);
  };
  take((p) => p >= rep - 4 && p <= rep + 6, rep + 1);
  take((p) => p >= rep - 16 && p < rep - 4, rep - 10);
  take((p) => p < Math.min(66, rep - 16), 58);
  return chosen
    .sort((a, b) => b.prestige - a.prestige)
    .map((t) => ({ teamId: t.id, name: t.name, prestige: t.prestige, tier: offerTier(t.prestige) }));
}

/** A new contract (Hall of Fame entry) for the same coach, starting next season. */
export function newContract(previous: Career, team: Team, length: CareerLength, startYear: number, sameSchool: boolean): Career {
  return {
    id: `career_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    coachName: previous.coachName,
    // An extension keeps the scenario program's name; a new job is ranked as the school itself
    scenario: sameSchool ? previous.scenario : 'OPEN',
    state: previous.state,
    startingSchool: sameSchool ? previous.startingSchool : team.name,
    startingProgram: sameSchool ? previous.startingProgram : team.name,
    startedYear: startYear,
    length,
    startingPrestige: team.prestige,
    coachId: previous.coachId ?? previous.id,
    token: crypto.randomUUID(),
    seasons: []
  };
}
