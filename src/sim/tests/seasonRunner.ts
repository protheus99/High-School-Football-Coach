import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { simulateSnap } from '../matchEngine';
import { simulateMacroMatch, teamStarterRating } from '../macroSim';
import { processPostGameSeasonWear, processWeeklyInjuryHealing, evaluateAcademicReport } from '../playerEngine';
import { buildPlayoffBracket, advancePlayoffRound } from '../playoffEngine';
import { buildCustomLeague, leagueRegionTeams } from '../league';
import { calculateSeasonAwards } from '../awardsEngine';
import { applyGameResult, simulateRegularSeason } from '../scheduleEngine';
import { advanceTeamToNextSeason } from '../offseasonEngine';
import { GameSimulationState } from '../../types/game';

/**
 * Headless Multi-Season Dynasty Simulation Runner.
 * Simulates N full years (Regular Season, Playoffs, Awards, Graduations, and Influx) in seconds.
 */
export function runDynastySimulation(numYears = 3): void {
  console.log(`=======================================================`);
  console.log(`🏈 STARTING ${numYears}-YEAR DYNASTY STRESS TEST`);
  console.log(`=======================================================`);

  const districtTeams = generateDistrictTeams();
  const userTeam = districtTeams[0];

  for (let year = 1; year <= numYears; year++) {
    const calendarYear = 2026 + year - 1;
    console.log(`\n--- SEASON ${calendarYear} (Year ${year}) ---`);

    // 1. Regular Season (Weeks 1 to 14)
    for (let week = 1; week <= 14; week++) {
      // Triage and fatigue
      userTeam.roster.forEach((p) => {
        processWeeklyInjuryHealing(p);
        processPostGameSeasonWear(p, p.depthChartTier === 1 ? 50 : 10, 'STANDARD');
        if (week % 3 === 0) evaluateAcademicReport(p);
      });

      // User game vs opponent
      const opponent = districtTeams[week % (districtTeams.length - 1) + 1];
      const userGameState: GameSimulationState = {
        gameId: `dyn_${year}_wk_${week}`,
        homeTeam: userTeam,
        awayTeam: opponent,
        homeScore: 0,
        awayScore: 0,
        weather: 'CLEAR',
        temperatureFahrenheit: 65,
        windSpeedMph: 6,
        teamMomentum: 0,
        currentQuarter: 1,
        clockSecondsRemaining: 720,
        possessionTeamId: userTeam.id,
        down: 1,
        distance: 10,
        yardLine: 25,
        isMercyRuleActive: false,
        isGameOver: false,
        eventLog: []
      };

      while (!userGameState.isGameOver) {
        simulateSnap(userGameState);
      }

      // Record result
      const won = userGameState.homeScore > userGameState.awayScore;
      userTeam.record.wins += won ? 1 : 0;
      userTeam.record.losses += won ? 0 : 1;
      userTeam.record.pointsFor += userGameState.homeScore;
      userTeam.record.pointsAgainst += userGameState.awayScore;

      // Simulate other district matches
      for (let i = 1; i < districtTeams.length; i += 2) {
        if (districtTeams[i] && districtTeams[i + 1]) {
          const box = simulateMacroMatch(`ai_${year}_wk_${week}_${i}`, week, districtTeams[i], districtTeams[i + 1]);
          applyGameResult(districtTeams[i], districtTeams[i + 1], box.homeScore, box.awayScore, true);
        }
      }
    }

    console.log(`Regular Season Complete: ${userTeam.name} finished ${userTeam.record.wins}-${userTeam.record.losses}`);

    // 2. State Playoffs (Weeks 15 to 18)
    // The user's district plus three generated districts form a 16-team bracket
    const world = buildCustomLeague(districtTeams, 'Runner District');
    const regions = leagueRegionTeams(world.league, world.teams);
    simulateRegularSeason([[regions[0][1]], regions[1]], calendarYear); // the user's district already played
    let playoffBracket = buildPlayoffBracket(
      world.league.regions.map((region, i) => ({ name: region.name, districts: regions[i] })),
      { splitDivisions: false }
    );
    while (playoffBracket.isPlayoffsActive) {
      playoffBracket = advancePlayoffRound(playoffBracket);
    }

    console.log(`Playoffs Finished. State Champion: ${playoffBracket.divisions[0].championTeamId || 'Decided'}`);

    // 3. Postseason Awards
    const awards = calculateSeasonAwards(calendarYear, districtTeams);
    console.log(`MVP: ${awards.mrFootballStateMVP.player.firstName} ${awards.mrFootballStateMVP.player.lastName} (${awards.mrFootballStateMVP.teamName})`);

    // 4. Off-Season & Graduation (every program)
    districtTeams.forEach((team) => advanceTeamToNextSeason(team));
    console.log(`Off-season: ${userTeam.name} starters average ${teamStarterRating(userTeam).toFixed(1)} OVR`);

    // Reset records
    districtTeams.forEach((t) => {
      t.record = { wins: 0, losses: 0, districtWins: 0, districtLosses: 0, pointsFor: 0, pointsAgainst: 0, districtPointDifferential: 0, headToHeadHistory: {} };
    });
  }

  console.log(`\n=======================================================`);
  console.log(`✅ DYNASTY SIMULATION SUCCESSFUL: All ${numYears} years executed.`);
  console.log(`=======================================================`);
}
