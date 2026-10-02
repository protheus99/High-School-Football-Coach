import React, { useState } from 'react';
import { BracketNode, PlayoffBracketState, ROUND_LABELS, findUserNode, userDivisionIndex } from '../sim/playoffEngine';
import { Team } from '../types/game';
import { Sheet } from './ui/Sheet';

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
    <Sheet
      title="🏆 State Playoffs"
      subtitle={`${bracketState.championshipTitle ?? 'State Playoffs'}${isPlayoffsActive ? ` · This week: ${ROUND_LABELS[roundNames[currentRoundIndex]]}` : ' · Complete'}`}
      onClose={onClose}
      width="wide"
    >
      {divisions.map((d) => {
        const champ = champion(d);
        return champ ? (
          <div key={d.name} style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '10px', padding: '12px', marginBottom: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#92400E', fontWeight: 'bold' }}>👑 {divisions.length > 1 ? `${d.name} ` : ''}State Champion</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {champ.name} {champ.mascot}
            </div>
            {bracketState.championshipVenue && <div style={{ fontSize: '12px', color: '#92400E' }}>Crowned at {bracketState.championshipVenue}</div>}
          </div>
        ) : null;
      })}

      <div style={{ background: '#F1F5F9', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', fontSize: '14px', color: '#334155' }}>{userStatus}</div>

      {divisions.length > 1 && (
        <div className="ui-chips" style={{ marginBottom: '8px' }} role="group" aria-label="Division">
          {divisions.map((d, i) => (
            <button key={d.name} className="ui-chip" aria-pressed={i === divisionIndex} onClick={() => setDivisionIndex(i)}>
              {d.name}
              {i === userDivision ? ' ★' : ''}
            </button>
          ))}
        </div>
      )}

      <div className="ui-chips" style={{ marginBottom: '12px' }} role="group" aria-label="Round">
        {roundNames.map((round, i) => (
          <button key={round} className="ui-chip" aria-pressed={i === roundIndex} disabled={!division.rounds[i]} onClick={() => setRoundIndex(i)}>
            {ROUND_LABELS[round]}
          </button>
        ))}
      </div>

      {groups.map((group, g) => (
        <div key={`${group.label}_${g}`} style={{ marginBottom: '12px' }}>
          {group.label && <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', margin: '4px 0 6px' }}>{group.label}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
            {group.games.map((node) => (
              <div
                key={node.matchupId}
                style={{
                  background: involvesUser(node) ? '#EFF6FF' : '#F8FAFC',
                  border: involvesUser(node) ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '14px'
                }}
              >
                {[node.team1, node.team2].map((team, i) => {
                  const score = i === 0 ? node.team1Score : node.team2Score;
                  const won = node.winnerTeamId === team.id;
                  return (
                    <div key={team.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: i === 0 ? '4px' : 0, flexWrap: 'nowrap' }}>
                      <span style={{ fontWeight: won ? 'bold' : 'normal', color: won ? '#16A34A' : node.winnerTeamId ? '#94A3B8' : '#1E293B', minWidth: 0 }}>
                        {team.name}{' '}
                        <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                          ({team.record.wins}-{team.record.losses})
                        </span>
                      </span>
                      <span style={{ fontWeight: 'bold' }}>{score ?? '–'}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
};
