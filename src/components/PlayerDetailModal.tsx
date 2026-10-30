import React from 'react';
import { DepthChartTier, Player } from '../types/game';
import { Sheet } from './ui/Sheet';
import { formatPercent } from '../utils/format';
import { TIER_LABELS, recruitingStatus, sortedOffers } from '../sim/collegeRecruitingEngine';
import { careerTotals, positionStatLines } from '../sim/playerStats';
import { rulesForState } from '../sim/stateRules';
import { useGameStore } from '../store/gameStore';
import { PlayerTrouble, STRING_LABELS, fullName, playerTrouble, starsLabel } from '../utils/playerFormat';
import { FatigueNote, LockedTile, OvrTile, PosChip, PotentialGrade } from './ui/PlayerRow';

interface PlayerDetailModalProps {
  player: Player;
  onClose: () => void;
  isOwnPlayer: boolean; // ratings, condition, grades and family are only visible for your own players
  teamName?: string;
  onSetString?: (tier: DepthChartTier) => void; // your own player: move him on the depth chart
  onOpenRecruiting?: () => void; // your own junior or senior: his page in College recruiting
}

const stars = (n: number) => (n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : 'Unrated');

/** The trouble banner: what it means for Friday. */
const troubleBanner = (p: Player, t: PlayerTrouble) => {
  const weeks = p.condition.injuryWeeksRemaining;
  const games = `${weeks} ${weeks === 1 ? 'game' : 'games'}`;
  switch (t.kind) {
    case 'INELIGIBLE':
      return `${t.icon} Ineligible: GPA ${p.academics.gpa.toFixed(2)}. He sits until his grades recover.`;
    case 'SUSPENDED':
      return `${t.icon} Suspended for ${games}. The next man up plays.`;
    case 'SEASON_ENDING':
      return `${t.icon} Out for the season.`;
    case 'INJURED':
      return `${t.icon} Injured: out ${weeks} ${weeks === 1 ? 'week' : 'weeks'}. The next man up plays.`;
    case 'GPA_RISK':
      return `${t.icon} GPA ${p.academics.gpa.toFixed(2)}: close to the line. Still eligible.`;
  }
};

/**
 * The player card, the same from every screen (depth chart, roster, leaders, other teams' pages, feeders): who he
 * is, his stars and potential, how he is holding up (stamina, fatigue, grades, eligibility), his stats for his position
 * this season and over his career, and his college recruiting. Your own players add their ratings, the depth chart
 * controls and their family; other teams' players show only what's public.
 */
