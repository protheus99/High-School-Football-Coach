import React from 'react';
import { PlayoffBracketState, BracketNode } from '../sim/playoffEngine';

interface PlayoffModalProps {
  bracketState: PlayoffBracketState;
  userTeamId: string;
  onClose: () => void;
  onLaunchPlayoffGame: (node: BracketNode) => void;
}

export const StatePlayoffBracketModal: React.FC<PlayoffModalProps> = ({
  bracketState,
  userTeamId,
  onClose,
  onLaunchPlayoffGame
}) => {
  const { currentRound, bracket, stateChampionTeamId } = bracketState;

  const activeNodes = currentRound === 'BI_DISTRICT' ? bracket.biDistrict.slice(0, 4) :
                      currentRound === 'AREA' ? bracket.area :
                      currentRound === 'REGIONAL' ? bracket.regional : bracket.stateFinal;

  const userMatchup = activeNodes.find((n) => n.team1.id === userTeamId || n.team2.id === userTeamId);

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0F172A' }}>🏆 STATE CHAMPIONSHIP TOURNAMENT</h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>Current Round: {currentRound.replace('_', ' ')}</div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {stateChampionTeamId && (
          <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '16px', margin: '16px 0', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 6px 0', color: '#B45309' }}>👑 STATE CHAMPION CROWNED!</h2>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              Congratulations to the State Champions!
            </div>
          </div>
        )}

        {/* User Game Alert */}
        {userMatchup && !userMatchup.winnerTeamId && (
          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', padding: '14px', borderRadius: '8px', margin: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 'bold', color: '#166534' }}>Your Postseason Matchup is Ready:</div>
              <div style={{ fontSize: '14px', color: '#374151' }}>
                {userMatchup.team1.name} vs. {userMatchup.team2.name}
              </div>
            </div>
            <button
              onClick={() => onLaunchPlayoffGame(userMatchup)}
              style={{ padding: '8px 16px', background: '#16A34A', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              🏈 Play Round
            </button>
          </div>
        )}

        {/* Active Round Matchup Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', margin: '16px 0' }}>
          {activeNodes.map((node) => {
            const isUserGame = node.team1.id === userTeamId || node.team2.id === userTeamId;
            return (
              <div
                key={node.matchupId}
                style={{
                  background: isUserGame ? '#EFF6FF' : '#F8FAFC',
                  border: isUserGame ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: node.winnerTeamId === node.team1.id ? 'bold' : 'normal', color: node.winnerTeamId === node.team1.id ? '#16A34A' : '#1E293B' }}>
                    {node.team1.name}
                  </span>
                  <span style={{ fontWeight: 'bold' }}>{node.team1Score ?? '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: node.winnerTeamId === node.team2.id ? 'bold' : 'normal', color: node.winnerTeamId === node.team2.id ? '#16A34A' : '#1E293B' }}>
                    {node.team2.name}
                  </span>
                  <span style={{ fontWeight: 'bold' }}>{node.team2Score ?? '-'}</span>
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={onClose} style={closeBtn}>Close Bracket</button>
      </div>
    </div>
  );
};

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
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '750px',
  maxHeight: '85vh',
  overflowY: 'auto'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '18px',
  cursor: 'pointer',
  color: '#64748B'
};

const closeBtn: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: '#334155',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer'
};
