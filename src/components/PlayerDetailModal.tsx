import React from 'react';
import { Player } from '../types/game';
import { TIER_LABELS, recruitingStatus, sortedOffers } from '../sim/collegeRecruitingEngine';

interface PlayerDetailModalProps {
  player: Player;
  onClose: () => void;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player, onClose }) => {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0F172A' }}>{player.firstName} {player.lastName}</h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              #{player.position} | {player.classYear} (Age {player.age}) | Overall: <strong style={{ color: '#2563EB' }}>{player.overallRating}</strong> | Potential: <strong>{player.potential}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Ratings Grid */}
        <div style={{ margin: '16px 0' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#334155' }}>Attribute Breakdown</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '12px' }}>
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
            <div style={{ fontSize: '11px', color: '#92400E', marginTop: '6px' }}>Flipped his commitment {player.recruiting.decommitCount}×</div>
          )}
        </div>

        {/* Parent / Family Profile */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', fontSize: '13px' }}>
          <h4 style={{ margin: '0 0 6px 0' }}>Family & Community Dossier</h4>
          <div><strong>Archetype:</strong> {player.parent.archetype.replace('_', ' ')}</div>
          <div><strong>Parent Sentiment:</strong> {player.parent.sentiment}% | <strong>Booster Donor:</strong> {player.parent.isBoosterDonor ? 'Yes (Major Contributor)' : 'No'}</div>
        </div>
      </div>
    </div>
  );
};

const AttrCard: React.FC<{ label: string; val: number }> = ({ label, val }) => (
  <div style={{ background: '#F1F5F9', padding: '6px', borderRadius: '4px', textAlign: 'center' }}>
    <div style={{ color: '#64748B', fontSize: '11px' }}>{label}</div>
    <div style={{ fontWeight: 'bold', color: val >= 80 ? '#16A34A' : val >= 65 ? '#2563EB' : '#475569' }}>{val}</div>
  </div>
);

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1250
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '20px',
  width: '90%',
  maxWidth: '540px',
  maxHeight: '85vh',
  overflowY: 'auto'
};
