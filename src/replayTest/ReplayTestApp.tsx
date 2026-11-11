// PLAYTEST ONLY: /?replaytest opens the real live match screen on a fresh game between two district teams, on the
// match page (the board, the field, the plan boxes and the controls fit a phone; Stats, Other scores and Options slide
// up from the bottom), with the playtest's injury and flag switches in Options.
import React, { useState } from 'react';
import { LiveMatchScreen } from '../components/LiveMatchScreen';
import { generateDistrictTeams } from '../generators/rosterGenerator';
import { GameSimulationState } from '../types/game';
import { MatchOptionsProvider } from './MatchOptionsProvider';

const freshGame = (): GameSimulationState => {
  const [home, away] = generateDistrictTeams();
  // (?replaytest&home=Cincinnati Archbishop Moeller: try a school name, e.g. a long one)
  const name = new URLSearchParams(window.location.search).get('home');
  if (name) home.name = name;
  return {
    gameId: `replay-${Date.now()}`, homeTeam: home, awayTeam: away, homeScore: 0, awayScore: 0, weather: 'CLEAR',
    temperatureFahrenheit: 64, windSpeedMph: 6, teamMomentum: 0, currentQuarter: 1, clockSecondsRemaining: 720,
    possessionTeamId: away.id, down: 1, distance: 10, yardLine: 25, isMercyRuleActive: false, isGameOver: false, eventLog: []
  } as GameSimulationState;
};

export const ReplayTestApp: React.FC = () => {
  const [game, setGame] = useState(freshGame);
  return (
    <MatchOptionsProvider storageKey="replayGame.options" playtest>
      <LiveMatchScreen key={game.gameId} initialState={game} userTeamId={game.homeTeam.id} onExit={() => setGame(freshGame())} />
    </MatchOptionsProvider>
  );
};
