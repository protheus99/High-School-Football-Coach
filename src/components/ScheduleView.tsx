import React from 'react';
import { useGameStore } from '../store/gameStore';
import {
  FEEDER_SIGNING_WEEK,
  getSeasonPhase,
  getTeamGameForWeek,
  LAST_REGULAR_SEASON_WEEK,
  LAST_TRAINING_CAMP_WEEK,
  SEASON_PHASE_LABELS,
  SeasonPhase
} from '../sim/scheduleEngine';

/** What happens in a week without a game. */
function weekNote(week: number, phase: SeasonPhase, isLastWeek: boolean, signingThisSeason: boolean, roundDescription?: string): string {
  switch (phase) {
    case 'SPRING_EVALUATION':
      // A new game's first season has no signing day: its rosters already hold this year's freshmen
      if (signingThisSeason && week < FEEDER_SIGNING_WEEK) return 'Final feeder visits before signing day';
      if (signingThisSeason && week === FEEDER_SIGNING_WEEK) return '✍️ Feeder signing day: prospects pick their school';
      return 'New student enrollment · College recruiting';
    case 'SUMMER_CAMP':
      return week === LAST_TRAINING_CAMP_WEEK ? '📋 Depth chart set for the season' : 'High intensity training';
    case 'STATE_PLAYOFFS':
      return roundDescription ?? 'Playoff round';
    case 'POST_SEASON':
      return '🎓 Seniors graduation and signing';
    case 'OFF_SEASON':
      return isLastWeek ? 'The new school year begins as the week ends' : '🔍 Feeder clinics, 7-on-7 nights and tryouts';
    default:
      return 'Bye week';
  }
}
import { findDistrict, playoffRoundCount, seasonLength } from '../sim/league';
import { leagueRoundNames } from '../sim/playoffEngine';
import { rulesForState } from '../sim/stateRules';
import { Team } from '../types/game';

