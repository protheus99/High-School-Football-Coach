import React from 'react';
import { DESKTOP_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';

export interface DataColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  /** The row's headline on phone cards (usually the name). */
  primary?: boolean;
  /** Shown at the top-right of phone cards (rank, score…). */
  badge?: boolean;
  /** Left out of phone cards to keep them short. */
  desktopOnly?: boolean;
  align?: 'left' | 'center' | 'right';
}

/**
 * Mobile-first data list: each row is a tappable card on phones (headline, badge, then label/value pairs);
 * on desktop the same data is a table.
 */
export function DataList<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowTone,
  empty = 'Nothing to show.'
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Background for highlighted rows (your team, playoff spots…). */
  rowTone?: (row: T) => string | undefined;
  empty?: string;
}) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  if (rows.length === 0) return <div className="ui-muted">{empty}</div>;

  if (!isDesktop) {
    const primary = columns.find((c) => c.primary);
    const badge = columns.find((c) => c.badge);
    const details = columns.filter((c) => !c.primary && !c.badge && !c.desktopOnly);
    return (
      <div className="ui-cardlist">
        {rows.map((row) => {
          const content = (
            <>
              <div className="ui-card-head">
                <div className="ui-card-title">{primary?.render(row)}</div>
                {badge && <div className="ui-card-badge">{badge.render(row)}</div>}
              </div>
              <dl className="ui-card-pairs">
                {details.map((c) => (
                  <div key={c.key}>
                    <dt>{c.label}</dt>
                    <dd>{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );
          const style = { background: rowTone?.(row) };
          return onRowClick ? (
            <button key={rowKey(row)} className="ui-card ui-card-button" style={style} onClick={() => onRowClick(row)}>
              {content}
            </button>
          ) : (
            <div key={rowKey(row)} className="ui-card" style={style}>
              {content}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ background: rowTone?.(row), cursor: onRowClick ? 'pointer' : undefined }}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
