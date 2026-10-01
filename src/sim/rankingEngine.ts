import { Team } from '../types/game';
import { clamp } from './math/variance';

export interface PrestigeBreakdown {
  historicalAnchor: number;
  rollingPerformance: number;
  facilitiesScore: number;
  alumniScore: number;
  coachScore: number;
  compositePPI: number;
}

/**
 * Calculates the Program Prestige Index (PPI: 0–100) for any high school program.
 */
export function calculateProgramPrestige(
  team: Team,
  historicalAnchor: number,
  threeYearWinPct: number,
  alumniSigningsLast3Years: number
): PrestigeBreakdown {
  const rollingPerformance = clamp(Math.round(threeYearWinPct * 100), 20, 99);
  const facilitiesScore = clamp(team.prestige + 5, 20, 99);
  const alumniScore = clamp(alumniSigningsLast3Years * 12 + 25, 20, 99);
  const coachScore = clamp(team.staff.reputation, 30, 99);

  const compositePPI = Math.round(
    0.35 * historicalAnchor +
    0.30 * rollingPerformance +
    0.15 * facilitiesScore +
    0.10 * alumniScore +
    0.10 * coachScore
  );

  return {
    historicalAnchor,
    rollingPerformance,
    facilitiesScore,
    alumniScore,
    coachScore,
    compositePPI: clamp(compositePPI, 20, 99)
  };
}

/**
 * Calculates whether a prospect commits to School A (Powerhouse) vs School B (Underdog/Builder).
 */
export function evaluateProspectCommitment(
  prospect: { starRating: number; wantsEarlyPlay: boolean; preferredScheme: string },
  schoolA: { ppi: number; starterAtPositionRating: number; scheme: string },
  schoolB: { ppi: number; starterAtPositionRating: number; scheme: string }
): 'SCHOOL_A' | 'SCHOOL_B' {
  const calcScore = (school: typeof schoolA) => {
    let score = school.ppi * 0.40;

    // Playing time calculation: if existing starter is weak or absent, score is high
    const startingOpportunity = clamp(100 - (school.starterAtPositionRating - 45) * 2, 10, 95);
    score += startingOpportunity * (prospect.wantsEarlyPlay ? 0.40 : 0.20);

    // Scheme alignment
    if (prospect.preferredScheme === school.scheme) {
      score += 15;
    }

    return score;
  };

  const scoreA = calcScore(schoolA);
  const scoreB = calcScore(schoolB);

  return scoreA >= scoreB ? 'SCHOOL_A' : 'SCHOOL_B';
}

/**
 * Dynamic Underdog Growth: Awards booster and prestige momentum following a signature upset win.
 */
export function applyUpsetGrowthSurge(underdog: Team, favoritePPI: number): void {
  const ppiDelta = favoritePPI - underdog.prestige;

  if (ppiDelta >= 15) {
    // Substantial upset (15+ point prestige gap)
    underdog.programMeters.boosterApproval = clamp(underdog.programMeters.boosterApproval + 20, 0, 100);
    underdog.programMeters.schoolBoardTrust = clamp(underdog.programMeters.schoolBoardTrust + 15, 0, 100);
    underdog.prestige = clamp(underdog.prestige + 3, 20, 99);
  }
}
