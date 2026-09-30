import { Player, Team } from '../types/game';

export interface AwardWinner {
  awardTitle: string;
  player: Player;
  teamName: string;
  statHeadline: string;
}

export interface SeasonAwardsRecord {
  year: number;
  mrFootballStateMVP: AwardWinner;
  offensivePlayerOfTheYear: AwardWinner;
  defensivePlayerOfTheYear: AwardWinner;
  coachOfTheYear: { coachName: string; teamName: string; record: string };
  allStateFirstTeam: AwardWinner[];
}

/**
 * Calculates end-of-season All-State & District awards across all teams.
 */
export function calculateSeasonAwards(year: number, allTeams: Team[]): SeasonAwardsRecord {
  const allPlayers: { player: Player; team: Team }[] = [];
  allTeams.forEach((t) => {
    t.roster.forEach((p) => allPlayers.push({ player: p, team: t }));
  });

  // 1. Sort by stats & overall impact
  const topRushers = [...allPlayers]
    .filter((entry) => entry.player.position === 'RB')
    .sort((a, b) => b.player.stats.rushYards - a.player.stats.rushYards);

  const topPassers = [...allPlayers]
    .filter((entry) => entry.player.position === 'QB')
    .sort((a, b) => b.player.stats.passYards + b.player.stats.passTDs * 20 - (a.player.stats.passYards + a.player.stats.passTDs * 20));

  const topDefenders = [...allPlayers]
    .filter((entry) => ['LB', 'DE', 'DT', 'CB', 'S'].includes(entry.player.position))
    .sort((a, b) => b.player.stats.tackles + b.player.stats.sacks * 4 - (a.player.stats.tackles + a.player.stats.sacks * 4));

  const mvpEntry = topPassers[0] || allPlayers[0];
  const offEntry = topRushers[0] || allPlayers[1];
  const defEntry = topDefenders[0] || allPlayers[2];

  // 2. Coach of the Year (best record / prestige ratio)
  const bestTeam = [...allTeams].sort((a, b) => b.record.wins - a.record.wins)[0];

  const allStateFirstTeam: AwardWinner[] = [
    {
      awardTitle: 'All-State 1st Team QB',
      player: mvpEntry.player,
      teamName: mvpEntry.team.name,
      statHeadline: `${mvpEntry.player.stats.passYards} Yds, ${mvpEntry.player.stats.passTDs} TD`
    },
    {
      awardTitle: 'All-State 1st Team RB',
      player: offEntry.player,
      teamName: offEntry.team.name,
      statHeadline: `${offEntry.player.stats.rushYards} Yds, ${offEntry.player.stats.rushTDs} TD`
    },
    {
      awardTitle: 'All-State 1st Team LB',
      player: defEntry.player,
      teamName: defEntry.team.name,
      statHeadline: `${defEntry.player.stats.tackles} Tkls, ${defEntry.player.stats.sacks} Sacks`
    }
  ];

  return {
    year,
    mrFootballStateMVP: {
      awardTitle: 'Mr. Football (State MVP)',
      player: mvpEntry.player,
      teamName: mvpEntry.team.name,
      statHeadline: `${mvpEntry.player.stats.passYards} Yds, ${mvpEntry.player.stats.passTDs} TDs`
    },
    offensivePlayerOfTheYear: {
      awardTitle: 'Offensive Player of the Year',
      player: offEntry.player,
      teamName: offEntry.team.name,
      statHeadline: `${offEntry.player.stats.rushYards} Rush Yds, ${offEntry.player.stats.rushTDs} TDs`
    },
    defensivePlayerOfTheYear: {
      awardTitle: 'Defensive Player of the Year',
      player: defEntry.player,
      teamName: defEntry.team.name,
      statHeadline: `${defEntry.player.stats.tackles} Tackles, ${defEntry.player.stats.sacks} Sacks`
    },
    coachOfTheYear: {
      coachName: bestTeam.staff.headCoachName,
      teamName: bestTeam.name,
      record: `${bestTeam.record.wins}-${bestTeam.record.losses}`
    },
    allStateFirstTeam
  };
}
