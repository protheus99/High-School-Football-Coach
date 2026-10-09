import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { COLLEGES, CONFERENCES, College, CollegeDivision } from '../data/colleges';
import { CollegeRecruit, TIER_LABELS, collegeBoard } from '../sim/collegeRecruitingEngine';

const DIVISIONS: { id: CollegeDivision; label: string }[] = [
  { id: 'FBS', label: 'FBS' },
  { id: 'FCS', label: 'FCS' },
  { id: 'DIVISION_2', label: 'D-II' },
  { id: 'DIVISION_3', label: 'D-III' }
];

const OFFERS_SHOWN = 12;

const stars = (n: number) => (n > 0 ? '★'.repeat(n) : '—');

/**
 * Every college in the game by division and conference, with the state's juniors and seniors each one offered
 * and the ones committed to it. The coach's own players stand out, and one tap filters to the colleges
 * recruiting them.
 */
export const CollegeDirectory: React.FC = () => {
  const { leagueTeams, userTeamId } = useGameStore();
  const [division, setDivision] = useState<CollegeDivision>('FBS');
  const [mineOnly, setMineOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const board = useMemo(() => collegeBoard(leagueTeams), [leagueTeams]);
  const recruitsMine = (id: string) => board.get(id)?.offers.some((o) => o.team.id === userTeamId) ?? false;

  const conferences = CONFERENCES.filter((conf) => conf.division === division)
    .map((conf) => ({
      conf,
      colleges: COLLEGES.filter((col) => col.conference === conf.id && (!mineOnly || recruitsMine(col.id))).sort((a, b) => b.prestige - a.prestige)
    }))
    .filter((group) => group.colleges.length > 0);

  return (
    <div>
      <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748B' }}>
        {COLLEGES.length} colleges in {CONFERENCES.length} conferences. Tap a college to see the players in the state it offered and who committed.
      </p>
      <div
        className="ui-chip-row"
        style={{
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          marginBottom: '6px'
        }}
      >
        {DIVISIONS.map((d) => (
          <button key={d.id} className="ui-chip" aria-pressed={division === d.id} onClick={() => setDivision(d.id)}>
            {d.label}
          </button>
        ))}
      </div>
      <button
        className="ui-chip"
        aria-pressed={mineOnly}
        onClick={() => setMineOnly(!mineOnly)}
        style={{ width: '100%', minHeight: '40px', marginBottom: '12px' }}
      >
        {mineOnly ? '✓ ' : ''}Only colleges recruiting your players
      </button>

      {conferences.map(({ conf, colleges }) => (
        <section key={conf.id} style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '8px',
              margin: '0 0 6px 2px'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px' }}>{conf.name}</h3>
            <span style={badge}>{conf.short}</span>
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#64748B' }}>{levelLabel(colleges)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {colleges.map((col) => (
              <CollegeRow
                key={col.id}
                college={col}
                entry={board.get(col.id)}
                userTeamId={userTeamId}
                expanded={open === col.id}
                onToggle={() => setOpen(open === col.id ? null : col.id)}
              />
            ))}
          </div>
        </section>
      ))}
      {conferences.length === 0 && <div style={{ color: '#64748B', fontSize: '13px' }}>No colleges at this level are recruiting your players yet.</div>}
    </div>
  );
};

/** "Power 4", "Group of 5", or both for the Independents. */
function levelLabel(colleges: College[]): string {
  return [...new Set(colleges.map((c) => TIER_LABELS[c.tier]))].join(' · ');
}

