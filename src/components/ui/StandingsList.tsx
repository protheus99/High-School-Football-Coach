import React from 'react';
import { DistrictStandingRow } from '../../sim/districtEngine';
import { DataList } from './DataList';

const diff = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const diffColor = (n: number) => (n >= 0 ? '#059669' : '#DC2626');

/**
 * District standings, mobile-first: one compact row per team on phones (seed, school, district record,
 * overall record and capped point differential); a full table on desktop. Playoff spots are shaded.
 */
export const StandingsList: React.FC<{ rows: DistrictStandingRow[]; highlightTeamId?: string; dense?: boolean }> = ({ rows, highlightTeamId, dense }) => (
  <>
    <div className="ui-standings">
      {rows.map((row) => (
        <div
          key={row.teamId}
          className="ui-standings-row"
          style={{ background: row.isPlayoffBound ? '#F0FDF4' : undefined, fontWeight: row.teamId === highlightTeamId ? 'bold' : undefined, minHeight: dense ? '40px' : undefined }}
        >
          <span className="ui-standings-seed" style={{ background: row.isPlayoffBound ? '#16A34A' : '#CBD5E1' }}>
            {row.rank}
          </span>
          <span className="ui-standings-name">{row.name}</span>
          <span className="ui-standings-record">
            <strong>{row.districtRecord}</strong>
            <small>
              {row.overallRecord} · <span style={{ color: diffColor(row.pointDifferential) }}>{diff(row.pointDifferential)}</span>
            </small>
          </span>
        </div>
      ))}
    </div>
    <div className="ui-desktop-only">
      <DataList
        rows={rows}
        rowKey={(r) => r.teamId}
        rowTone={(r) => (r.isPlayoffBound ? '#F0FDF4' : undefined)}
        columns={[
          { key: 'seed', label: 'Seed', render: (r) => <strong>#{r.rank}</strong> },
          { key: 'school', label: 'School', primary: true, render: (r) => <strong>{r.name}</strong> },
          { key: 'district', label: 'District', render: (r) => r.districtRecord },
          { key: 'overall', label: 'Overall', render: (r) => r.overallRecord },
          { key: 'diff', label: 'Diff (capped)', render: (r) => <span style={{ color: diffColor(r.pointDifferential) }}>{diff(r.pointDifferential)}</span> },
          {
            key: 'status',
            label: 'Status',
            render: (r) => (
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: r.isPlayoffBound ? '#16A34A' : '#9CA3AF' }}>{r.isPlayoffBound ? '🏆 Playoff spot' : 'Out'}</span>
            )
          }
        ]}
      />
    </div>
  </>
);
