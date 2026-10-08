import { DefensiveCall, DefensiveScheme, OffensiveScheme, WeatherType } from '../types/game';
import {
  DEFENSIVE_CALL_MODIFIERS,
  DEFENSIVE_SCHEME_MODIFIERS,
  OFFENSIVE_SCHEME_MODIFIERS,
  OFFENSIVE_SCHEME_STYLE,
  SCHEME_EFFECT_SCALE,
  schemeCounterBonus
} from './matchEngine';

/** The coach's defensive plan for a game: Balanced lets the staff call it by down and distance. */
export type DefensiveFocus = 'BALANCED' | 'STOP_RUN' | 'STOP_PASS' | 'BLITZ';

/** The call the defense makes on every snap the staff calls; Balanced has none (the staff picks by situation). */
export const FOCUS_CALL: Record<DefensiveFocus, DefensiveCall | undefined> = {
  BALANCED: undefined,
  STOP_RUN: 'RUN_BLITZ',
  STOP_PASS: 'PASS_COVERAGE',
  BLITZ: 'BLITZ'
};

export const FOCUS_NAMES: Record<DefensiveFocus, string> = { BALANCED: 'Balanced', STOP_RUN: 'Stop Run', STOP_PASS: 'Stop Pass', BLITZ: 'Blitz' };

/** The plan a game is running: a fixed call maps back to its plan; no call (or an old save's base call) is Balanced. */
export function focusFromCall(call: DefensiveCall | undefined): DefensiveFocus {
  return call === 'RUN_BLITZ' ? 'STOP_RUN' : call === 'PASS_COVERAGE' ? 'STOP_PASS' : call === 'BLITZ' ? 'BLITZ' : 'BALANCED';
}

export const OFFENSE_NAMES: Record<OffensiveScheme, string> = { TRIPLE_OPTION: 'Triple Option', POWER_I: 'Power I', SPREAD: 'Spread', AIR_RAID: 'Air Raid' };
export const OFFENSE_STYLES: Record<OffensiveScheme, string> = { TRIPLE_OPTION: 'Run-heavy', POWER_I: 'Run-first', SPREAD: 'Pass-first', AIR_RAID: 'Pass-heavy' };
export const DEFENSE_NAMES: Record<DefensiveScheme, string> = { FOUR_THREE: '4-3', FOUR_FOUR: '4-4', THREE_THREE_FIVE: '3-3-5', DROP_EIGHT: 'Drop 8' };
export const DEFENSE_STYLES: Record<DefensiveScheme, string> = { FOUR_THREE: 'balanced', FOUR_FOUR: 'heavy box', THREE_THREE_FIVE: 'light box', DROP_EIGHT: 'deep coverage' };

const OFFENSE_NOTES: Record<OffensiveScheme, string> = {
  TRIPLE_OPTION: 'Option runs to the edge, few passes.',
  POWER_I: 'Downhill inside runs, some play-action.',
  SPREAD: 'Quick passing game with balanced runs.',
  AIR_RAID: 'Passes the most, with the most deep shots.'
};
export const DEFENSE_FOCUS_NOTES: Record<DefensiveFocus, string> = {
  BALANCED: 'Your coordinator mixes calls by down and distance.',
  STOP_RUN: 'Run blitz every snap: runs stopped, passes wide open.',
  STOP_PASS: 'Coverage every snap: passes shut down, runs find room.',
  BLITZ: 'Extra rushers every snap: more sacks and turnovers, but deep passes get behind you.'
};

/** An arrow strength: 0 even, 1 an edge, 2 a big edge (negative when it's against you). */
export type ArrowLevel = -2 | -1 | 0 | 1 | 2;
const arrows = (edge: number, small: number, big: number): ArrowLevel => {
  const level = Math.abs(edge) >= big ? 2 : Math.abs(edge) >= small ? 1 : 0;
  return (level === 0 ? 0 : Math.sign(edge) * level) as ArrowLevel;
};

/** How often a playbook passes on an ordinary down (the engine's base 45%, scaled by the playbook, capped at 90%). */
const passShare = (scheme: OffensiveScheme) => Math.min(0.9, 0.45 * OFFENSIVE_SCHEME_STYLE[scheme].passRate);

