import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { feederEventCost, weeklyCpIncome } from '../sim/coachPoints';
import { FeederOutcomeType, FeederProspect, ProspectSource } from '../types/game';
import {
  FEEDER_EVENTS,
  FeederEventType,
  MAX_POOL_SIZE,
  PROSPECT_ACTION_COSTS,
  SOURCE_LABELS,
  interestLabel,
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

export const FeedersScoutingView: React.FC = () => {
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
    pitchFeederStar,
    offerFeederInducement,
    statewideRecruits,
    league,
    leagueTeams
  } = useGameStore();
  const ctx = useMemo(() => (league ? buildRecruitingContext(league, leagueTeams, userTeamId) : undefined), [league, leagueTeams, userTeamId]);
  const [filter, setFilter] = useState<ProspectSource | 'ALL'>('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);
  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  const weeklyIncome = weeklyCpIncome(currentWeek, coachTalents, userTeam.programMeters.schoolBoardTrust);
  const eventCost = (type: FeederEventType) => feederEventCost(FEEDER_EVENTS[type].cost, coachTalents);
  const sources = Object.keys(SOURCE_LABELS) as ProspectSource[];
  const shown = scoutingPool.filter((p) => filter === 'ALL' || p.source === filter);

  const handleEvent = (type: FeederEventType) => {
    const discovered = runFeederEvent(type);
    setFeedback(
      discovered.length > 0
        ? `${FEEDER_EVENTS[type].label}: ${discovered.map((p) => `${p.name} (${p.projectedPosition})`).join(', ')} joined the pipeline.`
        : `${FEEDER_EVENTS[type].label} held. Prospects in the pipeline warmed to the program.`
    );
  };

  return (
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0 }}>Feeder Pipeline</h2>
        <div style={{ display: 'flex', gap: '8px', fontSize: '13px', fontWeight: 'bold' }}>
          <span style={pillStyle('#DBEAFE', '#1E40AF')}>₡{coachPoints} · +₡{weeklyIncome}/wk</span>
          <span style={pillStyle('#F1F5F9', '#334155')}>Program Prestige: {userTeam.prestige}</span>
          <span style={pillStyle('#F1F5F9', '#334155')}>Pool: {scoutingPool.length} / {MAX_POOL_SIZE}</span>
        </div>
      </div>
      <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748B' }}>
        Next season&apos;s newcomers come from this pool. Not everyone will come out: your clinics, events and personal visits decide
        who does. {weeklyIncome < 100 && 'During the season you earn fewer Coach Points; spring and summer are the time to build the pipeline.'}
      </p>

      {feedback && <div style={{ background: '#EEF2FF', color: '#3730A3', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>{feedback}</div>}

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
            {lastFeederResults
              .filter((r) => r.outcome === 'JOINED')
              .map((r) => `${r.prospectName} (${r.position}, ${r.overall})`)
              .join(', ') || 'none'}
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

      {/* Program events */}
      <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Off-Season Program Events</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginBottom: '18px' }}>
        {(Object.keys(FEEDER_EVENTS) as FeederEventType[]).map((type) => {
          const event = FEEDER_EVENTS[type];
          const done = feederEventsThisWeek.includes(type);
          return (
            <div key={type} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{event.label}</div>
              <div style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 8px' }}>{event.description}</div>
              <button onClick={() => handleEvent(type)} disabled={done || coachPoints < eventCost(type)} style={actionBtn('#0F766E', done || coachPoints < eventCost(type))}>
                {done ? 'Held this week' : `Host (₡${eventCost(type)})`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Source filter */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button onClick={() => setFilter('ALL')} style={tabStyle(filter === 'ALL')}>All ({scoutingPool.length})</button>
        {sources.map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={tabStyle(filter === s)}>
            {SOURCE_LABELS[s]} ({scoutingPool.filter((p) => p.source === s).length})
          </button>
        ))}
      </div>

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
          />
        ))}
        {shown.length === 0 && <div style={{ color: '#64748B', fontSize: '13px' }}>No prospects in this group.</div>}
      </div>

      {ctx && statewideRecruits.length > 0 && <StatewideElitePanel recruits={statewideRecruits} ctx={ctx} />}
    </div>
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
}> = ({ prospect: p, chance, coachPoints, onScout, onVisit, onPitch, onInduce }) => {
  const scouted = p.revealedPotential !== 'UNKNOWN';
  const look = outlook(chance);
  const notes: string[] = [];
  if (p.source === 'SEVEN_ON_SEVEN') notes.push("Doesn't play tackle yet");
  if (p.source === 'STAR_RECRUIT') notes.push('Long shot: elite talent from out of area');
  if (p.source === 'TRYOUT') notes.push('General student trying out');
  if (p.source === 'OUT_OF_DISTRICT') notes.push('Pulling a player from his zoned school is a long shot');
  if (p.isTransferRisk) notes.push('Family may relocate');

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderLeft: `4px solid ${SOURCE_COLORS[p.source]}`, borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: '14px' }}>{p.name}</strong>
        <span style={{ fontWeight: 'bold' }}>{p.projectedPosition}</span>
      </div>
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
      {p.suitors.length > 0 && (
        <div style={{ fontSize: '12px', color: '#9F1239', marginTop: '2px' }}>
          Also recruiting: {p.suitors.map((s) => `${s.teamName} (${interestLabel(s.effort)})${s.inducement ? ' 🚩' : ''}`).join(', ')}
          {p.suitors.some((s) => s.inducement) && <span> · 🚩 rumored booster money</span>}
        </div>
      )}
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

const pillStyle = (background: string, color: string): React.CSSProperties => ({ background, color, padding: '5px 12px', borderRadius: '6px' });

const tabStyle = (active: boolean): React.CSSProperties => ({
  minHeight: '40px', // comfortable tap target
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #CBD5E1',
  background: active ? '#0F172A' : '#fff',
  color: active ? '#fff' : '#334155',
  fontSize: '12px',
  fontWeight: 'bold',
  cursor: 'pointer'
});

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