const CollegeRow: React.FC<{
  college: College;
  entry?: { offers: CollegeRecruit[]; commits: CollegeRecruit[] };
  userTeamId: string | null;
  expanded: boolean;
  onToggle: () => void;
}> = ({ college, entry, userTeamId, expanded, onToggle }) => {
  const [showAll, setShowAll] = useState(false);
  const commits = sortRecruits(entry?.commits ?? [], userTeamId);
  // Offered and still deciding, or committed somewhere else
  const offers = sortRecruits(
    (entry?.offers ?? []).filter((o) => o.player.recruiting.committedCollege !== college.name),
    userTeamId
  );
  const mine = (entry?.offers ?? []).filter((o) => o.team.id === userTeamId).length;
  const shownOffers = showAll ? offers : offers.slice(0, OFFERS_SHOWN);
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderLeft: mine > 0 ? '4px solid #2563EB' : '1px solid #E2E8F0',
        borderRadius: '8px'
      }}
    >
      <button onClick={onToggle} aria-expanded={expanded} style={rowBtn}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>
            {college.name}
            {college.national && (
              <span
                style={{
                  ...badge,
                  marginLeft: '6px',
                  background: '#FEF3C7',
                  color: '#92400E'
                }}
              >
                National
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {college.state} · Prestige {college.prestige}
            {mine > 0 && <span style={{ color: '#1D4ED8', fontWeight: 700 }}> · {mine} of yours</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', flex: '0 0 auto' }}>
          <div
            style={{
              color: commits.length > 0 ? '#15803D' : '#94A3B8',
              fontWeight: 700
            }}
          >
            {commits.length} committed
          </div>
          <div style={{ color: '#475569' }}>{entry?.offers.length ?? 0} offered</div>
        </div>
        <span aria-hidden="true" style={{ color: '#94A3B8', marginLeft: '6px' }}>
          {expanded ? '▴' : '▾'}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: '0 12px 10px' }}>
          <div style={listTitle}>Committed ({commits.length})</div>
          {commits.length === 0 && <div style={empty}>No commitments from the state yet.</div>}
          {commits.map((r) => (
            <RecruitLine key={r.player.id} recruit={r} mine={r.team.id === userTeamId} />
          ))}
          <div style={listTitle}>Offered ({offers.length})</div>
          {offers.length === 0 && <div style={empty}>No other offers in the state.</div>}
          {shownOffers.map((r) => (
            <RecruitLine key={r.player.id} recruit={r} mine={r.team.id === userTeamId} showStatus />
          ))}
          {offers.length > shownOffers.length && (
            <button onClick={() => setShowAll(true)} style={moreBtn}>
              Show all {offers.length} ›
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** Your players first, then by star rating and overall. */
function sortRecruits(list: CollegeRecruit[], userTeamId: string | null): CollegeRecruit[] {
  return [...list].sort(
    (a, b) =>
      Number(b.team.id === userTeamId) - Number(a.team.id === userTeamId) ||
      b.player.recruiting.starRating - a.player.recruiting.starRating ||
      b.player.overallRating - a.player.overallRating
  );
}

const RecruitLine: React.FC<{
  recruit: CollegeRecruit;
  mine: boolean;
  showStatus?: boolean;
}> = ({ recruit, mine, showStatus }) => {
  const { player: p, team, offer } = recruit;
  const r = p.recruiting;
  const status = r.committedCollege ? `Committed to ${r.committedCollege}` : 'Undecided';
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'baseline',
        padding: '5px 6px',
        borderRadius: '6px',
        background: mine ? '#EFF6FF' : undefined,
        fontSize: '13px'
      }}
    >
      <span style={{ fontWeight: 700, flex: '0 0 26px', color: '#475569' }}>{p.position}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div>
          <b>
            {p.firstName[0]}. {p.lastName}
          </b>{' '}
          <span style={{ color: '#B45309' }}>{stars(r.starRating)}</span>
          {offer.tier === 'PWO' && <span style={{ color: '#64748B' }}> · walk-on</span>}
        </div>
        <div style={{ fontSize: '12px', color: mine ? '#1D4ED8' : '#64748B' }}>
          {team.name} · {p.classYear}
          {showStatus && ` · ${status}`}
        </div>
      </div>
    </div>
  );
};

const badge: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  borderRadius: '4px',
  padding: '1px 6px',
  background: '#E2E8F0',
  color: '#334155'
};
const rowBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  minHeight: '52px',
  padding: '8px 12px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  font: 'inherit',
  color: '#0F172A',
  cursor: 'pointer'
};
const listTitle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#475569',
  margin: '8px 0 2px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em'
};
const empty: React.CSSProperties = {
  fontSize: '13px',
  color: '#94A3B8',
  padding: '2px 6px'
};
const moreBtn: React.CSSProperties = {
  minHeight: '40px',
  background: 'none',
  border: 'none',
  color: '#1D4ED8',
  fontWeight: 700,
  fontSize: '13px',
  cursor: 'pointer',
  padding: '0 6px'
};
