import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { FeederOutcomeType, FeederProspect, ProspectSource } from '../types/game';
import {
  FEEDER_EVENTS,
  FeederEventType,
  MAX_POOL_SIZE,
  PROSPECT_ACTION_COSTS,
  SOURCE_LABELS,
  interestLabel,
  joinChance,
  weeklyActionPoints
} from '../sim/feederEngine';

const SOURCE_COLORS: Record<ProspectSource, string> = {
  FEEDER_MIDDLE_SCHOOL: '#2563EB',
  SEVEN_ON_SEVEN: '#7C3AED',
  MOVE_IN: '#0F766E',
  STAR_RECRUIT: '#D97706',
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
    coachingAP,
    currentWeek,
    districtTeams,
    userTeamId,
    feederEventsThisWeek,
    lastFeederResults,
    runFeederEvent,
    scoutFeederProspect,
    visitFeederProspect,
    pitchFeederStar
  } = useGameStore();
  const [filter, setFilter] = useState<ProspectSource | 'ALL'>('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);
  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  const maxAP = weeklyActionPoints(currentWeek);
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
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0 }}>Feeder Pipeline</h2>
        <div style={{ display: 'flex', gap: '8px', fontSize: '13px', fontWeight: 'bold' }}>
          <span style={pillStyle('#DBEAFE', '#1E40AF')}>AP: {coachingAP} / {maxAP}</span>
          <span style={pillStyle('#F1F5F9', '#334155')}>Program Prestige: {userTeam.prestige}</span>
          <span style={pillStyle('#F1F5F9', '#334155')}>Pool: {scoutingPool.length} / {MAX_POOL_SIZE}</span>
        </div>
      </div>
      <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748B' }}>
        Next season&apos;s newcomers come from this pool. Not everyone will come out: your clinics, events and personal visits decide
        who does. {maxAP < 100 && 'During the season your AP budget is limited; spring and summer are the time to build the pipeline.'}
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
              <button onClick={() => handleEvent(type)} disabled={done || coachingAP < event.cost} style={actionBtn('#0F766E', done || coachingAP < event.cost)}>
                {done ? 'Held this week' : `Host (${event.cost} AP)`}
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
            chance={joinChance(p, userTeam.prestige)}
            coachingAP={coachingAP}
            onScout={() => scoutFeederProspect(p.id)}
            onVisit={() => visitFeederProspect(p.id)}
            onPitch={() => pitchFeederStar(p.id)}
          />
        ))}
        {shown.length === 0 && <div style={{ color: '#64748B', fontSize: '13px' }}>No prospects in this group.</div>}
      </div>
    </div>
  );
};

const ProspectCard: React.FC<{
  prospect: FeederProspect;
  chance: number;
  coachingAP: number;
  onScout: () => void;
  onVisit: () => void;
  onPitch: () => void;
}> = ({ prospect: p, chance, coachingAP, onScout, onVisit, onPitch }) => {
  const scouted = p.revealedPotential !== 'UNKNOWN';
  const look = outlook(chance);
  const notes: string[] = [];
  if (p.source === 'SEVEN_ON_SEVEN') notes.push("Doesn't play tackle yet");
  if (p.source === 'STAR_RECRUIT') notes.push('Long shot: elite talent from out of area');
  if (p.source === 'TRYOUT') notes.push('General student trying out');
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
      {notes.length > 0 && <div style={{ fontSize: '11px', color: '#92400E', marginTop: '4px' }}>{notes.join(' · ')}</div>}
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
        <button onClick={onScout} disabled={scouted || coachingAP < PROSPECT_ACTION_COSTS.SCOUT} style={actionBtn('#475569', scouted || coachingAP < PROSPECT_ACTION_COSTS.SCOUT)}>
          {scouted ? 'Evaluated' : `Evaluate (${PROSPECT_ACTION_COSTS.SCOUT} AP)`}
        </button>
        <button onClick={onVisit} disabled={coachingAP < PROSPECT_ACTION_COSTS.VISIT} style={actionBtn('#2563EB', coachingAP < PROSPECT_ACTION_COSTS.VISIT)}>
          {p.source === 'STAR_RECRUIT' ? 'Call' : 'Home Visit'} ({PROSPECT_ACTION_COSTS.VISIT} AP)
        </button>
        {p.source === 'STAR_RECRUIT' && (
          <button onClick={onPitch} disabled={coachingAP < PROSPECT_ACTION_COSTS.PITCH_STAR} style={actionBtn('#D97706', coachingAP < PROSPECT_ACTION_COSTS.PITCH_STAR)}>
            Full Recruiting Pitch ({PROSPECT_ACTION_COSTS.PITCH_STAR} AP)
          </button>
        )}
      </div>
    </div>
  );
};

const pillStyle = (background: string, color: string): React.CSSProperties => ({ background, color, padding: '5px 12px', borderRadius: '6px' });

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  borderRadius: '6px',
  border: '1px solid #CBD5E1',
  background: active ? '#0F172A' : '#fff',
  color: active ? '#fff' : '#334155',
  fontSize: '12px',
  fontWeight: 'bold',
  cursor: 'pointer'
});

const actionBtn = (color: string, disabled: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  background: disabled ? '#CBD5E1' : color,
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '12px',
  fontWeight: 'bold'
});
