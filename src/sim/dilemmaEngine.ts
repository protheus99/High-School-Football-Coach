import { NarrativeDilemma, Team, DilemmaChoice } from '../types/game';

export function generateWeeklyDilemma(week: number, userTeam: Team): NarrativeDilemma | null {
  const ineligibleStar = userTeam.roster.find((p) => p.depthChartTier === 1 && p.academics.gpa < 2.3);
  const demandingBoosterPlayer = userTeam.roster.find((p) => p.parent.archetype === 'DEMANDING_BOOSTER' && p.depthChartTier !== 1);

  if (week % 3 === 0 && ineligibleStar) {
    return {
      id: `dil_acad_${week}`,
      weekTriggered: week,
      title: 'Midterm Grade Crisis',
      scenario: `Star ${ineligibleStar.position} #${ineligibleStar.lastName} is failing Algebra right before Friday's critical matchup. The math teacher asks if you want to intervene.`,
      involvedPlayerId: ineligibleStar.id,
      choices: [
        {
          id: 'opt_good',
          label: 'Enforce "No Pass, No Play" (Bench Him)',
          description: 'Uphold school integrity. The athlete sits for 2 weeks.',
          tier: 'GOOD',
          impact: {
            schoolBoardTrustDelta: 10,
            boosterApprovalDelta: -15,
            lockerRoomDisciplineDelta: 12,
            complianceScoreDelta: 10,
            playerAvailabilityOverride: { playerId: ineligibleStar.id, isEligible: false }
          }
        },
        {
          id: 'opt_compromise',
          label: 'Assign Emergency Study Hall (Play 2nd Half Only)',
          description: 'Mandate 10 hours of weekend tutoring and bench him for the 1st half.',
          tier: 'COMPROMISE',
          impact: {
            schoolBoardTrustDelta: 0,
            boosterApprovalDelta: -5,
            lockerRoomDisciplineDelta: 0,
            complianceScoreDelta: 0
          }
        },
        {
          id: 'opt_corrupt',
          label: 'Direct Teacher to Supply "Extra Credit" Homework',
          description: 'Falsify passing grades to guarantee his presence on the field Friday.',
          tier: 'CORRUPT',
          impact: {
            schoolBoardTrustDelta: -18,
            boosterApprovalDelta: 12,
            lockerRoomDisciplineDelta: -15,
            complianceScoreDelta: -25,
            playerAvailabilityOverride: { playerId: ineligibleStar.id, isEligible: true }
          }
        }
      ]
    };
  }

  if (demandingBoosterPlayer) {
    return {
      id: `dil_booster_${week}`,
      weekTriggered: week,
      title: 'Booster Headset Funding Threat',
      scenario: `An influential Booster donor is furious that his son (#${demandingBoosterPlayer.lastName}) is on the bench, threatening to revoke funding for new digital sideline headsets.`,
      involvedPlayerId: demandingBoosterPlayer.id,
      choices: [
        {
          id: 'opt_refuse',
          label: 'Refuse: "Play the Best Athletes"',
          description: 'Preserve locker room meritocracy. The donor pulls $15,000 in equipment.',
          tier: 'GOOD',
          impact: {
            schoolBoardTrustDelta: 5,
            boosterApprovalDelta: -25,
            lockerRoomDisciplineDelta: 15,
            complianceScoreDelta: 5
          }
        },
        {
          id: 'opt_script',
          label: 'Script 2 Offensive Possessions for Son',
          description: 'Give him guaranteed playing time in the 1st quarter to appease the family.',
          tier: 'COMPROMISE',
          impact: {
            schoolBoardTrustDelta: -5,
            boosterApprovalDelta: 10,
            lockerRoomDisciplineDelta: -8,
            complianceScoreDelta: 0
          }
        },
        {
          id: 'opt_start',
          label: 'Promote Son to Starting Unit',
          description: 'Secure full booster funding at the expense of locker room morale.',
          tier: 'CORRUPT',
          impact: {
            schoolBoardTrustDelta: -15,
            boosterApprovalDelta: 25,
            lockerRoomDisciplineDelta: -25,
            complianceScoreDelta: -10
          }
        }
      ]
    };
  }

  return null;
}

export function executeDilemmaDecision(userTeam: Team, choice: DilemmaChoice): void {
  userTeam.programMeters.schoolBoardTrust = Math.min(100, Math.max(0, userTeam.programMeters.schoolBoardTrust + choice.impact.schoolBoardTrustDelta));
  userTeam.programMeters.boosterApproval = Math.min(100, Math.max(0, userTeam.programMeters.boosterApproval + choice.impact.boosterApprovalDelta));
  userTeam.programMeters.lockerRoomDiscipline = Math.min(100, Math.max(0, userTeam.programMeters.lockerRoomDiscipline + choice.impact.lockerRoomDisciplineDelta));
  userTeam.programMeters.complianceScore = Math.min(100, Math.max(0, userTeam.programMeters.complianceScore + choice.impact.complianceScoreDelta));

  if (choice.impact.playerAvailabilityOverride) {
    const { playerId, isEligible } = choice.impact.playerAvailabilityOverride;
    const ply = userTeam.roster.find((p) => p.id === playerId);
    if (ply) ply.academics.isEligible = isEligible;
  }
}
