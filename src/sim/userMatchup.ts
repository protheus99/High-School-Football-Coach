import { ScheduledGame, Team } from '../types/game';
import { getTeamGameForWeek } from './scheduleEngine';
import { currentRound, findUserNode, PlayoffBracketState, ROUND_LABELS } from './playoffEngine';

export interface UserMatchup {
  gameId: string;
  home: Team;
  away: Team;
  label: string; // "District game", "Non-district game", "Division 1 Bi-District"...
  isPlayoff: boolean;
  isPlayed: boolean;
  homeScore?: number;
  awayScore?: number;
}

/** The user's game this week: their scheduled game, or their current playoff game while they are alive. */
export function getUserMatchup(state: {
  currentWeek: number;
  seasonSchedule: ScheduledGame[];
  leagueTeams: Team[];
  userTeamId: string;
  playoffBracket: PlayoffBracketState | null;
}): UserMatchup | undefined {
  const { playoffBracket, userTeamId } = state;
  if (playoffBracket?.isPlayoffsActive) {
    const found = findUserNode(playoffBracket, userTeamId);
    if (!found) return undefined;
    const { node, division } = found;
    const divisionLabel = playoffBracket.divisions.length > 1 ? `${division.name} ` : '';
    return {
      gameId: `po_${node.matchupId}`,
      home: node.team1,
      away: node.team2,
      label: `${divisionLabel}${ROUND_LABELS[currentRound(playoffBracket)]}`,
      isPlayoff: true,
      isPlayed: node.winnerTeamId !== undefined,
      homeScore: node.team1Score,
      awayScore: node.team2Score
    };
  }

  const scheduled = getTeamGameForWeek(state.seasonSchedule, state.currentWeek, userTeamId);
  if (!scheduled) return undefined;
  const home = state.leagueTeams.find((t) => t.id === scheduled.homeTeamId);
  const away = state.leagueTeams.find((t) => t.id === scheduled.awayTeamId);
  if (!home || !away) return undefined;
  return {
    gameId: scheduled.gameId,
    home,
    away,
    label: scheduled.isDistrictGame ? 'District game' : 'Non-district game',
    isPlayoff: false,
    isPlayed: scheduled.homeScore !== undefined,
    homeScore: scheduled.homeScore,
    awayScore: scheduled.awayScore
  };
}
