import React from 'react';
import { useGameStore } from '../store/gameStore';
import { PRACTICE_OPTIONS } from '../sim/training';
import { PracticePicker } from './PracticePicker';

const PHASES: [string, string][] = [
  ['Pre Season, Training Camp, Off Season', '2×'],
  ['Regular season (non district and district)', '1×'],
  ['Playoffs', '0.5×'],
  ['Post Season', 'No training']
];

/**
 * Practice plan (Team › Practice): the week's intensity, what each option would do, and last week's results.
 * Every healthy player trains the same way; the time of year multiplies both the gains and the practice load.
 */
export const PracticePlan: React.FC = () => {
  const { lastTrainingReport: report } = useGameStore();

  return (
    <div>
      <p className="ui-muted" style={{ margin: '0 0 12px 0' }}>
        Practice builds your players' key skills, one point at a time (+1 to each of a player's key skills adds +1 overall). Harder practice builds
        more, but players tire and can get hurt.
      </p>

      <h3 style={sectionTitle}>This week</h3>
      <PracticePicker />

      <h3 style={sectionTitle}>Last week&apos;s practice</h3>
      {report ? (
        <div style={{ fontSize: '14px', color: '#334155' }}>
          <div>
            {PRACTICE_OPTIONS.find((o) => o.id === report.intensity)?.label} ({report.multiplier}×): <b>+{report.skillPoints}</b> skill points
            {report.overallGains > 0 ? `, ${report.overallGains} overall` : ''}
            {report.injured.length > 0 ? ` · ${report.injured.length} hurt in practice` : ''}
          </div>
          {report.improved.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {report.improved.slice(0, 8).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {report.injured.length > 0 && <div style={{ marginTop: '6px', color: '#B91C1C' }}>Hurt in practice: {report.injured.join(', ')}</div>}
        </div>
      ) : (
        <div className="ui-muted">No practice report yet. It comes in when the week advances.</div>
      )}

      <h3 style={sectionTitle}>Time of year</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#334155' }}>
        <tbody>
          {PHASES.map(([label, mult]) => (
            <tr key={label}>
              <td style={{ padding: '5px 0', borderTop: '1px solid #E2E8F0' }}>{label}</td>
              <td style={{ padding: '5px 0', borderTop: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 700 }}>{mult}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ui-muted" style={{ fontSize: '12px', margin: '6px 0 0' }}>
        The multiplier applies to skill gain and practice fatigue alike.
      </p>
    </div>
  );
};

const sectionTitle: React.CSSProperties = { margin: '18px 0 8px 0', color: '#334155', fontSize: '15px' };
