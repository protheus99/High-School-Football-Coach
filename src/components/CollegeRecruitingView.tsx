import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { collegeActionCost } from '../sim/coachPoints';
import { Player, Team } from '../types/game';
import { DataList } from './ui/DataList';
import {
  CAMP_WEEKS,
  COLLEGE_ACTION_COSTS,
  CollegeAction,
  TIER_LABELS,
  baselineVisibility,
  collegeActionBlocker,
  isDivisionOne,
  recruitScore,
  recruitingStatus,
  sortedOffers
} from '../sim/collegeRecruitingEngine';

const ACTIONS: {
  action: CollegeAction;
  label: string;
  color: string;
  help: string;
}[] = [
  {
    action: 'FILM',
    label: 'Send Film',
    color: '#2563EB',
    help: 'Send a highlight film to college staffs: +15 exposure, once a year.'
  },
  {
    action: 'CALL',
    label: 'Call Coaches',
    color: '#7C3AED',
    help: 'Call college coaches on his behalf: more exposure (less each call) and an immediate look.'
  },
  {
    action: 'CAMP',
    label: 'Take to Camp',
    color: '#D97706',
    help: `Take him to a summer camp (weeks 1-${CAMP_WEEKS}): +20 exposure, a chance to impress evaluators, and an immediate look.`
  }
];

/** Star rating first (specialists are capped), then evaluation. */
const byStock = (a: Player, b: Player) => b.recruiting.starRating - a.recruiting.starRating || recruitScore(b) - recruitScore(a);

const stars = (n: number) => (n > 0 ? '★'.repeat(n) : '—');

export const CollegeRecruitingView: React.FC = () => {
  const { leagueTeams, userTeamId, coachPoints, currentWeek, currentYear, collegeRecruitAction } = useGameStore();
  const [message, setMessage] = useState<{
    text: string;
    good: boolean;
  } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const userTeam = leagueTeams.find((t) => t.id === userTeamId);

  const recruits = useMemo(
    () =>
      // leagueTeams is replaced after every action, so the list refreshes with it
      (leagueTeams.find((t) => t.id === userTeamId)?.roster ?? []).filter((p) => p.classYear === 'Senior' || p.classYear === 'Junior').sort(byStock),
    [leagueTeams, userTeamId]
  );

  const statewide = useMemo(
    () =>
      leagueTeams
        .flatMap((team) => team.roster.filter((p) => p.classYear === 'Senior').map((player) => ({ player, team })))
        .sort((a, b) => byStock(a.player, b.player))
        .slice(0, 25),
    [leagueTeams]
  );

  if (!userTeam) return null;

  const committed = recruits.filter((p) => p.recruiting.committedCollege).length;
  const d1Offers = recruits.filter((p) => p.recruiting.offers.some((o) => isDivisionOne(o.tier))).length;

  const act = (player: Player, action: CollegeAction) => {
    const result = collegeRecruitAction(player.id, action);
    setMessage({ text: result.message, good: result.ok });
  };

  return (
    <div className="ui-screen">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '12px'
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>🎓 College Recruiting</h2>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: '13px',
              color: '#64748B',
              maxWidth: '640px'
            }}
          >
            Colleges evaluate juniors and seniors all season: rating, potential, production and position all matter. Your job is to get your players
            seen. Seniors commit during the year (better offers can flip them) and sign at the banquet.
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 'bold',
            flexWrap: 'wrap'
          }}
        >
          <span style={pill('#EEF2FF', '#3730A3')}>₡{coachPoints}</span>
          <span style={pill('#ECFDF5', '#065F46')}>Committed: {committed}</span>
          <span style={pill('#EFF6FF', '#1E40AF')}>With D-I offers: {d1Offers}</span>
          <span style={pill(currentWeek <= CAMP_WEEKS ? '#FEF3C7' : '#F1F5F9', currentWeek <= CAMP_WEEKS ? '#92400E' : '#64748B')}>
            {currentWeek <= CAMP_WEEKS ? `Camp season (through week ${CAMP_WEEKS})` : 'Camps closed'}
          </span>
        </div>
      </div>

      {message && (
        <div
          style={{
            background: message.good ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${message.good ? '#A7F3D0' : '#FECACA'}`,
            color: message.good ? '#065F46' : '#991B1B',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '12px'
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {recruits.map((p) => (
          <RecruitRow
            key={p.id}
            player={p}
            team={userTeam}
            week={currentWeek}
            year={currentYear}
            coachPoints={coachPoints}
            expanded={expanded === p.id}
            onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
            onAction={(a) => act(p, a)}
          />
        ))}
        {recruits.length === 0 && <div style={{ color: '#64748B', fontSize: '13px' }}>No juniors or seniors on the roster.</div>}
      </div>

      <h3 style={{ margin: '24px 0 6px 0', fontSize: '15px' }}>Top Senior Recruits in the State</h3>
      <DataList
        rows={statewide.map((row, i) => ({ ...row, rank: i + 1 }))}
        rowKey={(r) => r.player.id}
        rowTone={(r) => (r.team.id === userTeamId ? '#EFF6FF' : undefined)}
        columns={[
          { key: 'rank', label: '#', badge: true, render: (r) => `#${r.rank}` },
          {
            key: 'player',
            label: 'Player',
            primary: true,
            render: (r) => (
              <>
                {r.player.firstName} {r.player.lastName} <span style={{ color: '#64748B', fontWeight: 'normal', fontSize: '13px' }}>{r.player.position}</span>
              </>
            )
          },
          { key: 'school', label: 'School', render: (r) => r.team.name },
          { key: 'stars', label: 'Stars', render: (r) => <span style={{ color: '#D97706' }}>{stars(r.player.recruiting.starRating)}</span> },
          {
            key: 'status',
            label: 'Status',
            render: (r) => {
              const status = recruitingStatus(r.player);
              return <span style={{ color: status.color, fontWeight: 'bold' }}>{status.label}</span>;
            }
          }
        ]}
      />
    </div>
  );
};

