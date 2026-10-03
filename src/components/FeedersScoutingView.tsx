import React, { useMemo, useState } from 'react';
import { feederEventsOpen, useGameStore } from '../store/gameStore';
import { FEEDER_SIGNING_WEEK } from '../sim/scheduleEngine';
import { feederEventCost, weeklyCpIncome } from '../sim/coachPoints';
import { FeederOutcomeType, FeederProspect, Player, ProspectSource } from '../types/game';
import { PositionNeed, priorityNeeds, seniorsStillHere, teamNeeds } from '../sim/teamNeeds';
import { PageHeader } from './ui/PageHeader';
import {
  FEEDER_EVENTS,
  FeederEventType,
  MAX_POOL_SIZE,
  PROSPECT_ACTION_COSTS,
  SOURCE_LABELS,
  COMMIT_THRESHOLD,
  currentCommitment,
  interestLabel,
  prospectRankScore,
  schoolInterest,
  userJoinProbability
} from '../sim/feederEngine';
import { FACTOR_LABELS, RecruitingContext, buildRecruitingContext, choiceShares, topPriority } from '../sim/feederCompetition';

const SOURCE_COLORS: Record<ProspectSource, string> = {
  FEEDER_MIDDLE_SCHOOL: '#2563EB',
  SEVEN_ON_SEVEN: '#7C3AED',
  MOVE_IN: '#0F766E',
  STAR_RECRUIT: '#D97706',
  OUT_OF_DISTRICT: '#BE123C',
  TRYOUT: '#64748B'
};

const OUTCOME_LABELS: Record<FeederOutcomeType, string> = {
  JOINED: 'Joined the program',
  NOT_PLAYING: 'Chose not to play',
  LEFT_AREA: 'Moved away',
  OTHER_SCHOOL: 'Enrolled elsewhere',
  JV_TEAM: 'Playing JV'
};

function outlook(chance: number): { label: string; color: string } {
  if (chance >= 0.65) return { label: 'Likely', color: '#16A34A' };
  if (chance >= 0.4) return { label: 'Possible', color: '#2563EB' };
  if (chance >= 0.15) return { label: 'Unlikely', color: '#D97706' };
  return { label: 'Long shot', color: '#DC2626' };
}

export type FeederSection = 'STUDENTS' | 'PROGRAMS' | 'NEEDS';
type PoolView = 'DISTRICT' | 'REGION' | 'TOP_DISTRICT' | 'TOP_REGION' | 'COMMITTED';

const FEEDER_SUBTITLES: Record<FeederSection, string> = {
  STUDENTS: 'Every student who could join a program next year',
  PROGRAMS: 'Off-season events that find and win over prospects',
  NEEDS: "Holes in next season's roster by position"
};

const SECTIONS: { id: FeederSection; label: string }[] = [
  { id: 'STUDENTS', label: '🧑‍🎓 New Students' },
  { id: 'PROGRAMS', label: '🏟️ Off Season Programs' },
  { id: 'NEEDS', label: '📋 Team Needs' }
];