export const ScheduleView: React.FC = () => {
  const { currentWeek, districtTeams, leagueTeams, league, seasonSchedule, playoffBracket, userTeamId, currentYear, feederClassYear, openTeamProfile } = useGameStore();
  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  if (!userTeam) return null;

  const totalWeeks = league ? seasonLength(league) : 20;
  const playoffRounds = league ? playoffRoundCount(league) : 6;
  // The state's round names for the playoff weeks (Texas: Bi-District ... State Championship; Georgia: First Round ... State Championship)
  const { roundLabels: ROUND_LABELS, roundDescriptions: ROUND_DESCRIPTIONS } = rulesForState(league?.state).playoffs;
  const leagueRounds = league ? leagueRoundNames(league) : [];
  const districtName = league ? findDistrict(league, userTeamId)?.name : undefined;

  // Season built from the stored schedule, plus the user's playoff games from the bracket
  const schedule = Array.from({ length: totalWeeks }, (_, i) => {
    const weekNum = i + 1;
    const roundIndex = weekNum - LAST_REGULAR_SEASON_WEEK - 1;
    const base = { week: weekNum, type: getSeasonPhase(weekNum, playoffRounds), isCurrent: weekNum === currentWeek, isCompleted: weekNum < currentWeek };

    if (roundIndex >= 0 && playoffBracket) {
      const node = playoffBracket.divisions
        .map((d) => d.rounds[roundIndex]?.find((n) => n.team1.id === userTeamId || n.team2.id === userTeamId))
        .find(Boolean);
      const isHome = node?.team1.id === userTeamId;
      const opponent: Team | null = node ? (isHome ? node.team2 : node.team1) : null;
      const userScore = isHome ? node?.team1Score : node?.team2Score;
      const opponentScore = isHome ? node?.team2Score : node?.team1Score;
      return {
        ...base,
        label: playoffBracket.roundNames[roundIndex] ? ROUND_LABELS[playoffBracket.roundNames[roundIndex]] : leagueRounds[roundIndex] && ROUND_LABELS[leagueRounds[roundIndex]],
        opponent,
        isHome,
        result: node?.winnerTeamId ? `${node.winnerTeamId === userTeamId ? 'W' : 'L'} ${userScore}-${opponentScore}` : null
      };
    }

    const scheduled = getTeamGameForWeek(seasonSchedule, weekNum, userTeamId);
    const isHome = scheduled?.homeTeamId === userTeamId;
    const opponentId = scheduled && (isHome ? scheduled.awayTeamId : scheduled.homeTeamId);
    const played = scheduled?.homeScore !== undefined;
    const userScore = isHome ? scheduled?.homeScore : scheduled?.awayScore;
    const opponentScore = isHome ? scheduled?.awayScore : scheduled?.homeScore;

    return {
      ...base,
      label: roundIndex >= 0 && roundIndex < playoffRounds ? ROUND_LABELS[leagueRounds[roundIndex]] : (undefined as string | undefined),
      opponent: leagueTeams.find((t) => t.id === opponentId) ?? null,
      isHome,
      result: !played
        ? null
        : scheduled!.forfeitedByTeamId === userTeamId
          ? 'L (forfeit)'
          : scheduled!.forfeitedByTeamId
            ? 'W (forfeit)'
            : `${userScore! > opponentScore! ? 'W' : 'L'} ${userScore}-${opponentScore}`
    };
  });

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto' }}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: '17px' }}>{totalWeeks}-week schedule</h3>
      <p className="ui-muted" style={{ margin: '0 0 10px 0' }}>
        Pre season and feeder signing day, training camp, non-district tune-ups, the {districtName ?? 'district'} race, the state playoffs and
        the off season.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {schedule.map((game, i) => (
          <React.Fragment key={game.week}>
            {/* A header where each phase begins */}
            {(i === 0 || schedule[i - 1].type !== game.type) && (
              <h4 style={{ margin: i === 0 ? '0' : '10px 0 0', fontSize: '13px', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {SEASON_PHASE_LABELS[game.type].replace('District', rulesForState(league?.state).districtLabel)}{' '}
                <span style={{ color: '#94A3B8', fontWeight: 'normal' }}>
                  · {(() => {
                    const last = schedule.filter((g) => g.type === game.type).pop()!.week;
                    return last === game.week ? `Week ${game.week}` : `Weeks ${game.week}–${last}`;
                  })()}
                </span>
              </h4>
            )}
            <div
              style={{
                padding: '10px 12px',
                background: game.isCurrent ? '#EFF6FF' : '#fff',
                border: game.isCurrent ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                borderRadius: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'nowrap' }}>
                <span style={{ fontSize: '14px' }}>
                  <strong>Week {game.week}</strong>
                  {game.label && <span style={{ color: '#64748B', fontSize: '13px' }}> · {game.label}</span>}
                </span>
                {game.result && <strong style={{ color: game.result.startsWith('W') ? '#059669' : '#DC2626', fontSize: '14px' }}>{game.result}</strong>}
              </div>
              {game.opponent ? (
                <div style={{ fontSize: '14px', marginTop: '2px' }}>
                  {game.isHome ? 'vs.' : 'at'}{' '}
                  <button onClick={() => openTeamProfile(game.opponent!.id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                    <strong style={{ color: game.opponent.primaryColor, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                      {game.opponent.name} {game.opponent.mascot}
                    </strong>
                  </button>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    {game.opponent.record.wins}-{game.opponent.record.losses} · {game.opponent.schemeOffense.replace(/_/g, ' ')} offense
                  </div>
                </div>
              ) : (
                <div style={{ color: '#64748B', fontSize: '13px', marginTop: '2px' }}>{weekNote(
                    game.week,
                    game.type,
                    game.week === totalWeeks,
                    currentYear >= feederClassYear,
                    leagueRounds[game.week - LAST_REGULAR_SEASON_WEEK - 1] && ROUND_DESCRIPTIONS[leagueRounds[game.week - LAST_REGULAR_SEASON_WEEK - 1]]
                  )}</div>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
