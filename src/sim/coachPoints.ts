import { boardCpModifier } from './programMeters';

// ---------------------------------------------------------------------------
// Coach Points (CP): the single currency for the head coach's time and influence.
//
// Earn:  a weekly allowance (bigger in spring/summer, when there are no games), +10 for a win and
//        +20 for a playoff win. Unspent CP carries over: talents are expensive and take saving for.
// Spend: feeder events and prospect visits, college exposure (film, calls, camps), and permanent
//        coach talents in the skill tree.
// ---------------------------------------------------------------------------

/** Weekly allowance before talents: full time in spring and summer, less once games start. */
export function weeklyCoachPoints(week: number): number {
  return week <= 4 ? 100 : 40;
}

export const STARTING_COACH_POINTS = 100;
export const WIN_CP_BONUS = 10;
export const PLAYOFF_WIN_CP_BONUS = 20;

export type TalentBranch = 'RECRUITER' | 'DEVELOPER' | 'POLITICIAN' | 'MANAGER';

export type TalentId =
  | 'RECRUITING_NETWORK'
  | 'COLLEGE_CONNECTIONS'
  | 'ASSISTANT_UPGRADE'
  | 'WEIGHT_ROOM_FANATIC'
  | 'BOARD_ROOM_SHIELD'
  | 'BOOSTER_BREAKFASTS'
  | 'BIGGER_BUDGET'
  | 'DEEP_POCKETS';

export interface CoachTalent {
  id: TalentId;
  branch: TalentBranch;
  name: string;
  description: string;
  cost: number; // CP: talents change core gameplay, so they cost seasons of saving
  requires?: TalentId; // the first talent in the branch
}

/** Every talent changes something real in the game (the effect helpers below are read by the systems). */
export const COACH_TALENTS: CoachTalent[] = [
  { id: 'RECRUITING_NETWORK', branch: 'RECRUITER', name: 'Recruiting Network', description: 'Feeder events cost 20% less.', cost: 6000 },
  {
    id: 'COLLEGE_CONNECTIONS',
    branch: 'RECRUITER',
    name: 'College Connections',
    description: 'Film, calls and camps for college prospects cost 40% less.',
    cost: 12000,
    requires: 'RECRUITING_NETWORK'
  },
  { id: 'ASSISTANT_UPGRADE', branch: 'DEVELOPER', name: 'Assistant Upgrade', description: 'Assistants drill 8 players a week instead of 6.', cost: 6000 },
  {
    id: 'WEIGHT_ROOM_FANATIC',
    branch: 'DEVELOPER',
    name: 'Weight Room Fanatic',
    description: 'Bigger off-season growth for every returning player.',
    cost: 12000,
    requires: 'ASSISTANT_UPGRADE'
  },
  { id: 'BOARD_ROOM_SHIELD', branch: 'POLITICIAN', name: 'Board Room Shield', description: 'Win over the school board: Rating up right away, and the board is more patient.', cost: 6000 },
  {
    id: 'BOOSTER_BREAKFASTS',
    branch: 'POLITICIAN',
    name: 'Booster Breakfasts',
    description: 'Win over the boosters: Rating up right away, and feeder recruiting gets a lift.',
    cost: 12000,
    requires: 'BOARD_ROOM_SHIELD'
  },
  { id: 'BIGGER_BUDGET', branch: 'MANAGER', name: 'Bigger Budget', description: '+₡10 every week.', cost: 6000 },
  { id: 'DEEP_POCKETS', branch: 'MANAGER', name: 'Deep Pockets', description: 'Win bonuses are doubled.', cost: 12000, requires: 'BIGGER_BUDGET' }
];

export const TALENT_BRANCH_LABELS: Record<TalentBranch, string> = {
  RECRUITER: 'Recruiter',
  DEVELOPER: 'Developer',
  POLITICIAN: 'Politician',
  MANAGER: 'Manager'
};

/** Why a talent can't be unlocked right now, or null if it can. */
export function talentBlocker(id: TalentId, owned: TalentId[], coachPoints: number): string | null {
  const talent = COACH_TALENTS.find((t) => t.id === id)!;
  if (owned.includes(id)) return 'Already unlocked';
  if (talent.requires && !owned.includes(talent.requires)) return `Unlock ${COACH_TALENTS.find((t) => t.id === talent.requires)!.name} first`;
  if (coachPoints < talent.cost) return `Needs ${formatCP(talent.cost)}`;
  return null;
}

// --- Effects (read by the systems they change) -------------------------------------------------

/** CP for display: the colon sign with thousands separators, e.g. ₡6,000. */
export const formatCP = (amount: number) => `₡${amount.toLocaleString('en-US')}`;
/** Bonus CP for a win (doubled by Deep Pockets). */
export const winBonus = (playoff: boolean, owned: TalentId[]) => (playoff ? PLAYOFF_WIN_CP_BONUS : WIN_CP_BONUS) * (owned.includes('DEEP_POCKETS') ? 2 : 1);
/** Weekly CP: the allowance, Bigger Budget, and the school board's support (see programMeters). */
export const weeklyCpIncome = (week: number, owned: TalentId[], boardTrust = 70) =>
  Math.max(0, weeklyCoachPoints(week) + (owned.includes('BIGGER_BUDGET') ? 10 : 0) + boardCpModifier(boardTrust));
export const feederEventCost = (base: number, owned: TalentId[]) => Math.round(base * (owned.includes('RECRUITING_NETWORK') ? 0.8 : 1));
export const collegeActionCost = (base: number, owned: TalentId[]) => Math.max(1, Math.round(base * (owned.includes('COLLEGE_CONNECTIONS') ? 0.6 : 1)));
export const drillsPerWeek = (base: number, owned: TalentId[]) => base + (owned.includes('ASSISTANT_UPGRADE') ? 2 : 0);
/** Strength-and-conditioning boost applied to the user's off-season progression. */
export const offseasonConditioningBonus = (owned: TalentId[]) => (owned.includes('WEIGHT_ROOM_FANATIC') ? 15 : 0);

