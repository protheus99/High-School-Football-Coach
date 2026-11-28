import { DefensiveScheme, OffensiveScheme, ScheduledGame, Team } from '../types/game';
import type { StateTeamData, TeamDistrict, TeamSchool } from '../data/teamData';
import { STATE_DATA } from '../data/stateWorlds';
import { generateDistrictTeams } from '../generators/rosterGenerator';
import { classRulesFor, ClassRules } from './classRules';
import { buildClassPlayoffs, ClassDistrict, generateClassSchedule } from './classSeason';
import type { GameWorld, LeagueStructure, StateSchoolEntry } from './league';
import type { PlayoffBracketState } from './playoffEngine';
import { rulesForState } from './stateRules';

// ---------------------------------------------------------------------------
// Leagues built from the team data (src/data/teams): any state's class played on the generalized engine in
// classSeason.ts. The original 12 states' hand-tuned top classes keep their own path (league.ts, stateRules.ts) and
// are told apart by `league.className` being unset.
// ---------------------------------------------------------------------------

/** The class the hand-tuned StateRules path plays in each of the original 12 states (California: its Open Division). */
export const LEGACY_TOP_CLASS: Record<string, string> = {
  Texas: '6A',
  Georgia: '7A',
  Florida: '6A',
  Maryland: '4A',
  'North Carolina': '8A',
  Alabama: '6A',
  Tennessee: '6A',
  Ohio: 'D1',
  Pennsylvania: '6A',
  'New Jersey': 'Group 5',
  Louisiana: '5A',
  California: 'Open Division' // the hand-built Open Division; the data's CIF sections are classes of their own
};

/**
 * The class a team plays in, for the screens: its class in the team data, or its state's hand-tuned top class (Georgia
 * 7A, Ohio D1). The stored `classification` isn't trusted: saves before the expansion hold '6A' for every team.
 */
export const teamClassLabel = (team: Pick<Team, 'className' | 'state'>): string =>
  team.className ?? LEGACY_TOP_CLASS[team.state ?? 'Texas'] ?? rulesForState(team.state).classification;

/** True when the (state, class) is one the hand-tuned top-class path already plays. */
export const isLegacyClass = (state: string, className: string) => LEGACY_TOP_CLASS[state] === className;

/** Schools per group when a class has no district data (the size of a typical district). */
const GROUP_SIZE = 8;

/**
 * Real districts where the data has them. A class with none is grouped in list order (the lists run in district and
 * geographic order): into as many districts as its playoff field implies (a district-finish class) or groups of about
 * eight. Schools with no district join the smallest named district. Grouped districts are marked synthetic, so the
 * screens never show a district name the data doesn't have.
 */
export function groupUnnamedDistricts(districts: TeamDistrict[], rules?: ClassRules): { name: string; schools: TeamSchool[]; synthetic: boolean }[] {
  const named = districts.filter((d) => d.name).map((d) => ({ name: d.name, schools: [...d.schools], synthetic: false }));
  const blank = districts.filter((d) => !d.name).flatMap((d) => d.schools);
  if (blank.length === 0) return named;
  if (named.length > 0) {
    blank.forEach((s) => named.reduce((a, b) => (b.schools.length < a.schools.length ? b : a)).schools.push(s));
    return named;
  }
  const p = rules?.playoffs;
  const byField = p?.format === 'DISTRICT_FINISH' && p.fieldSize && p.qualifiersPerDistrict ? Math.ceil(p.fieldSize / p.qualifiersPerDistrict) : Math.round(blank.length / GROUP_SIZE);
  const count = Math.max(1, Math.min(byField, Math.floor(blank.length / 3)));
  const label = rules?.districtLabel ?? 'District';
  return Array.from({ length: count }, (_, i) => ({
    name: `${label} ${i + 1}`,
    schools: blank.slice(Math.round((i * blank.length) / count), Math.round(((i + 1) * blank.length) / count)),
    synthetic: true
  }));
}

/** The league's districts as the season engine reads them. */
export function classDistrictsOf(league: LeagueStructure, teams: Team[]): ClassDistrict[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return league.regions.flatMap((r) =>
    r.districts.map((d) => ({ name: d.name, synthetic: d.synthetic, teams: d.teamIds.map((id) => byId.get(id)).filter((t): t is Team => t !== undefined) }))
  );
}

