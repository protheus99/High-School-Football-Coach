import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import {
  FATIGUE_LEVELS,
  NO_BOOSTS,
  PHASE_TRAINING,
  fatigueInjuryMultiplier,
  fatigueLevel,
  migrateIntensity,
  previewPractice,
  runTrainingWeek,
  setFatigue,
  staminaFromFatigue,
  trainPlayer,
  trainingBoosts
} from '../training';
import { POSITION_KEY_SKILLS } from '../playerEngine';

describe('Training', () => {
  it('multiplies by the time of year: 2x pre season, camp and off season, 1x regular season, 0.5x playoffs, none in the post season', () => {
    expect(PHASE_TRAINING).toEqual({ SPRING_EVALUATION: 2, SUMMER_CAMP: 2, NON_DISTRICT: 1, DISTRICT_PLAY: 1, STATE_PLAYOFFS: 0.5, POST_SEASON: 0, OFF_SEASON: 2 });
  });

  it('turns training into key skills a point at a time, and a full turn through them into +1 overall, at the same pace for every position', () => {
    const [team] = generateDistrictTeams();
    (['QB', 'WR', 'CB'] as const).forEach((position) => {
      const p = team.roster.find((x) => x.position === position && x.overallRating < 90)!;
      const skills = POSITION_KEY_SKILLS[position];
      p.training = { progress: 0, points: 0 };
      const before = { ...p.attributes };
      const overall = p.overallRating;
      // One overall point of training: +1 to each key skill and +1 overall
      expect(trainPlayer(p, 1)).toBe(skills.length);
      skills.forEach((s) => expect((p.attributes[s] as number) - (before[s] as number)).toBe(1));
      expect(p.overallRating).toBe(overall + 1);
      expect(trainPlayer(p, 0.9 / skills.length)).toBe(0); // part of the way to the next point
    });
  });

  it('ranks the options: Full builds the most, then Limited, then a film day, and a week off builds nothing', () => {
    const [team] = generateDistrictTeams();
    const [full, limited, film, off] = (['FULL', 'LIMITED', 'NO_PRACTICE', 'WEEK_OFF'] as const).map((i) => previewPractice(team, i, 'DISTRICT_PLAY', true));
    expect(full.skillPoints).toBeGreaterThan(limited.skillPoints);
    expect(limited.skillPoints).toBeGreaterThan(film.skillPoints);
    expect(film.skillPoints).toBeGreaterThan(0);
    expect(off.skillPoints).toBe(0);
    // Fatigue: Full tires starters the most, a week off recovers the most
    expect(full.starterFatigue).toBeGreaterThan(limited.starterFatigue);
    expect(film.starterFatigue).toBeGreaterThan(off.starterFatigue);
    expect(off.starterFatigue).toBeLessThan(0);
    // Practice injuries: only Full and Limited carry a risk
    expect(full.injuryRisk).toBeGreaterThan(limited.injuryRisk);
    expect(limited.injuryRisk).toBeGreaterThan(0);
    expect(film.injuryRisk).toBe(0);
    expect(off.injuryRisk).toBe(0);
    // Camp counts double
    expect(previewPractice(team, 'FULL', 'SUMMER_CAMP', false).skillPoints).toBeCloseTo(full.skillPoints * 2, 5);
    expect(previewPractice(team, 'FULL', 'POST_SEASON', false).skillPoints).toBe(0);
  });

  it('builds fatigue from games and practice, and a week off brings it down', () => {
    const [team] = generateDistrictTeams();
    const starter = team.roster.find((p) => p.depthChartTier === 1 && p.condition.injuryStatus === 'HEALTHY')!;
    setFatigue(starter, 20);
    runTrainingWeek(team, 'FULL', 'DISTRICT_PLAY', 9, true);
    expect(starter.condition.seasonWear).toBe(25); // +5 game, +3 practice, -3 recovery
    runTrainingWeek(team, 'WEEK_OFF', 'DISTRICT_PLAY', 10, true);
    expect(starter.condition.seasonWear).toBe(16); // +5 game, -14 recovery
    expect(starter.condition.inGameStamina).toBe(staminaFromFatigue(16));
  });

  it('names five fatigue levels; tired players get hurt more and start games with less stamina', () => {
    expect(FATIGUE_LEVELS.map((l) => l.level)).toEqual(['Fresh', 'Good', 'Worn', 'Tired', 'Exhausted']);
    expect([0, 20, 40, 60, 80].map(fatigueLevel)).toEqual(['Fresh', 'Good', 'Worn', 'Tired', 'Exhausted']);
    expect(fatigueInjuryMultiplier(80)).toBeGreaterThan(fatigueInjuryMultiplier(60));
    expect(fatigueInjuryMultiplier(10)).toBe(1);
    expect(staminaFromFatigue(95)).toBeLessThan(60); // an exhausted starter sits in the live engine
    expect(staminaFromFatigue(0)).toBe(100);
  });

  it('reports the week: skill points, and practice injuries that heal like game injuries', () => {
    const [team] = generateDistrictTeams();
    team.roster.forEach((p) => setFatigue(p, 80)); // exhausted: practice injuries are likely over a few weeks
    let injured = 0;
    let points = 0;
    for (let week = 1; week <= 6; week++) {
      const report = runTrainingWeek(team, 'FULL', 'SUMMER_CAMP', week, false, NO_BOOSTS);
      injured += report.injured.length;
      points += report.skillPoints;
      team.roster.forEach((p) => setFatigue(p, 80));
    }
    expect(points).toBeGreaterThan(0);
    expect(injured).toBeGreaterThan(0);
    team.roster
      .filter((p) => p.condition.injuryStatus !== 'HEALTHY')
      .forEach((p) => expect(p.condition.injuryWeeksRemaining).toBeLessThanOrEqual(3));
  });

  it('lets coaches boost practice: talent and position coaches add gain, the strength coach cuts injuries', () => {
    const [team] = generateDistrictTeams();
    const base = previewPractice(team, 'FULL', 'DISTRICT_PLAY', true);
    const boosts = trainingBoosts(team, true, { developmentByPosition: { QB: 1 }, freshmanDevelopment: 0, injuryReduction: 0.2 });
    const boosted = previewPractice(team, 'FULL', 'DISTRICT_PLAY', true, boosts);
    expect(boosted.skillPoints).toBeGreaterThan(base.skillPoints * 1.2);
    expect(boosted.injuryRisk).toBeLessThan(base.injuryRisk);
    expect(boosts.sources.length).toBeGreaterThanOrEqual(3);
  });

  it('reads old saves: Full Contact is Full, Standard is Limited, Walkthrough is No practice', () => {
    expect(['CONTACT', 'STANDARD', 'WALKTHROUGH', undefined, 'WEEK_OFF'].map(migrateIntensity)).toEqual(['FULL', 'LIMITED', 'NO_PRACTICE', 'LIMITED', 'WEEK_OFF']);
  });
});