export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player: p, onClose, isOwnPlayer, teamName, onSetString, onOpenRecruiting }) => {
  const userState = useGameStore((s) => s.districtTeams.find((t) => t.id === s.userTeamId)?.state);
  const trouble = isOwnPlayer ? playerTrouble(p, rulesForState(userState).academics.atRiskGpa) : null;
  const status = recruitingStatus(p);
  const offers = sortedOffers(p);
  const career = careerTotals(p);
  const hasHistory = !!p.careerStats && p.careerStats.gamesPlayed > 0;

  return (
    <Sheet
      title={
        <span className="pl-head">
          {isOwnPlayer ? <OvrTile ovr={p.overallRating} large /> : <LockedTile />}
          <span style={{ minWidth: 0 }}>
            <span className="pl-line1" style={{ flexWrap: 'wrap' }}>
              <PosChip pos={p.position} />
              <span className="pl-name">{fullName(p)}</span>
              {p.recruiting.starRating > 0 && <span className="pl-stars">{starsLabel(p.recruiting.starRating)}</span>}
            </span>
            <span className="pl-head-meta">
              {p.classYear}
              {isOwnPlayer && (
                <>
                  {' · '}
                  {STRING_LABELS[p.depthChartTier]}
                  {' · '}
                  <PotentialGrade grade={p.potential} />
                </>
              )}
            </span>
            {teamName && <span className="pl-head-meta">{teamName}</span>}
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <button className="ui-btn ui-btn-primary ui-btn-block" onClick={onClose}>
          Done
        </button>
      }
    >
      {/* Trouble in plain words: what it means for Friday */}
      {trouble && <div className={`pl-banner ${trouble.tone === 'out' ? 'pl-chip-out' : 'pl-chip-warn'}`}>{troubleBanner(p, trouble)}</div>}

      {isOwnPlayer ? (
        <>
          <dl className="ui-card-pairs" style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', margin: '0 0 12px' }}>
            <div>
              <dt>Stamina</dt>
              <dd>{formatPercent(p.condition.inGameStamina)}</dd>
            </div>
            <div>
              <dt>Fatigue</dt>
              <dd>
                <FatigueNote fatigue={p.condition.seasonWear} />
              </dd>
            </div>
            <div>
              <dt>GPA</dt>
              <dd>{p.academics.gpa.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Stars</dt>
              <dd>{stars(p.recruiting.starRating)}</dd>
            </div>
          </dl>

          {onSetString && (
            <>
              <h3 style={sectionTitle}>Depth chart</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '14px' }}>
                {([1, 2, 3] as const).map((tier) => (
                  <button
                    key={tier}
                    className={`ui-btn${p.depthChartTier === tier ? ' ui-btn-primary' : ''}`}
                    onClick={() => onSetString(tier)}
                    aria-pressed={p.depthChartTier === tier}
                  >
                    {STRING_LABELS[tier]}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div style={lockNote}>🔒 Ratings, condition and grades are only visible for players on your own roster.</div>
      )}

      {/* Stats for his position: this season and career */}
      <h3 style={sectionTitle}>This season</h3>
      <StatLines lines={positionStatLines(p.position, p.stats)} />
      <h3 style={sectionTitle}>Career{hasHistory ? '' : ' (first season)'}</h3>
      <StatLines lines={positionStatLines(p.position, career)} />

      {/* College recruiting */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', margin: '14px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>College recruiting</h3>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: status.color, textAlign: 'right' }}>{status.label}</span>
        </div>
        {offers.length > 0 ? (
          <div style={{ fontSize: '13px', color: '#334155' }}>
            {offers.length} {offers.length === 1 ? 'offer' : 'offers'}:{' '}
            {offers
              .slice(0, 3)
              .map((o) => `${o.collegeName} (${TIER_LABELS[o.tier]})`)
              .join(', ')}
            {offers.length > 3 && `, +${offers.length - 3} more`}
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#475569' }}>No scholarship offers yet.</div>
        )}
        {(p.recruiting.decommitCount ?? 0) > 0 && <div style={{ fontSize: '12px', color: '#92400E', marginTop: '4px' }}>Flipped his commitment {p.recruiting.decommitCount}×</div>}
        {onOpenRecruiting && (
          <button className="ui-btn ui-btn-block" style={{ marginTop: '10px' }} onClick={onOpenRecruiting}>
            Recruiting details →
          </button>
        )}
      </div>

      {isOwnPlayer && (
        <>
          <h3 style={sectionTitle}>Attributes</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', fontSize: '12px', marginBottom: '14px' }}>
            <AttrCard label="Speed" val={p.attributes.speed} />
            <AttrCard label="Strength" val={p.attributes.strength} />
            <AttrCard label="Agility" val={p.attributes.agility} />
            <AttrCard label="Stamina" val={p.attributes.stamina} />
            <AttrCard label="IQ" val={p.attributes.footballIQ} />
            <AttrCard label="Discipline" val={p.attributes.discipline} />
            <AttrCard label="Leadership" val={p.attributes.leadership} />
            <AttrCard label="Clutch" val={p.attributes.clutch} />
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', fontSize: '13px' }}>
            <h3 style={{ ...sectionTitle, marginTop: 0 }}>Family</h3>
            <div>
              {p.parent.archetype.replace('_', ' ').toLowerCase()} · parent sentiment {p.parent.sentiment}%{p.parent.isBoosterDonor ? ' · booster donor' : ''}
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
};

const StatLines: React.FC<{ lines: [string, string][] }> = ({ lines }) => (
  <div style={{ fontSize: '13px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginBottom: '10px' }}>
    {lines.map(([label, value]) => (
      <React.Fragment key={label}>
        <span style={{ color: '#475569' }}>{label}</span>
        <span>{value}</span>
      </React.Fragment>
    ))}
  </div>
);

const AttrCard: React.FC<{ label: string; val: number }> = ({ label, val }) => (
  <div style={{ background: '#F1F5F9', padding: '6px 4px', borderRadius: '8px', textAlign: 'center' }}>
    <div style={{ color: '#475569', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    <div style={{ fontWeight: 'bold', fontSize: '15px', color: val >= 80 ? '#15803D' : val >= 65 ? '#2563EB' : '#475569' }}>{val}</div>
  </div>
);

const sectionTitle: React.CSSProperties = { margin: '0 0 6px 0', fontSize: '15px', color: '#334155' };

const lockNote: React.CSSProperties = {
  fontSize: '12px',
  color: '#475569',
  background: '#F8FAFC',
  border: '1px dashed #CBD5E1',
  borderRadius: '8px',
  padding: '8px 10px',
  marginBottom: '12px'
};
