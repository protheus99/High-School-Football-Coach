import React from 'react';
import { Player } from '../types/game';
import { Sheet } from './ui/Sheet';
import { TIER_LABELS, recruitingStatus, sortedOffers } from '../sim/collegeRecruitingEngine';

interface PlayerDetailModalProps {
  player: Player;
  onClose: () => void;
  isOwnPlayer: boolean; // ratings, attributes and family info are only visible for your own players
  teamName?: string;
}

/** Season stat lines worth showing for this player (non-zero categories only). */
function seasonStatLines(p: Player): [string, string][] {
  const s = p.stats;
  const lines: [string, string][] = [['Games', `${s.gamesPlayed}`]];
  if (s.passAttempts > 0)
    lines.push(['Passing', `${s.passCompletions}/${s.passAttempts}, ${s.passYards} yds, ${s.passTDs} TD, ${s.interceptionsThrown} INT`]);
  if (s.rushAttempts > 0) lines.push(['Rushing', `${s.rushAttempts} car, ${s.rushYards} yds, ${s.rushTDs} TD`]);
  if (s.receptions > 0) lines.push(['Receiving', `${s.receptions} rec, ${s.receivingYards} yds, ${s.receivingTDs} TD`]);
  if (s.tackles + s.sacks + s.interceptionsCaught > 0)
    lines.push(['Defense', `${s.tackles} tkl, ${s.tacklesForLoss} TFL, ${s.sacks} sacks, ${s.interceptionsCaught} INT`]);
  if (s.fieldGoalsAttempted > 0) lines.push(['Kicking', `${s.fieldGoalsMade}/${s.fieldGoalsAttempted} FG`]);
  if (s.fumblesLost > 0) lines.push(['Fumbles lost', `${s.fumblesLost}`]);
  return lines;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player, onClose, isOwnPlayer, teamName }) => {
  return (
    <Sheet
      title={`${player.firstName} ${player.lastName}`}
      subtitle={
        <>
          {player.position} · {player.classYear} (age {player.age}){teamName && ` · ${teamName}`}
          {isOwnPlayer && (
            <>
              {' '}
              · <strong style={{ color: '#2563EB' }}>{player.overallRating} OVR</strong> · Potential <strong>{player.potential}</strong>
            </>
          )}
        </>
      }
      onClose={onClose}
    >
      {/* Season stats (public) */}
      <div style={{ margin: '16px 0' }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#334155' }}>Season Stats</h4>
        <div style={{ fontSize: '13px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
          {seasonStatLines(player).map(([label, value]) => (
            <React.Fragment key={label}>
              <span style={{ color: '#64748B' }}>{label}</span>
              <span>{value}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {!isOwnPlayer && (
        <div
          style={{
            fontSize: '12px',
            color: '#64748B',
            background: '#F8FAFC',
            border: '1px dashed #CBD5E1',
            borderRadius: '6px',
            padding: '8px 10px',
            marginBottom: '16px'
          }}
        >
          🔒 Ratings and attributes are only visible for players on your own roster.
        </div>
      )}

      {/* Ratings Grid (own players only) */}
      {isOwnPlayer && (
        <div style={{ margin: '16px 0' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#334155' }}>Attribute Breakdown</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px', fontSize: '12px' }}>
            <AttrCard label="Speed" val={player.attributes.speed} />
            <AttrCard label="Strength" val={player.attributes.strength} />
            <AttrCard label="Agility" val={player.attributes.agility} />
            <AttrCard label="Stamina" val={player.attributes.stamina} />
            <AttrCard label="Football IQ" val={player.attributes.footballIQ} />
            <AttrCard label="Discipline" val={player.attributes.discipline} />
            <AttrCard label="Leadership" val={player.attributes.leadership} />
            <AttrCard label="Clutch" val={player.attributes.clutch} />
          </div>
        </div>
      )}

      {/* College Recruiting & Offer Sheet */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h4 style={{ margin: 0 }}>Collegiate Offer Sheet ({player.recruiting.starRating}★ Prospect)</h4>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: recruitingStatus(player).color }}>{recruitingStatus(player).label}</span>
        </div>
        {player.recruiting.offers.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {sortedOffers(player).map((offer) => {
              const committed = offer.collegeName === player.recruiting.committedCollege;
              return (
                <div
                  key={offer.collegeName}
                  style={{
                    background: committed ? '#DCFCE7' : '#EFF6FF',
                    border: `1px solid ${committed ? '#86EFAC' : '#BFDBFE'}`,
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: committed ? '#166534' : '#1E40AF'
                  }}
                >
                  {committed ? '✅' : '🎓'} {offer.collegeName} ({TIER_LABELS[offer.tier]})
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#64748B' }}>No formal scholarship offers yet. Perform well on Friday nights!</div>
        )}
        {(player.recruiting.decommitCount ?? 0) > 0 && (
          <div style={{ fontSize: '12px', color: '#92400E', marginTop: '6px' }}>Flipped his commitment {player.recruiting.decommitCount}×</div>
        )}
      </div>

      {/* Parent / Family Profile (own players only) */}
      {isOwnPlayer && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', fontSize: '13px' }}>
          <h4 style={{ margin: '0 0 6px 0' }}>Family & Community Dossier</h4>
          <div>
            <strong>Archetype:</strong> {player.parent.archetype.replace('_', ' ')}
          </div>
          <div>
            <strong>Parent Sentiment:</strong> {player.parent.sentiment}% | <strong>Booster Donor:</strong>{' '}
            {player.parent.isBoosterDonor ? 'Yes (Major Contributor)' : 'No'}
          </div>
        </div>
      )}
    </Sheet>
  );
};

const AttrCard: React.FC<{ label: string; val: number }> = ({ label, val }) => (
  <div style={{ background: '#F1F5F9', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
    <div style={{ color: '#64748B', fontSize: '12px' }}>{label}</div>
    <div style={{ fontWeight: 'bold', fontSize: '16px', color: val >= 80 ? '#16A34A' : val >= 65 ? '#2563EB' : '#475569' }}>{val}</div>
  </div>
);