/**
 * A playbook's edge against their defense, in the engine's play-quality points (the same scheme, counter and weather
 * modifiers it plays with, damped the same way): runs and passes, each weighted by the playbook's own mix.
 */
export function offenseMatchup(scheme: OffensiveScheme, theirDefense: DefensiveScheme, weather: WeatherType = 'CLEAR') {
  const style = OFFENSIVE_SCHEME_STYLE[scheme];
  const edge = (concept: 'INSIDE_RUN' | 'OUTSIDE_RUN' | 'SHORT_PASS' | 'DEEP_PASS') => {
    const isPass = concept === 'SHORT_PASS' || concept === 'DEEP_PASS';
    const rain = isPass && weather === 'HEAVY_RAIN' && (scheme === 'AIR_RAID' || scheme === 'SPREAD') ? -5 : 0;
    return (OFFENSIVE_SCHEME_MODIFIERS[scheme][concept] + DEFENSIVE_SCHEME_MODIFIERS[theirDefense][concept] + schemeCounterBonus(scheme, theirDefense, isPass) + rain) * SCHEME_EFFECT_SCALE;
  };
  const run = edge('INSIDE_RUN') * style.insideShare + edge('OUTSIDE_RUN') * (1 - style.insideShare);
  const pass = edge('DEEP_PASS') * style.deepShare + edge('SHORT_PASS') * (1 - style.deepShare);
  const overall = run * (1 - passShare(scheme)) + pass * passShare(scheme);
  return { run, pass, overall, runArrows: arrows(run, 1, 2.5), passArrows: arrows(pass, 1, 2.5) };
}

/** The playbook with the best matchup against their defense, if one stands out. */
export function bestOffense(theirDefense: DefensiveScheme, weather: WeatherType = 'CLEAR'): OffensiveScheme | null {
  const ranked = (Object.keys(OFFENSE_NAMES) as OffensiveScheme[]).map((s) => ({ s, m: offenseMatchup(s, theirDefense, weather) })).sort((a, b) => b.m.overall - a.m.overall);
  // A star only where the arrows show it too (a hair's edge with even arrows would just confuse)
  const top = ranked[0];
  return top.m.overall >= 0.5 && (top.m.runArrows > 0 || top.m.passArrows > 0) ? top.s : null;
}

/**
 * A defensive plan from your side: how much it slows their runs and passes (the engine's call modifiers, flipped).
 * Blitz trades deep passes for pressure, so its pass arrow is about the deep ball.
 */
export function defenseFocusArrows(focus: DefensiveFocus): { run: ArrowLevel; pass: ArrowLevel; passLabel: 'Pass' | 'Deep' } | null {
  const call = FOCUS_CALL[focus];
  if (!call) return null;
  const m = DEFENSIVE_CALL_MODIFIERS[call];
  const run = -(m.INSIDE_RUN + m.OUTSIDE_RUN) / 2;
  if (call === 'BLITZ') return { run: arrows(run, 2, 4), pass: arrows(-m.DEEP_PASS, 2, 4), passLabel: 'Deep' };
  return { run: arrows(run, 2, 4), pass: arrows(-(m.SHORT_PASS + m.DEEP_PASS) / 2, 2, 4), passLabel: 'Pass' };
}

/** The defensive plan that fits their offense: stop the pass against a passing team, the run against a running one. */
export const fitsTheirOffense = (theirOffense: OffensiveScheme): DefensiveFocus => (OFFENSIVE_SCHEME_STYLE[theirOffense].passRate > 1 ? 'STOP_PASS' : 'STOP_RUN');

/** The note under the offense boxes: what the playbook is, and how it fares against them. */
export function offenseNote(scheme: OffensiveScheme, usual: OffensiveScheme, theirDefense: DefensiveScheme, weather: WeatherType = 'CLEAR'): string {
  const m = offenseMatchup(scheme, theirDefense, weather);
  const vs = DEFENSE_NAMES[theirDefense];
  const verdict =
    m.overall >= 1.5 ? `A strong matchup against their ${vs}.` : m.overall >= 0.5 ? `An edge against their ${vs}.` : m.overall <= -0.3 ? `Their ${vs} is built to stop it.` : `An even matchup against their ${vs}.`;
  return `${scheme === usual ? 'Your usual. ' : ''}${OFFENSE_NOTES[scheme]} ${verdict}`;
}
