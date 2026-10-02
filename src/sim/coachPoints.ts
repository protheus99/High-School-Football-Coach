// ---------------------------------------------------------------------------
// Coach Points (CP): the single currency for the head coach's time and influence.
//
// Earn:  a weekly allowance (bigger in spring/summer, when there are no games), +10 for a win and
//        +20 for a playoff win. Unspent CP carries over, up to a cap.
// Spend: feeder events and prospect visits, college exposure (film, calls, camps), and permanent
//        coach talents in the skill tree.
// ---------------------------------------------------------------------------

/** Weekly allowance before talents: full time in spring and summer, less once games start. */
export function weeklyCoachPoints(week: number): number {
  return week <= 4 ? 100 : 40;
}

export const STARTING_COACH_POINTS = 100;
export const BASE_CP_CAP = 200; // unspent CP beyond this is lost
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
  cost: number; // CP
  requires?: TalentId; // the first talent in the branch
}

/** Every talent changes something real in the game (the effect helpers below are read by the systems). */
export const COACH_TALENTS: CoachTalent[] = [
  { id: 'RECRUITING_NETWORK', branch: 'RECRUITER', name: 'Recruiting Network', description: 'Feeder events cost 20% less CP.', cost: 60 },
  {
    id: 'COLLEGE_CONNECTIONS',
    branch: 'RECRUITER',
    name: 'College Connections',
    description: 'Film, calls and camps for college prospects cost 40% less CP.',
    cost: 120,
    requires: 'RECRUITING_NETWORK'
  },
  { id: 'ASSISTANT_UPGRADE', branch: 'DEVELOPER', name: 'Assistant Upgrade', description: 'Assistants drill 8 players a week instead of 6.', cost: 60 },
  {
    id: 'WEIGHT_ROOM_FANATIC',
    branch: 'DEVELOPER',
    name: 'Weight Room Fanatic',
    description: 'Bigger off-season growth for every returning player.',
    cost: 120,
    requires: 'ASSISTANT_UPGRADE'
  },
  { id: 'BOARD_ROOM_SHIELD', branch: 'POLITICIAN', name: 'Board Room Shield', description: '+15 School Board Trust right away.', cost: 60 },
  {
    id: 'BOOSTER_BREAKFASTS',
    branch: 'POLITICIAN',
    name: 'Booster Breakfasts',
    description: '+10 Booster Approval right away.',
    cost: 120,
    requires: 'BOARD_ROOM_SHIELD'
  },
  { id: 'BIGGER_BUDGET', branch: 'MANAGER', name: 'Bigger Budget', description: '+10 CP every week.', cost: 60 },
  { id: 'DEEP_POCKETS', branch: 'MANAGER', name: 'Deep Pockets', description: 'Bank up to 100 more CP.', cost: 120, requires: 'BIGGER_BUDGET' }
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
  if (coachPoints < talent.cost) return `Needs ${talent.cost} CP`;
  return null;
}

// --- Effects (read by the systems they change) -------------------------------------------------

export const cpCap = (owned: TalentId[]) => BASE_CP_CAP + (owned.includes('DEEP_POCKETS') ? 100 : 0);
export const weeklyCpIncome = (week: number, owned: TalentId[]) => weeklyCoachPoints(week) + (owned.includes('BIGGER_BUDGET') ? 10 : 0);
export const feederEventCost = (base: number, owned: TalentId[]) => Math.round(base * (owned.includes('RECRUITING_NETWORK') ? 0.8 : 1));
export const collegeActionCost = (base: number, owned: TalentId[]) => Math.max(1, Math.round(base * (owned.includes('COLLEGE_CONNECTIONS') ? 0.6 : 1)));
export const drillsPerWeek = (base: number, owned: TalentId[]) => base + (owned.includes('ASSISTANT_UPGRADE') ? 2 : 0);
/** Strength-and-conditioning boost applied to the user's off-season progression. */
export const offseasonConditioningBonus = (owned: TalentId[]) => (owned.includes('WEIGHT_ROOM_FANATIC') ? 15 : 0);

/** Add CP without going over the cap. */
export const addCoachPoints = (current: number, amount: number, owned: TalentId[]) => Math.min(cpCap(owned), current + amount);
