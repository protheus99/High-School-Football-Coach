import React from 'react';
import { PlayEvent, Team } from '../types/game';
import { readableOnWhite } from '../utils/color';
import { PenaltyFlag } from './ui/PenaltyFlag';
import { FlagStage, flagResult } from '../sim/flagSequence';

/**
 * The message strip under the field while a flag is called: the play it came on, a flashing yellow FLAG banner,
 * then what the call was, on whom, and what it means.
 */
export const FlagCall: React.FC<{ event: PlayEvent; stage: FlagStage; teams: Team[] }> = ({ event, stage, teams }) => {
  const p = event.penalty!;
  if (stage === 'PLAY') {
    return (
      <div className="play-latest" aria-live="polite">
        <strong>{p.play}</strong>
      </div>
    );
  }
  if (stage === 'FLAG') {
    return (
      <div className="flag-bar" role="status" aria-live="assertive">
        <PenaltyFlag size={40} className="flag-toss" />
        <span>FLAG</span>
      </div>
    );
  }
  const team = teams.find((t) => t.id === p.teamId);
  const color = team ? readableOnWhite(team.primaryColor, team.secondaryColor) : '#0F172A';
  // From the offense's side: its own foul costs yards, the defense's gains them
  const gain = p.side === 'DEFENSE';
  return (
    <div className="flag-call" role="status" aria-live="assertive" style={{ borderLeftColor: team?.primaryColor || '#CA8A04' }}>
      <PenaltyFlag size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.06em', color: '#854D0E' }}>
            FLAG · {p.side}
            {p.timing === 'PRE_SNAP' ? ' · BEFORE THE SNAP' : ''}
          </span>
          <span style={{ fontWeight: 900, fontSize: '13px', color: gain ? '#15803D' : '#B91C1C', whiteSpace: 'nowrap' }}>
            {gain ? '+' : '−'}
            {p.yards} yds
          </span>
        </div>
        <div style={{ fontSize: '18px', fontWeight: 900, lineHeight: 1.15 }}>{p.name}</div>
        <div style={{ fontSize: '13px', color: '#422006' }}>
          on <strong>{p.player}</strong>, <span style={{ color, fontWeight: 800 }}>{team?.name}</span>
        </div>
        <div style={{ fontSize: '12.5px', color: '#422006', marginTop: '2px' }}>{flagResult(event)}</div>
      </div>
    </div>
  );
};
