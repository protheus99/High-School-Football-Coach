import { Team } from '../types/game';

export interface NewsArticle {
  id: string;
  week: number;
  outlet: 'TOWN_JOURNAL' | 'STATE_SPORTS_CENTRAL' | 'PREP_GRIDIRON_TALK' | 'STUDENT_VOICE';
  headline: string;
  content: string;
  impactSentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  featuredPlayerName?: string;
  featuredTeamName?: string;
}

export function generateWeeklyNewsStream(
  week: number,
  userTeam: Team,
  lastGameResult?: { opponent: Team; userScore: number; oppScore: number },
  scandalDilemmaTitle?: string
): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const starPlayer = userTeam.roster.find((p) => p.depthChartTier === 1 && p.overallRating >= 80) || userTeam.roster[0];

  // 1. Post-Game Recap Headline
  if (lastGameResult) {
    const won = lastGameResult.userScore > lastGameResult.oppScore;
    const margin = Math.abs(lastGameResult.userScore - lastGameResult.oppScore);

    if (won) {
      if (margin >= 35) {
        articles.push({
          id: `news_gm_${week}_1`,
          week,
          outlet: 'TOWN_JOURNAL',
          headline: `${userTeam.name.toUpperCase()} DELIVERS STATEMENT BLOWOUT OVER ${lastGameResult.opponent.name.toUpperCase()}`,
          content: `In a dominant Friday night performance, Coach ${userTeam.staff.headCoachName}'s squad triggered the 35-point mercy rule, cruising to a ${lastGameResult.userScore}-${lastGameResult.oppScore} victory.`,
          impactSentiment: 'POSITIVE',
          featuredTeamName: userTeam.name
        });
      } else {
        articles.push({
          id: `news_gm_${week}_1`,
          week,
          outlet: 'TOWN_JOURNAL',
          headline: `CLUTCH FOURTH QUARTER PROPELS ${userTeam.name.toUpperCase()} TO VICTORY`,
          content: `${userTeam.name} held off a late surge from ${lastGameResult.opponent.name} to seal a hard-fought ${lastGameResult.userScore}-${lastGameResult.oppScore} district win.`,
          impactSentiment: 'POSITIVE',
          featuredTeamName: userTeam.name
        });
      }
    } else {
      articles.push({
        id: `news_gm_${week}_1`,
        week,
        outlet: 'TOWN_JOURNAL',
        headline: `HEARTBREAK ON FRIDAY NIGHT: ${userTeam.name.toUpperCase()} FALLS TO ${lastGameResult.opponent.name.toUpperCase()}`,
        content: `Mistakes and missed opportunities proved costly as ${userTeam.name} dropped a crucial contest, ${lastGameResult.userScore}-${lastGameResult.oppScore}. Booster confidence is visibly shaken.`,
        impactSentiment: 'NEGATIVE',
        featuredTeamName: userTeam.name
      });
    }
  }

  // 2. Recruiting / Star Player Spotlight
  if (starPlayer && starPlayer.recruiting.offers.length > 0) {
    const topOffer = starPlayer.recruiting.offers[0];
    articles.push({
      id: `news_rec_${week}`,
      week,
      outlet: 'PREP_GRIDIRON_TALK',
      headline: `SCOUT'S EYE: ${starPlayer.firstName.toUpperCase()} ${starPlayer.lastName.toUpperCase()} TURNING HEADS NATIONALLY`,
      content: `College scouts are raving about the ${starPlayer.overallRating} OVR ${starPlayer.position}. With offers from programs like ${topOffer.collegeName}, his stock is skyrocketing.`,
      impactSentiment: 'POSITIVE',
      featuredPlayerName: `${starPlayer.firstName} ${starPlayer.lastName}`
    });
  }

  // 3. Off-Field Scandal / Board Whispers
  if (scandalDilemmaTitle) {
    articles.push({
      id: `news_scandal_${week}`,
      week,
      outlet: 'STUDENT_VOICE',
      headline: `TENSION BREWING: CONTROVERSY SURROUNDS ATHLETIC DEPARTMENT`,
      content: `Sources report closed-door meetings between high school administration and athletic staff regarding: "${scandalDilemmaTitle}".`,
      impactSentiment: 'NEGATIVE'
    });
  }

  return articles;
}
