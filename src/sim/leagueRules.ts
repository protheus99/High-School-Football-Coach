import { estimatedClassRounds, leagueClassRules } from './classLeague';
import type { ClassRules } from './classRules';
import { fitRoundNames } from './classSeason';
import { bracketRoundNames, PlayoffRound } from './playoffEngine';
import { districtPlayoffSpots, playoffQualifyText, rulesForState, StateRules } from './stateRules';

// ---------------------------------------------------------------------------
// What the screens read about the coach's league. An original top class uses its hand-tuned StateRules; a class built
// from the team data takes its class's own names (governing body, class, what it calls a district, the title game) on
// top of its state's game rules (academics, overtime, mercy rule: the other 18 states borrow Texas' until they have
// their own).
// ---------------------------------------------------------------------------

type LeagueLike = { state?: string; className?: string } | null | undefined;

const GENERIC_ROUND_NOTE = 'Win and advance.';

export function rulesForLeague(league: LeagueLike): StateRules {
  const base = rulesForState(league?.state);
  const rules = leagueClassRules(league as never);
  if (!rules) return base;
  // The class's own round names ('Round of 32' ... 'Substate'), on the rounds its playoffs are expected to have; once the
  // field is set, the bracket carries its own (bracketRoundLabel)
  const count = estimatedClassRounds(rules);
  const names = fitRoundNames(rules.playoffs.rounds, count);
  const roundLabels = { ...base.playoffs.roundLabels };
  bracketRoundNames(count).forEach((round, i) => (roundLabels[round] = names[i]));
  return {
    ...base,
    governingBody: (rules.governingBody || base.governingBody) as StateRules['governingBody'],
    classification: rules.className,
    districtLabel: rules.districtLabel,
    playoffs: {
      ...base.playoffs,
      roundLabels,
      championshipTitle: rules.playoffs.championshipTitle,
      championshipVenue: rules.playoffs.championshipVenue ?? 'the state championship site',
      roundDescriptions: Object.fromEntries(Object.keys(base.playoffs.roundDescriptions).map((k) => [k, GENERIC_ROUND_NOTE])) as Record<PlayoffRound, string>
    }
  };
}

/** Standings places that are a guaranteed playoff spot in a district (the top N, the champion, or none for a ranking). */
export function leaguePlayoffSpots(league: LeagueLike): number {
  const rules = leagueClassRules(league as never);
  if (!rules) return districtPlayoffSpots(rulesForState(league?.state));
  const p = rules.playoffs;
  if (p.format === 'DISTRICT_FINISH') return p.qualifiersPerDistrict ?? 2;
  return p.championsSeededFirst || p.format === 'SECTIONAL' ? 1 : 0;
}

function classQualifyText(rules: ClassRules): string {
  const { playoffs: p, districtLabel } = rules;
  const label = districtLabel.toLowerCase();
  const field = p.fieldSize ? ` The field is ${p.fieldSize} teams.` : '';
  switch (p.format) {
    case 'DISTRICT_FINISH':
      return `The top ${p.qualifiersPerDistrict ?? 2} in each ${label} make the playoffs.${field}`;
    case 'SECTIONAL':
      return `Each ${label} plays down to a champion, and the champions meet in the state rounds.`;
    case 'REGIONAL_SEEDED':
      return `Playoff regions seed their own brackets (${p.selection === 'DISTRICT_FINISH' ? `by ${label} finish` : 'by the power ranking'}), then the region winners meet statewide.${field}`;
    case 'FALLBACK':
      return `The best teams by rating play a short playoff.${field}`;
    default:
      return p.selection === 'WIN_THRESHOLD'
        ? `${p.winThreshold ?? 3} wins qualify, then wins and playoff points fill the field.${field}`
        : `A statewide ${p.selection === 'POINTS' ? 'points system' : 'power ranking'} picks the field.${p.championsSeededFirst ? ` ${districtLabel} champions take top seeds.` : ''}${field}`;
  }
}

/** One sentence on how a team makes the playoffs (standings, Hub). */
export function leagueQualifyText(league: LeagueLike): string {
  const rules = leagueClassRules(league as never);
  return rules ? classQualifyText(rules) : playoffQualifyText(rulesForState(league?.state));
}