/** A rough count of a class's playoff rounds from its data (its listed rounds, else enough for its field; the calendar has six).
 *  Leagues carry the real count (classPlayoffRounds); this stands in for one saved without it. */
export const estimatedClassRounds = (rules: ClassRules): number =>
  Math.max(1, Math.min(6, rules.playoffs.rounds.length || Math.ceil(Math.log2(rules.playoffs.fieldSize ?? 16))));

/** A class's rules for the league (undefined for the original top classes). */
export const leagueClassRules = (league?: LeagueStructure): ClassRules | undefined => (league?.className && league.state ? classRulesFor(league.state, league.className) : undefined);

export interface ClassWorldOptions {
  light?: boolean; // light teams (another class played in the background)
  userPrestige?: (dataPrestige: number) => number; // a scenario sets the coach's program's starting prestige
  skip?: (school: TeamSchool) => boolean; // schools left out (default: those on an original state's hand-tuned top-class list)
}

/** The state-agnostic part of a team built from a school's data. */
function applySchool(team: Team, s: TeamSchool, className: string) {
  team.id = s.id;
  team.className = className;
  team.classification = className;
  if (s.shortName) team.shortName = s.shortName;
  if (s.city) team.city = s.city;
  if (s.colorsConfirmed === false) team.colorsConfirmed = false;
}

/**
 * One class of one state as a game world: its districts (or grouped districts) of schools, with the user at the school
 * whose id (or, failing that, name) is given. `userSchool` defaults to the class's strongest program.
 */
export function buildClassWorld(data: StateTeamData, className: string, userSchool?: string, options: ClassWorldOptions = {}): GameWorld {
  const cls = data.classes.find((c) => c.className === className);
  if (!cls) throw new Error(`${data.state} has no class ${className}`);
  const rules = classRulesFor(data.state, className);
  const teams: Team[] = [];
  // An original state's hand-tuned top-class schools play only there (the coach's own school always stays)
  const onTop = options.skip ?? (isLegacyClass(data.state, className) ? undefined : onOriginalTopClass(data.state));
  const skip = onTop && ((s: TeamSchool) => s.id !== userSchool && s.name !== userSchool && onTop(s));
  const source = skip ? cls.districts.map((d) => ({ ...d, schools: d.schools.filter((s) => !skip(s)) })).filter((d) => d.schools.length > 0) : cls.districts;
  const districts = groupUnnamedDistricts(source, rules).map((d, i) => {
    const districtId = `${data.state}_${className}_d${i + 1}`.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const built = generateDistrictTeams(
      districtId,
      d.schools.map((s) => ({
        name: s.name,
        mascot: s.mascot ?? '',
        primary: s.primaryColor,
        secondary: s.secondaryColor,
        prestige: options.userPrestige && (s.id === userSchool || s.name === userSchool) ? options.userPrestige(s.prestige) : s.prestige,
        offenseScheme: s.offenseScheme as OffensiveScheme,
        defenseScheme: s.defenseScheme as DefensiveScheme
      })),
      { talentFromPrestige: true, state: data.state, light: options.light }
    );
    built.forEach((t, k) => applySchool(t, d.schools[k], className));
    teams.push(...built);
    return { id: districtId, name: d.name, ...(d.synthetic && { synthetic: true }), teamIds: built.map((t) => t.id) };
  });
  const user =
    teams.find((t) => t.id === userSchool) ?? teams.find((t) => t.name === userSchool) ?? [...teams].sort((a, b) => b.prestige - a.prestige)[0];
  const body = rules?.governingBody ?? '';
  const league: LeagueStructure = { name: `${body} ${/^\d+A$/.test(className) ? 'Class ' : ''}${className}`.trim(), state: data.state, className, splitDivisions: false, regions: [{ name: className, districts }] };
  league.playoffRounds = classPlayoffRounds(league, teams);
  return { league, teams, userTeamId: user.id };
}

/**
 * The playoff rounds a class league will play, before its season: its playoff selection run on the league as it is (the
 * field's size depends on its districts and rules, not on results). The schedule shows this many playoff weeks.
 */
export const classPlayoffRounds = (league: LeagueStructure, teams: Team[]): number => (leagueClassRules(league) ? classPlayoffs(league, teams, []).roundNames.length : 0);