const RecruitRow: React.FC<{
  player: Player;
  team: Team;
  week: number;
  year: number;
  coachPoints: number;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: CollegeAction) => void;
}> = ({ player: p, team, week, year, coachPoints, expanded, onToggle, onAction }) => {
  const coachTalents = useGameStore((s) => s.coachTalents);
  const r = p.recruiting;
  const status = recruitingStatus(p);
  const exposure = Math.round(r.visibility ?? baselineVisibility(team));
  const offers = sortedOffers(p, year);
  const top = offers[0];
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        padding: '10px 12px'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ minWidth: '220px' }}>
          <div>
            <strong>
              {p.firstName} {p.lastName}
            </strong>{' '}
            <span style={{ color: '#64748B', fontSize: '12px' }}>
              {p.position} · {p.classYear} · {p.overallRating} OVR · GPA {p.academics.gpa.toFixed(1)}
            </span>
          </div>
          <div style={{ fontSize: '12px' }}>
            <span style={{ color: '#D97706', fontWeight: 'bold' }}>{stars(r.starRating)}</span>
            <span
              style={{
                color: status.color,
                fontWeight: 'bold',
                marginLeft: '8px'
              }}
            >
              {status.label}
            </span>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: '#475569', minWidth: '140px' }}>
          Exposure {exposure}
          <div
            style={{
              height: '6px',
              background: '#E2E8F0',
              borderRadius: '3px',
              marginTop: '3px'
            }}
          >
            <div
              style={{
                width: `${exposure}%`,
                height: '100%',
                background: '#2563EB',
                borderRadius: '3px'
              }}
            />
          </div>
          {top && !r.committedCollege && <div style={{ marginTop: '3px' }}>Top offer: {top.collegeName}</div>}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {ACTIONS.map(({ action, label, color, help }) => {
            const cost = collegeActionCost(COLLEGE_ACTION_COSTS[action], coachTalents);
            const blocker = collegeActionBlocker(p, action, week, year) ?? (coachPoints < cost ? 'Not enough Coach Points' : null);
            return (
              <button key={action} onClick={() => onAction(action)} disabled={!!blocker} title={blocker ?? help} style={btn(color, !!blocker)}>
                {label} (₡{cost})
              </button>
            );
          })}
          {offers.length > 0 && (
            <button onClick={onToggle} style={btn('#475569', false)}>
              {expanded ? 'Hide' : 'Offers'}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginTop: '8px'
          }}
        >
          {offers.map((o) => {
            const isCommit = o.collegeName === r.committedCollege;
            return (
              <span
                key={o.collegeName}
                style={{
                  fontSize: '12px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: isCommit ? '#DCFCE7' : '#EFF6FF',
                  color: isCommit ? '#166534' : '#1E40AF',
                  border: `1px solid ${isCommit ? '#86EFAC' : '#BFDBFE'}`
                }}
              >
                {isCommit ? '✅ ' : ''}
                {o.collegeName} · {TIER_LABELS[o.tier]} · wk {o.offerDateWeek}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

const pill = (background: string, color: string): React.CSSProperties => ({
  background,
  color,
  padding: '5px 12px',
  borderRadius: '6px'
});
const btn = (color: string, disabled: boolean): React.CSSProperties => ({
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