/** Feeders: next year's students, the off-season programs that find and win them, and the roster's needs. */
export const FeedersScoutingView: React.FC<{ section: FeederSection; onSection: (section: FeederSection) => void; onOpenPlayer: (player: Player) => void }> = ({
  section,
  onSection,
  onOpenPlayer
}) => {
  const {
    scoutingPool,
    coachPoints,
    coachTalents,
    currentWeek,
    districtTeams,
    userTeamId,
    feederEventsThisWeek,
    lastFeederResults,
    runFeederEvent,
    scoutFeederProspect,
    visitFeederProspect,
    removeFeederProspect,
    pitchFeederStar,
    offerFeederInducement,
    statewideRecruits,
    league,
    leagueTeams,
    currentYear,
    feederClassYear
  } = useGameStore();
  const ctx = useMemo(() => (league ? buildRecruitingContext(league, leagueTeams, userTeamId) : undefined), [league, leagueTeams, userTeamId]);
  const [view, setView] = useState<PoolView>('DISTRICT');
  const [feedback, setFeedback] = useState<string | null>(null);
  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  const weeklyIncome = weeklyCpIncome(currentWeek, coachTalents, userTeam.programMeters.schoolBoardTrust);
  const eventCost = (type: FeederEventType) => feederEventCost(FEEDER_EVENTS[type].cost, coachTalents);
  const eventsOpen = feederEventsOpen({ currentWeek, league });
  const pipelineFull = scoutingPool.filter((p) => !p.homeTeamId).length >= MAX_POOL_SIZE;
  const needs = teamNeeds(userTeam, scoutingPool, seniorsStillHere(currentYear, feederClassYear, currentWeek));
  const topNeeds = priorityNeeds(needs).slice(0, 4);
  // The pool is shared by every program in the region: views by district, region, the top 10s and commitments
  const userDistrict = ctx?.districtOf.get(userTeamId);
  const inDistrict = (p: FeederProspect) => !p.homeTeamId || ctx?.districtOf.get(p.homeTeamId) === userDistrict;
  const ranked = (list: FeederProspect[]) => [...list].sort((a, b) => prospectRankScore(b) - prospectRankScore(a));
  const districtPool = scoutingPool.filter(inDistrict);
  const topDistrict = ranked(districtPool).slice(0, 10);
  const topRegion = ranked(scoutingPool).slice(0, 10);
  const committedToMe = scoutingPool.filter((p) => currentCommitment(p, userTeamId)?.teamId === userTeamId);
  // The top 10 lists always hold ten, so only the other views show a count
  const views: { id: PoolView; label: string; list: FeederProspect[]; count: boolean }[] = [
    { id: 'DISTRICT', label: 'District', list: ranked(districtPool), count: true },
    { id: 'REGION', label: 'Region', list: ranked(scoutingPool), count: true },
    { id: 'TOP_DISTRICT', label: 'Top 10 in District', list: topDistrict, count: false },
    { id: 'TOP_REGION', label: 'Top 10 in Region', list: topRegion, count: false },
    { id: 'COMMITTED', label: 'Committed', list: committedToMe, count: true }
  ];
  const shown = views.find((v) => v.id === view)!.list;
  const rankLabel = (p: FeederProspect) => {
    const r = topRegion.indexOf(p);
    if (r >= 0) return `#${r + 1} in Region`;
    const d = topDistrict.indexOf(p);
    return d >= 0 ? `#${d + 1} in District` : undefined;
  };
  const schoolName = (id: string) => (id === userTeamId ? 'You' : (ctx?.teamsById.get(id)?.name ?? 'Rival'));

  const handleEvent = (type: FeederEventType) => {
    const discovered = runFeederEvent(type);
    setFeedback(
      discovered.length > 0
        ? `${FEEDER_EVENTS[type].label}: ${discovered.map((p) => `${p.name} (${p.projectedPosition})`).join(', ')} joined the pipeline.`
        : `${FEEDER_EVENTS[type].label} held. Prospects in the pipeline warmed to the program.`
    );
  };

  return (
    <>
    <PageHeader
      title="Feeders"
      subtitle={FEEDER_SUBTITLES[section]}
      tabs={SECTIONS}
      active={section}
      onTab={onSection}
    />
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>

      {feedback && <div style={{ background: '#EEF2FF', color: '#3730A3', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>{feedback}</div>}

      {/* Signing day */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '14px' }}>
        ✍️ <strong>Signing day:</strong>{' '}
        {currentYear >= feederClassYear && currentWeek <= FEEDER_SIGNING_WEEK
          ? currentWeek === FEEDER_SIGNING_WEEK
            ? 'this week is the last chance. Prospects pick their school when the week ends.'
            : `pre season week ${FEEDER_SIGNING_WEEK}, next week.`
          : `pre season week ${FEEDER_SIGNING_WEEK} of ${feederClassYear}. Visits and pitches count until then.`}
      </div>

      {section === 'NEEDS' && <TeamNeedsPanel needs={needs} onPrograms={() => onSection('PROGRAMS')} />}

      {section === 'PROGRAMS' && (
        <>
          {/* Programs can't add anyone once the user's own pipeline is at its limit */}
          {pipelineFull && (
            <div role="status" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '10px' }}>
              <strong>Your pipeline is full ({MAX_POOL_SIZE}).</strong> Programs can still warm up your prospects, but they won&apos;t find new ones until you
              remove some.{' '}
              <button onClick={() => onSection('STUDENTS')} style={{ background: 'none', border: 'none', padding: 0, color: '#1D4ED8', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}>
                New Students →
              </button>
            </div>
          )}
          <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748B' }}>
            Each program can run once a week during the four off-season weeks after the banquet.
            {topNeeds.length > 0 && ` Your biggest needs: ${topNeeds.map((n) => n.position).join(', ')}.`}
          </p>
          {!eventsOpen && (
            <p className="ui-muted" style={{ margin: '0 0 8px 0', fontSize: '13px' }}>
              Programs open in the off season (after the banquet).
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginBottom: '18px' }}>
            {(Object.keys(FEEDER_EVENTS) as FeederEventType[]).map((type) => {
              const event = FEEDER_EVENTS[type];
              const done = feederEventsThisWeek.includes(type);
              return (
                <div key={type} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{event.label}</div>
                  <div style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 8px' }}>{event.description}</div>
                  <button
                    onClick={() => handleEvent(type)}
                    disabled={!eventsOpen || done || coachPoints < eventCost(type)}
                    style={actionBtn('#0F766E', !eventsOpen || done || coachPoints < eventCost(type))}
                  >
                    {!eventsOpen ? 'Off season only' : done ? 'Held this week' : `Host (₡${eventCost(type)})`}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {section === 'STUDENTS' && (
        <>
          <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748B' }}>
            Every student who could join the team next year. Not everyone will come out: your programs and personal visits decide who does.{' '}
            {weeklyIncome < 100 && 'During the season you earn fewer Coach Points; the off season is the time to build the pipeline.'}
          </p>

          {/* Last year's class */}
          {lastFeederResults && lastFeederResults.length > 0 && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>
              <strong>Last year&apos;s pipeline:</strong>{' '}
              {(Object.keys(OUTCOME_LABELS) as FeederOutcomeType[])
                .map((o) => ({ o, count: lastFeederResults.filter((r) => r.outcome === o).length }))
                .filter(({ count }) => count > 0)
                .map(({ o, count }) => `${count} ${OUTCOME_LABELS[o].toLowerCase().replace('jv', 'JV')}`)
                .join(' · ')}
              <div style={{ marginTop: '6px', color: '#166534' }}>
                Newcomers:{' '}
                {lastFeederResults.some((r) => r.outcome === 'JOINED')
                  ? lastFeederResults
                      .filter((r) => r.outcome === 'JOINED')
                      .map((r, i) => {
                        // Link to the player's profile while he is on the team
                        const player = userTeam.roster.find((pl) => pl.id === r.playerId);
                        const label = `${r.prospectName} (${r.position}, ${player?.overallRating ?? r.overall})`;
                        return (
                          <React.Fragment key={r.prospectId}>
                            {i > 0 && ', '}
                            {player ? (
                              <button onClick={() => onOpenPlayer(player)} style={playerLink}>
                                {label}
                              </button>
                            ) : (
                              label
                            )}
                          </React.Fragment>
                        );
                      })
                  : 'none'}
              </div>
              {lastFeederResults.some((r) => r.destinationTeamId) && (
                <div style={{ marginTop: '4px', color: '#9F1239' }}>
                  Lost to rivals:{' '}
                  {lastFeederResults
                    .filter((r) => r.destinationTeamId)
                    .map((r) => `${r.prospectName} → ${r.destinationName}`)
                    .join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Pool views */}
          <div className="ui-chips" aria-label="Pool view" style={{ marginBottom: '6px' }}>
            {views.map((v) => (
              <button key={v.id} className="ui-chip" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
                {v.count && ` (${v.list.length})`}
              </button>
            ))}
          </div>
          <p className="ui-muted" style={{ margin: '0 0 10px 0', fontSize: '12px' }}>
            Every program in the region recruits this pool. At {COMMIT_THRESHOLD}+ interest a prospect commits; on signing day the school with the highest
            interest signs him, and a tie at the top is a coin flip.
          </p>

          {/* Prospects */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '10px' }}>
            {shown.map((p) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                chance={userJoinProbability(p, userTeam.prestige, ctx)}
                coachPoints={coachPoints}
                onScout={() => scoutFeederProspect(p.id)}
                onVisit={() => visitFeederProspect(p.id)}
                onPitch={() => pitchFeederStar(p.id)}
                onInduce={() => offerFeederInducement(p.id)}
                rank={rankLabel(p)}
                schools={schoolInterest(p, userTeamId).slice(0, 3).map((e) => ({ name: schoolName(e.teamId), interest: e.interest, isYou: e.teamId === userTeamId }))}
                commitment={(() => {
                  const c = currentCommitment(p, userTeamId);
                  return c ? { name: schoolName(c.teamId), interest: c.interest, isYou: c.teamId === userTeamId, tied: c.tied } : null;
                })()}
                positionFilled={(needs.find((n) => n.position === p.projectedPosition)?.need ?? 1) === 0}
                onRemove={() => {
                  removeFeederProspect(p.id);
                  setFeedback(`${p.name} was removed from your list.`);
                }}
              />
            ))}
            {shown.length === 0 && <div style={{ color: '#64748B', fontSize: '13px' }}>No prospects in this group.</div>}
          </div>

          {ctx && statewideRecruits.length > 0 && <StatewideElitePanel recruits={statewideRecruits} ctx={ctx} />}
        </>
      )}
    </div>
    </>
  );
};

const ProspectCard: React.FC<{
  prospect: FeederProspect;
  chance: number;
  coachPoints: number;
  onScout: () => void;
  onVisit: () => void;
  onPitch: () => void;
  onInduce: () => void;
  positionFilled: boolean;
  onRemove: () => void;
  rank?: string;
  schools: { name: string; interest: number; isYou: boolean }[];
  commitment: { name: string; interest: number; isYou: boolean; tied: boolean } | null;
}> = ({ prospect: p, chance, coachPoints, onScout, onVisit, onPitch, onInduce, positionFilled, onRemove, rank, schools, commitment }) => {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const scouted = p.revealedPotential !== 'UNKNOWN';
  const look = outlook(chance);
  const notes: string[] = [];
  if (p.source === 'SEVEN_ON_SEVEN') notes.push("Doesn't play tackle yet");
  if (p.source === 'STAR_RECRUIT') notes.push('Long shot: elite talent from out of area');
  if (p.source === 'TRYOUT') notes.push('General student trying out');
  if (p.source === 'OUT_OF_DISTRICT') notes.push('Zoned to another school: out-recruit them to sign him');
  if (p.isTransferRisk) notes.push('Family may relocate');
  if (positionFilled) notes.push(`${p.projectedPosition} is already filled for next season`);

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderLeft: `4px solid ${SOURCE_COLORS[p.source]}`, borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: '14px' }}>
          {p.name}
          {rank && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#B45309' }}>{rank}</span>}
        </strong>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold' }}>{p.projectedPosition}</span>
          {!confirmRemove && (
            <button onClick={() => setConfirmRemove(true)} aria-label={`Remove ${p.name} from the list`} title="Remove from the list" style={removeBtn}>
              ✕
            </button>
          )}
        </span>
      </div>
      {confirmRemove && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', margin: '6px 0', padding: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', fontSize: '12px' }}>
          <span style={{ flex: '1 1 140px' }}>Remove {p.name} from your list? He won&apos;t come back.</span>
          <button onClick={onRemove} style={actionBtn('#B91C1C', false)}>
            Remove
          </button>
          <button onClick={() => setConfirmRemove(false)} style={actionBtn('#64748B', false)}>
            Keep
          </button>
        </div>
      )}
      <div style={{ color: '#6B7280', fontSize: '12px' }}>
        {SOURCE_LABELS[p.source]} · {p.middleSchool} · Incoming {p.incomingClass}
      </div>
      <div style={{ margin: '6px 0', fontSize: '12px' }}>
        {scouted ? (
          <>Potential <strong>{p.revealedPotential}</strong> · Speed {p.scoutedSpeed} · Strength {p.scoutedStrength}</>
        ) : (
          <span style={{ color: '#94A3B8' }}>Not evaluated</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
        <div style={{ flex: 1, background: '#E5E7EB', height: '6px', borderRadius: '3px' }}>
          <div style={{ width: `${p.interestScore}%`, background: SOURCE_COLORS[p.source], height: '100%', borderRadius: '3px' }} />
        </div>
        <span>Interest: {interestLabel(p.interestScore)} ({p.interestScore})</span>
        <span style={{ color: look.color, fontWeight: 'bold' }}>{look.label}</span>
      </div>
      <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>Cares most about: {FACTOR_LABELS[topPriority(p)]}</div>
      {commitment && (
        <div
          style={{
            fontSize: '12px',
            fontWeight: 'bold',
            marginTop: '4px',
            padding: '4px 8px',
            borderRadius: '6px',
            background: commitment.isYou ? '#DCFCE7' : '#FEE2E2',
            color: commitment.isYou ? '#166534' : '#991B1B'
          }}
        >
          {commitment.isYou ? '✅ Committed to you' : `🔒 Committed to ${commitment.name}`} ({commitment.interest})
          {commitment.tied ? ' · tied at the top: a coin flip on signing day' : !commitment.isYou ? ` · pass ${commitment.interest} to win him` : ''}
        </div>
      )}
      <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
        Interested schools:{' '}
        {schools.map((s, i) => (
          <span key={s.name} style={{ fontWeight: s.isYou ? 'bold' : 'normal', color: s.interest >= COMMIT_THRESHOLD ? '#B45309' : undefined }}>
            {i > 0 && ' · '}
            {s.name} {s.interest}
          </span>
        ))}
        {p.suitors.some((s) => s.inducement) && <span style={{ color: '#9F1239' }}> · 🚩 rumored booster money</span>}
      </div>
      {notes.length > 0 && <div style={{ fontSize: '12px', color: '#92400E', marginTop: '4px' }}>{notes.join(' · ')}</div>}
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
        <button onClick={onScout} disabled={scouted || coachPoints < PROSPECT_ACTION_COSTS.SCOUT} style={actionBtn('#475569', scouted || coachPoints < PROSPECT_ACTION_COSTS.SCOUT)}>
          {scouted ? 'Evaluated' : `Evaluate (₡${PROSPECT_ACTION_COSTS.SCOUT})`}
        </button>
        <button onClick={onVisit} disabled={coachPoints < PROSPECT_ACTION_COSTS.VISIT} style={actionBtn('#2563EB', coachPoints < PROSPECT_ACTION_COSTS.VISIT)}>
          {p.source === 'STAR_RECRUIT' ? 'Call' : 'Home Visit'} (₡{PROSPECT_ACTION_COSTS.VISIT})
        </button>
        {p.source === 'STAR_RECRUIT' && (
          <button onClick={onPitch} disabled={coachPoints < PROSPECT_ACTION_COSTS.PITCH_STAR} style={actionBtn('#D97706', coachPoints < PROSPECT_ACTION_COSTS.PITCH_STAR)}>
            Full Recruiting Pitch (₡{PROSPECT_ACTION_COSTS.PITCH_STAR})
          </button>
        )}
        {p.source !== 'TRYOUT' &&
          (p.userInducement ? (
            <span style={{ fontSize: '12px', color: '#B91C1C', fontWeight: 'bold', alignSelf: 'center' }}>⚠️ Booster offer made</span>
          ) : (
            <button
              onClick={onInduce}
              disabled={coachPoints < 20}
              title="Illegal: boosters make an improper offer. Big pull on this player, but it builds evidence that may surface for years."
              style={actionBtn('#7F1D1D', coachPoints < 20)}
            >
              Booster Offer (₡20)
            </button>
          ))}
      </div>
    </div>
  );
};

/** Elite out-of-area recruits contested among the state's top programs. */
const StatewideElitePanel: React.FC<{ recruits: FeederProspect[]; ctx: RecruitingContext }> = ({ recruits, ctx }) => (
  <div style={{ marginTop: '20px' }}>
    <h3 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Statewide Elite Recruits</h3>
    <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748B' }}>Top out-of-area talent being fought over by the state&apos;s powerhouse programs this year.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '8px' }}>
      {recruits.map((p) => {
        const leader = [...choiceShares(p, ctx, false)].sort((a, b) => b.share - a.share)[0];
        return (
          <div key={p.id} style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{p.name}</strong>
              <span>{p.incomingClass} {p.projectedPosition}</span>
            </div>
            <div style={{ color: '#6B7280' }}>{p.middleSchool}</div>
            <div style={{ marginTop: '4px' }}>
              Suitors: {p.suitors.map((s) => `${s.teamName}${s.inducement ? ' 🚩' : ''}`).join(', ')}
            </div>
            {leader && <div style={{ color: '#92400E', fontWeight: 'bold' }}>Leaning: {leader.name}</div>}
          </div>
        );
      })}
    </div>
  </div>
);

const actionBtn = (color: string, disabled: boolean): React.CSSProperties => ({
  minHeight: '40px', // comfortable tap target
  padding: '8px 12px',
  background: disabled ? '#CBD5E1' : color,
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '12px',
  fontWeight: 'bold'
});

const playerLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#166534',
  fontWeight: 'bold',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 'inherit'
};

/** Holes in the roster by position, most urgent first, with how many prospects the pipeline has there. */
const TeamNeedsPanel: React.FC<{ needs: PositionNeed[]; onPrograms: () => void }> = ({ needs, onPrograms }) => {
  const priority = priorityNeeds(needs);
  const rest = needs.filter((n) => !priority.includes(n));
  const row = (n: PositionNeed, urgent: boolean) => (
    <div
      key={n.position}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        background: urgent ? '#FFFBEB' : '#fff',
        border: `1px solid ${urgent ? '#FCD34D' : '#E2E8F0'}`,
        borderRadius: '8px'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
          {n.position}
          {n.need > 0 ? ` · need ${n.need}` : ' · set'}
          {n.starterHoles > 0 && <span style={{ color: '#B91C1C' }}> ({n.starterHoles} starting job{n.starterHoles === 1 ? '' : 's'} open)</span>}
        </div>
        <div style={{ fontSize: '12px', color: '#64748B' }}>
          {n.leaving > 0 ? `${n.leaving} senior${n.leaving === 1 ? '' : 's'} leaving${n.leavingStarters ? ` (${n.leavingStarters} starting)` : ''} · ` : ''}
          {n.returning} of {n.target} spots filled
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: '12px', color: n.pipeline >= n.need ? '#16A34A' : '#B45309', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
        {n.pipeline} in pipeline
      </div>
    </div>
  );
  return (
    <div>
      <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748B' }}>
        Holes in next season&apos;s roster by position, after the seniors leave. Target these positions with visits and programs: Big Man Camp
        brings in linemen, the QB &amp; Skills Academy skill players.{' '}
        <button onClick={onPrograms} style={{ ...playerLink, color: '#2563EB' }}>
          Off Season Programs →
        </button>
      </p>
      {priority.length > 0 ? (
        <>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Needs</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>{priority.map((n) => row(n, true))}</div>
        </>
      ) : (
        <p style={{ fontSize: '13px', color: '#16A34A', fontWeight: 'bold' }}>No urgent needs: the pipeline covers every position.</p>
      )}
      <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Covered</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{rest.map((n) => row(n, false))}</div>
    </div>
  );
};

const removeBtn: React.CSSProperties = {
  minWidth: '32px',
  minHeight: '32px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  background: '#fff',
  color: '#64748B',
  fontWeight: 'bold',
  cursor: 'pointer'
};
