import { Team } from '../types/game';

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
