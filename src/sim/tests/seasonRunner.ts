import { generateDistrictTeams, generateProceduralPlayer } from '../../generators/rosterGenerator';
import { simulateSnap } from '../matchEngine';
import { simulateMacroMatch } from '../macroSim';
import { processOffSeasonProgression, processPostGameSeasonWear, processWeeklyInjuryHealing, evaluateAcademicReport } from '../playerEngine';
import { buildInitialPlayoffBracket, advancePlayoffRound } from '../playoffEngine';
import { calculateSeasonAwards } from '../awardsEngine';
import { applyGameResult } from '../scheduleEngine';
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
    const districtB = generateDistrictTeams('tx_6a_d27');
    let playoffBracket = buildInitialPlayoffBracket(districtTeams, districtB);

    while (playoffBracket.isPlayoffsActive) {
      playoffBracket = advancePlayoffRound(playoffBracket, userTeam.id, { homeScore: 28, awayScore: 21 });
    }

    console.log(`Playoffs Finished. State Champion: ${playoffBracket.stateChampionTeamId || 'Decided'}`);

    // 3. Postseason Awards
    const awards = calculateSeasonAwards(calendarYear, districtTeams);
    console.log(`MVP: ${awards.mrFootballStateMVP.player.firstName} ${awards.mrFootballStateMVP.player.lastName} (${awards.mrFootballStateMVP.teamName})`);

    // 4. Off-Season & Graduation
    const graduated = userTeam.roster.filter((p) => p.classYear === 'Senior');
    userTeam.roster = userTeam.roster.filter((p) => p.classYear !== 'Senior');

    userTeam.roster.forEach((p) => {
      if (p.classYear === 'Junior') p.classYear = 'Senior';
      else if (p.classYear === 'Sophomore') p.classYear = 'Junior';
      else if (p.classYear === 'Freshman') p.classYear = 'Sophomore';

      processOffSeasonProgression(p, userTeam.staff.strengthCoach.conditioningRating);
    });

    // Influx Freshmen
    for (let f = 0; f < graduated.length; f++) {
      userTeam.roster.push(generateProceduralPlayer('WR', 'Freshman', 2));
    }

    // Reset records
    districtTeams.forEach((t) => {
      t.record = { wins: 0, losses: 0, districtWins: 0, districtLosses: 0, pointsFor: 0, pointsAgainst: 0, districtPointDifferential: 0, headToHeadHistory: {} };
    });
  }

  console.log(`\n=======================================================`);
  console.log(`✅ DYNASTY SIMULATION SUCCESSFUL: All ${numYears} years executed.`);
  console.log(`=======================================================`);
}