/** A class league's regular season (a legacy league uses the original scheduler instead). */
export function classSchedule(league: LeagueStructure, teams: Team[], year: number, reservedWeeks: number[] = []): ScheduledGame[] {
  const rules = leagueClassRules(league);
  if (!rules) throw new Error(`no class rules for ${league.state} ${league.className}`);
  return generateClassSchedule(classDistrictsOf(league, teams), rules, year, { reservedWeeks });
}

/**
 * A class league's playoffs. Illinois' post-season classing needs every class's teams at once: a single class is
 * played by the win line (3 wins, then points) among its own teams.
 */
export function classPlayoffs(league: LeagueStructure, teams: Team[], schedule: ScheduledGame[], excludeTeamIds: string[] = []): PlayoffBracketState {
  const rules = leagueClassRules(league);
  if (!rules) throw new Error(`no class rules for ${league.state} ${league.className}`);
  return buildClassPlayoffs(classDistrictsOf(league, teams), rules, schedule, { excludeTeamIds }).bracket;
}

/** A school picked in a class built from the team data (the id is stable; names repeat within some classes). */
export interface ClassTarget {
  className: string;
  schoolId: string;
}

export function classSchoolPrestige(data: StateTeamData, target: ClassTarget): number | undefined {
  for (const d of data.classes.find((c) => c.className === target.className)?.districts ?? []) {
    const s = d.schools.find((x) => x.id === target.schoolId);
    if (s) return s.prestige;
  }
  return undefined;
}

const schoolNameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The original 12 states' hand-tuned top-class lists win: a school on one plays only in that top class, even where the
 * latest alignment (the team data) moved it to a lower class, so no school is in the world twice. California's data is
 * by section, so its Open Division schools leave their sections the same way. Matched by name, and by mascot when both
 * lists have one (Ohio's other Springfields stay). Undefined for a state without a hand-tuned list.
 */
export function onOriginalTopClass(state: string): ((school: { name: string; mascot?: string }) => boolean) | undefined {
  const data = STATE_DATA[state];
  if (!data) return undefined;
  const top = new Map(data.regions.flatMap((r) => r.districts.flatMap((d) => d.schools)).map((s) => [schoolNameKey(s.name), s.mascot.toLowerCase()]));
  return (school) => {
    const mascot = top.get(schoolNameKey(school.name));
    return mascot !== undefined && (!school.mascot || !mascot || school.mascot.toLowerCase() === mascot);
  };
}

/** A class's schools that play in it: all of them, less (in an original state) those on its hand-tuned top-class list. */
const playingSchools = (data: StateTeamData, className: string): TeamSchool[] => {
  const onTop = isLegacyClass(data.state, className) ? undefined : onOriginalTopClass(data.state);
  const all = data.classes.find((c) => c.className === className)?.districts.flatMap((d) => d.schools) ?? [];
  return onTop ? all.filter((s) => !onTop(s)) : all;
};

/** New Game's random school for a difficulty (its prestige band), or the closest programs when the class has none in it. */
export function pickClassSchool(data: StateTeamData, className: string, difficulty: 'EASY' | 'MEDIUM' | 'HARD'): TeamSchool {
  const band = { EASY: [90, 100], MEDIUM: [80, 89], HARD: [60, 79] }[difficulty];
  const all = playingSchools(data, className);
  const fits = all.filter((s) => s.prestige >= band[0] && s.prestige <= band[1]);
  const mid = (band[0] + band[1]) / 2;
  const pool = fits.length > 0 ? fits : [...all].sort((a, b) => Math.abs(a.prestige - mid) - Math.abs(b.prestige - mid)).slice(0, 3);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** A class's schools as the New Game search lists them. */
export function classSchools(data: StateTeamData, className: string): StateSchoolEntry[] {
  const playing = new Set(playingSchools(data, className));
  return (data.classes.find((c) => c.className === className)?.districts ?? []).flatMap((d) =>
    d.schools.filter((s) => playing.has(s)).map((s) => ({
      id: s.id,
      name: s.name,
      mascot: s.mascot ?? '',
      ...(s.city && { city: s.city }),
      district: d.name,
      prestige: s.prestige,
      primaryColor: s.primaryColor,
      ...(s.colorsConfirmed === false && { colorsConfirmed: false }),
      offenseScheme: s.offenseScheme,
      defenseScheme: s.defenseScheme
    }))
  );
}
