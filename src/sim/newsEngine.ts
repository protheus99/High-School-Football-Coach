import { StateAndNationalPolls, Team } from '../types/game';
import { bestOffer } from './collegeRecruitingEngine';

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
    const topOffer = bestOffer(starPlayer)!;
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

// ---------------------------------------------------------------------------
// Headlines: what kind of story each article is and how much it matters to the coach, so the Hub can lead
// with the few that count (a commitment, a big move in the polls, an investigation) and leave the rest to News.
// ---------------------------------------------------------------------------

export type NewsCategory = 'RANKINGS' | 'RECRUITING' | 'PROGRAM' | 'YOUR_GAME' | 'LEAGUE';

/** Story types by the start of the article id (every article's id names where it came from). */
const CATEGORY_BY_PREFIX: [string, NewsCategory][] = [
  ['news_rank_', 'RANKINGS'],
  ['news_gm_', 'YOUR_GAME'],
  ['news_gameball_', 'YOUR_GAME'],
  ['news_press_', 'YOUR_GAME'],
  ['news_college_', 'RECRUITING'],
  ['news_signing_', 'RECRUITING'],
  ['news_rec_', 'RECRUITING'],
  ['news_elite_', 'RECRUITING'],
  ['news_feeder_class_', 'RECRUITING'],
  ['news_movein_', 'RECRUITING'],
  ['news_exposed_', 'PROGRAM'],
  ['news_sanction_', 'PROGRAM'],
  ['news_suspension_', 'PROGRAM'],
  ['news_user_violation_', 'PROGRAM'],
  ['news_hot_seat_', 'PROGRAM'],
  ['news_scandal_', 'PROGRAM'],
  ['news_violation_', 'LEAGUE']
];

export const newsCategory = (article: NewsArticle): NewsCategory => CATEGORY_BY_PREFIX.find(([prefix]) => article.id.startsWith(prefix))?.[1] ?? 'LEAGUE';

/**
 * How much a story matters to the coach (higher leads the Hub's headlines): his own game, rankings, program
 * trouble and his players' recruiting first; the weekly scouting spotlight and rumors last.
 */
export function newsImportance(article: NewsArticle, userTeamName: string): number {
  const category = newsCategory(article);
  const mine = article.featuredTeamName === userTeamName;
  if (article.id.startsWith('news_rec_') || article.id.startsWith('news_scandal_')) return 1; // weekly spotlight, rumors
  if (category === 'YOUR_GAME' || category === 'RANKINGS') return 4;
  if (category === 'PROGRAM') return mine || !article.featuredTeamName ? 4 : 2;
  if (category === 'RECRUITING') return mine ? 3 : 2;
  return 2;
}

/** The week's headlines: the most important new stories first (ties keep the newest first). */
export function pickHeadlines(articles: NewsArticle[], userTeamName: string, count = 5): NewsArticle[] {
  return articles
    .map((article, i) => ({ article, i, score: newsImportance(article, userTeamName) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, count)
    .map((x) => x.article);
}

/** A team's name with its national rank in front when it is in the national Top 25 ("#18 Midland Legacy"). */
export function rankedName(team: Pick<Team, 'id' | 'name'>, polls: StateAndNationalPolls | null | undefined): string {
  const rank = polls?.nationalTop25.find((e) => e.teamId === team.id)?.rank;
  return rank ? `#${rank} ${team.name}` : team.name;
}

/** The coach's result, as a headline. */
export function gameResultNews(
  week: number,
  userTeam: Team,
  opponent: Team,
  userScore: number,
  opponentScore: number,
  polls: StateAndNationalPolls | null,
  label?: string
): NewsArticle {
  const won = userScore > opponentScore;
  const opp = rankedName(opponent, polls);
  return {
    id: `news_gm_${week}_${opponent.id}`,
    week,
    outlet: 'TOWN_JOURNAL',
    headline: won ? `${userTeam.name} Beats ${opp} ${userScore}-${opponentScore}` : `${userTeam.name} Falls to ${opp} ${opponentScore}-${userScore}`,
    content: `${label ? `${label}: ` : ''}${userTeam.name} ${won ? 'won' : 'lost'} ${userScore}-${opponentScore} and is now ${userTeam.record.wins}-${userTeam.record.losses}.`,
    impactSentiment: won ? 'POSITIVE' : 'NEGATIVE',
    featuredTeamName: userTeam.name
  };
}

/** A real move in a poll: entering or leaving it, moving 3+ spots, or reaching the top 10. */
function pollMove(before: number | undefined, after: number | undefined, where: string): string | null {
  if (before === after) return null;
  if (after !== undefined && before === undefined) return after <= 10 ? `enters the ${where} top 10 at #${after}` : `enters the ${where} rankings at #${after}`;
  if (after === undefined) return `drops out of the ${where} rankings`;
  if (after <= 10 && before! > 10) return `cracks the ${where} top 10 at #${after}`;
  if (Math.abs(before! - after) >= 3) return `${after < before! ? 'climbs' : 'falls'} to #${after} in the ${where} rankings (${after < before! ? '▲' : '▼'}${Math.abs(before! - after)})`;
  return null;
}

/** The coach's team moving in the state or national polls: only real changes make the news. */
export function rankingNews(before: StateAndNationalPolls | null, after: StateAndNationalPolls, userTeam: Team, state: string, week: number): NewsArticle | null {
  const rankIn = (polls: StateAndNationalPolls | null, list: 'state' | 'national') =>
    (list === 'state' ? polls?.stateRankings[state] : polls?.nationalTop25)?.find((e) => e.teamId === userTeam.id)?.rank;
  if (!before) return null; // the first poll of a save: nothing to compare
  const moves = [pollMove(rankIn(before, 'state'), rankIn(after, 'state'), state), pollMove(rankIn(before, 'national'), rankIn(after, 'national'), 'national')].filter(
    (m): m is string => m !== null
  );
  if (moves.length === 0) return null;
  const up = moves.every((m) => !m.startsWith('falls') && !m.startsWith('drops'));
  return {
    id: `news_rank_${userTeam.id}_${week}`,
    week,
    outlet: 'STATE_SPORTS_CENTRAL',
    headline: `${userTeam.name} ${moves.join(' and ')}`,
    content: `${userTeam.name} (${userTeam.record.wins}-${userTeam.record.losses}) ${moves.join('; ')}.`,
    impactSentiment: up ? 'POSITIVE' : 'NEGATIVE',
    featuredTeamName: userTeam.name
  };
}
