import { FeederProspect, Team } from '../types/game';
import { randomInt } from './math/variance';

const FEEDER_SCHOOLS = ['Hill Country MS', 'West Ridge MS', 'Hudson Bend MS', 'Barton Creek MS'];
const POSITIONS = ['QB', 'RB', 'WR', 'OT', 'DE', 'LB', 'CB', 'S'] as const;

export function generateMiddleSchoolProspects(count = 8): FeederProspect[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ms_prospect_${Date.now()}_${i}`,
    name: `Prospect ${i + 1}`,
    middleSchool: FEEDER_SCHOOLS[randomInt(0, FEEDER_SCHOOLS.length - 1)],
    projectedPosition: POSITIONS[randomInt(0, POSITIONS.length - 1)],
    revealedPotential: 'UNKNOWN',
    scoutedSpeed: null,
    scoutedStrength: null,
    interestScore: randomInt(35, 75),
    isTransferRisk: Math.random() > 0.85
  }));
}

/**
 * Processes College Offers for standouts during Saturday review.
 */
export function evaluateCollegeScoutExposure(team: Team, week: number): void {
  team.roster.forEach((player) => {
    if (player.classYear === 'Junior' || player.classYear === 'Senior') {
      if (player.overallRating >= 88 && player.recruiting.offers.length < 4) {
        player.recruiting.offers.push({
          collegeName: 'Texas Longhorns',
          tier: 'POWER_4',
          offerDateWeek: week
        });
      } else if (player.overallRating >= 80 && player.recruiting.offers.length < 2) {
        player.recruiting.offers.push({
          collegeName: 'Boise State Broncos',
          tier: 'GROUP_OF_5',
          offerDateWeek: week
        });
      }
    }
  });
}
