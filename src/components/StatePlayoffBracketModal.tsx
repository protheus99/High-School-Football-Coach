import React, { useState } from 'react';
import { BracketNode, PlayoffBracketState, ROUND_LABELS, findUserNode, userDivisionIndex } from '../sim/playoffEngine';
import { Team } from '../types/game';

interface PlayoffModalProps {
  bracketState: PlayoffBracketState;
  userTeamId: string;
  onClose: () => void;
}

export const StatePlayoffBracketModal: React.FC<PlayoffModalProps> = ({ bracketState, userTeamId, onClose }) => {
  const { divisions, roundNames, currentRoundIndex, isPlayoffsActive } = bracketState;
  const userDivision = userDivisionIndex(bracketState, userTeamId);
  const [divisionIndex, setDivisionIndex] = useState(userDivision ?? 0);
  const [roundIndex, setRoundIndex] = useState(currentRoundIndex);

  const division = divisions[divisionIndex];
  const nodes = division.rounds[roundIndex] ?? [];
  const involvesUser = (n: BracketNode) => n.team1.id === userTeamId || n.team2.id === userTeamId;
  const champion = (d: typeof division): Team | undefined => {
    const final = d.rounds[roundNames.length - 1]?.[0];
    return final && d.championTeamId ? (final.team1.id === d.championTeamId ? final.team1 : final.team2) : undefined;
  };

  // User status line
  const userNode = findUserNode(bracketState, userTeamId)?.node;
  let userStatus: string;
  if (userDivision === undefined) userStatus = 'Your team did not qualify for the state playoffs.';
  else if (isPlayoffsActive && userNode && !userNode.winnerTeamId) userStatus = 'Your game this week is ready: set your gameplan on the Dashboard.';
  else if (isPlayoffsActive && userNode?.winnerTeamId === userTeamId) userStatus = 'Victory! Advance the week to play out the rest of the round.';
  else if (divisions[userDivision].championTeamId === userTeamId) userStatus = '🏆 STATE CHAMPIONS!';
  else userStatus = 'Your season has ended. The tournament continues as you advance the weeks.';

  // Group region-round games by region
  const groups: { label: string | null; games: BracketNode[] }[] = [];
  nodes.forEach((node) => {
    const label = node.region ?? null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.games.push(node);
    else groups.push({ label, games: [node] });
  });

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0F172A' }}>🏆 STATE CHAMPIONSHIP TOURNAMENT</h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              {bracketState.championshipTitle ?? 'State Playoffs'}
              {isPlayoffsActive ? ` · This week: ${ROUND_LABELS[roundNames[currentRoundIndex]]}` : ' · Complete'}
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Champions */}
        {divisions.map((d) => {
          const champ = champion(d);
          return champ ? (
            <div key={d.name} style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '12px', margin: '12px 0 0', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#92400E', fontWeight: 'bold' }}>
                👑 {divisions.length > 1 ? `${d.name.toUpperCase()} ` : ''}STATE CHAMPION
              </div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{champ.name} {champ.mascot}</div>
              {bracketState.championshipVenue && (
                <div style={{ fontSize: '12px', color: '#92400E' }}>Crowned at {bracketState.championshipVenue}</div>
              )}
            </div>
          ) : null;
        })}

        <div style={{ background: '#F1F5F9', borderRadius: '8px', padding: '10px 14px', margin: '12px 0', fontSize: '13px', color: '#334155' }}>
          {userStatus}
        </div>

        {/* Division toggle */}
        {divisions.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            {divisions.map((d, i) => (
              <button key={d.name} onClick={() => setDivisionIndex(i)} style={tabStyle(i === divisionIndex)}>
                {d.name}{i === userDivision ? ' ★' : ''}
              </button>
            ))}
          </div>
        )}

        {/* Round tabs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {roundNames.map((round, i) => (
            <button key={round} onClick={() => setRoundIndex(i)} disabled={!division.rounds[i]} style={tabStyle(i === roundIndex, !division.rounds[i])}>
              {ROUND_LABELS[round]}
            </button>
          ))}
        </div>

        {/* Games */}
        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {groups.map((group, g) => (
            <div key={`${group.label}_${g}`} style={{ marginBottom: '10px' }}>
              {group.label && (
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', margin: '4px 0' }}>{group.label}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '8px' }}>
                {group.games.map((node) => (
                  <div
                    key={node.matchupId}
                    style={{
                      background: involvesUser(node) ? '#EFF6FF' : '#F8FAFC',
                      border: involvesUser(node) ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '13px'
                    }}
                  >
                    {[node.team1, node.team2].map((team, i) => {
                      const score = i === 0 ? node.team1Score : node.team2Score;
                      const won = node.winnerTeamId === team.id;
                      return (
                        <div key={team.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: i === 0 ? '4px' : 0 }}>
                          <span style={{ fontWeight: won ? 'bold' : 'normal', color: won ? '#16A34A' : node.winnerTeamId ? '#94A3B8' : '#1E293B' }}>
                            {team.name} <span style={{ fontSize: '11px', color: '#94A3B8' }}>({team.record.wins}-{team.record.losses})</span>
                          </span>
                          <span style={{ fontWeight: 'bold' }}>{score ?? '-'}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={closeBtn}>Close Bracket</button>
      </div>
    </div>
  );
};

const tabStyle = (active: boolean, disabled = false): React.CSSProperties => ({
  padding: '5px 10px',
  borderRadius: '6px',
  border: '1px solid #CBD5E1',
  background: active ? '#0F172A' : '#fff',
  color: active ? '#fff' : disabled ? '#CBD5E1' : '#334155',
  fontSize: '12px',
  fontWeight: 'bold',
  cursor: disabled ? 'default' : 'pointer'
});

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.75)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1300
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '20px',
  width: '92%',
  maxWidth: '860px',
  maxHeight: '92vh',
  overflowY: 'auto'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '18px',
  cursor: 'pointer'
};

const closeBtn: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  marginTop: '12px',
  cursor: 'pointer'
};
